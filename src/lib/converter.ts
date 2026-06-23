import fs from "node:fs/promises";
import path from "node:path";
import { extractPagesFromPdf, probePdf } from "./pdfText";
import {
  encJsonPath,
  writeEncryptedFile,
  withDecryptedTempFile,
  tmpDir,
  deleteIfExists,
} from "./storage";
import type { ConvertDiagnostics } from "@/types/job";

export type ConverterEngine =
  | "opendataloader-pdf"
  | "opendataloader-pdf-hybrid"
  | "pdfjs-fallback";

export interface ConvertResult {
  jsonPath: string;
  engine: ConverterEngine;
  fallbackReason: string | null;
  diagnostics: ConvertDiagnostics;
}

interface ClassifiedError {
  summary: string;
  detail: string;
}

/** opendataloader hybrid 백엔드 설정 — 환경변수로 주입 */
interface HybridConfig {
  enabled: boolean;
  backend: string;
  url?: string;
  timeoutMs: number;
}

function getHybridConfig(): HybridConfig {
  const url = process.env.COMPASS_HYBRID_URL?.trim();
  return {
    enabled: !!url,
    backend: process.env.COMPASS_HYBRID_BACKEND?.trim() || "docling-fast",
    url,
    timeoutMs: Number(process.env.COMPASS_HYBRID_TIMEOUT_MS) || 180_000,
  };
}

function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    if (!s) return String(v);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  } catch {
    return String(v);
  }
}

function classifyError(err: unknown): ClassifiedError {
  if (!(err instanceof Error)) {
    return { summary: "알 수 없는 오류", detail: String(err) };
  }
  const e = err as Error & { code?: string; path?: string; stderr?: string };
  const msg = e.message || "";
  const code = e.code || "";
  const hay = `${msg} ${code} ${e.stderr ?? ""}`;

  if (
    /ENOENT/.test(hay) &&
    /\bjava\b/i.test(hay) &&
    !/\.(pdf|json)$/i.test(e.path ?? "")
  ) {
    return {
      summary: "Java 런타임(JRE) 미설치 — opendataloader-pdf 호출 실패",
      detail: msg,
    };
  }
  if (/java: command not found|'java'.*not recognized/i.test(hay)) {
    return { summary: "PATH에 java 명령이 없습니다. JRE 11+ 설치 필요", detail: msg };
  }
  if (/UnsupportedClassVersionError|class file version/i.test(hay)) {
    return { summary: "Java 버전이 낮습니다 — JRE 11+ 필요", detail: msg };
  }
  if (/Cannot find module .*@opendataloader\/pdf/i.test(hay)) {
    return {
      summary: "@opendataloader/pdf 패키지를 찾지 못했습니다 — npm install 필요",
      detail: msg,
    };
  }
  if (/ETIMEDOUT|timeout/i.test(hay)) {
    return { summary: "JVM 실행 시간 초과", detail: msg };
  }
  return { summary: "opendataloader-pdf 실행 실패", detail: msg || String(err) };
}

type HybridMode = "off" | "auto" | "full";

/**
 * 변환 흐름 (암호화 저장 대응):
 *   - 입력 PDF 는 암호문(encPdfPath). 처리 동안만 임시 평문으로 풀어 엔진에 넘긴다.
 *   - 산출 JSON 도 임시 평문으로 받은 뒤 즉시 암호화(encJsonPath)하고 평문 임시본은 삭제.
 *   - 엔진 선택 흐름(opendataloader → hybrid OCR → pdfjs 폴백)은 기존과 동일.
 */
export async function convertPdfToJson(
  encryptedPdfPath: string,
  id: string
): Promise<ConvertResult> {
  const hybrid = getHybridConfig();
  const logName = `${id.slice(0, 8)}.pdf`; // 로그에 수험번호 노출 금지

  const diag: ConvertDiagnostics = {
    pdf: null,
    structTree: true,
    hybridMode: hybrid.enabled ? "auto" : "off",
    outputFile: null,
    textLength: null,
    nodeTypes: null,
    notes: [],
  };

  return withDecryptedTempFile(encryptedPdfPath, ".pdf", async (pdfPath) => {
    // ── 사전 프로빙
    try {
      diag.pdf = await probePdf(pdfPath);
      console.log(
        `[converter] ${logName} probe → pages=${diag.pdf.pageCount} ` +
          `encrypted=${diag.pdf.encrypted} textLayer=${diag.pdf.hasTextLayer} ` +
          `producer=${JSON.stringify(diag.pdf.producer)}`
      );
      if (diag.pdf.encrypted) diag.notes.push("PDF 암호화/보호로 파싱 실패 가능");
      if (diag.pdf.hasTextLayer === false)
        diag.notes.push("텍스트 레이어 없음 — 스캔/이미지 PDF 의심(OCR 필요)");
    } catch (e) {
      diag.notes.push(`probe 실패: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── Phase 1: opendataloader (hybrid auto if configured)
    try {
      const initialMode: HybridMode = hybrid.enabled ? "auto" : "off";
      diag.hybridMode = initialMode;
      const { plaintextJson, outputFile, convertReturn } =
        await runOpenDataLoader(pdfPath, initialMode, hybrid);
      diag.outputFile = outputFile;
      if (convertReturn != null) diag.notes.push(`convert() 반환: ${safeStringify(convertReturn)}`);

      const analysis = await analyzeOpenDataLoaderResult(plaintextJson);
      diag.textLength = analysis.textLength;
      diag.nodeTypes = analysis.nodeTypes;
      console.log(
        `[converter] ${logName} odl → textLen=${analysis.textLength} empty=${analysis.empty}`
      );

      if (!analysis.empty) {
        await encryptAndStore(plaintextJson, id);
        return {
          jsonPath: encJsonPath(id),
          engine: hybrid.enabled ? "opendataloader-pdf-hybrid" : "opendataloader-pdf",
          fallbackReason: null,
          diagnostics: diag,
        };
      }

      // ── Phase 2: 빈 결과 = 이미지 PDF → hybrid full + OCR
      await deleteIfExists(plaintextJson);
      diag.notes.push(`opendataloader 결과 비어있음 (textLen=${analysis.textLength})`);
      console.warn(`[converter] ${logName} → 빈 결과(이미지 PDF 추정)`);

      if (hybrid.enabled) {
        try {
          diag.hybridMode = "full";
          const ocr = await runOpenDataLoader(pdfPath, "full", hybrid);
          diag.outputFile = ocr.outputFile;
          const ocrAnalysis = await analyzeOpenDataLoaderResult(ocr.plaintextJson);
          diag.textLength = ocrAnalysis.textLength;
          diag.nodeTypes = ocrAnalysis.nodeTypes;
          if (!ocrAnalysis.empty) {
            await encryptAndStore(ocr.plaintextJson, id);
            return {
              jsonPath: encJsonPath(id),
              engine: "opendataloader-pdf-hybrid",
              fallbackReason: "이미지 PDF 감지 → hybrid 백엔드 + OCR 사용",
              diagnostics: diag,
            };
          }
          await deleteIfExists(ocr.plaintextJson);
          diag.notes.push("hybrid OCR 결과도 비어있음");
        } catch (ocrErr) {
          const m = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
          diag.notes.push(`hybrid OCR 재시도 실패: ${m}`);
        }
      } else {
        diag.notes.push("COMPASS_HYBRID_URL 미설정 — OCR 경로 사용 불가");
      }

      const reason = hybrid.enabled
        ? "이미지 PDF — hybrid OCR 도 빈 결과 → pdfjs 폴백"
        : "이미지 PDF 감지 — hybrid 미설정 → pdfjs 폴백";
      await convertWithPdfJs(pdfPath, id, reason);
      return {
        jsonPath: encJsonPath(id),
        engine: "pdfjs-fallback",
        fallbackReason: reason,
        diagnostics: diag,
      };
    } catch (err) {
      // ── Phase 3: opendataloader 예외
      const classified = classifyError(err);
      const reason = `${classified.summary} | ${classified.detail}`;
      diag.notes.push(`opendataloader 예외: ${reason}`);

      // hybrid(auto) 경로는 docling/OCR가 주입한 텍스트 노드에 색상 정보가 없어
      // 머리글 감지 후처리에서 NPE로 죽는 PDF가 있다(verapdf calculateTextColor).
      // 순수 Java(off) 경로는 PDFBox 색상이 채워져 동일 PDF를 정상 변환하는 경우가
      // 많고, pdfjs 폴백(텍스트 전용)보다 구조화 JSON 품질이 월등하므로 off 모드로
      // 한 번 더 시도한 뒤에만 pdfjs로 폴백한다.
      if (hybrid.enabled) {
        try {
          diag.hybridMode = "off";
          const retry = await runOpenDataLoader(pdfPath, "off", hybrid);
          diag.outputFile = retry.outputFile;
          const retryAnalysis = await analyzeOpenDataLoaderResult(retry.plaintextJson);
          diag.textLength = retryAnalysis.textLength;
          diag.nodeTypes = retryAnalysis.nodeTypes;
          if (!retryAnalysis.empty) {
            await encryptAndStore(retry.plaintextJson, id);
            diag.notes.push("hybrid 예외 → 순수 Java(off) 재시도 성공");
            console.warn(
              `[converter] ${logName} → hybrid 실패(${classified.summary}) → 순수 Java 재시도 성공`
            );
            return {
              jsonPath: encJsonPath(id),
              engine: "opendataloader-pdf",
              fallbackReason: `hybrid 실패 → 순수 Java 재시도: ${classified.summary}`,
              diagnostics: diag,
            };
          }
          await deleteIfExists(retry.plaintextJson);
          diag.notes.push("순수 Java(off) 재시도도 빈 결과");
        } catch (retryErr) {
          const m = retryErr instanceof Error ? retryErr.message : String(retryErr);
          diag.notes.push(`순수 Java(off) 재시도 실패: ${m}`);
        }
      }

      console.error(`[converter] ${logName} → FAILED: ${classified.summary} → pdfjs 폴백`);
      await convertWithPdfJs(pdfPath, id, reason);
      return {
        jsonPath: encJsonPath(id),
        engine: "pdfjs-fallback",
        fallbackReason: reason,
        diagnostics: diag,
      };
    }
  });
}

interface OdlRun {
  plaintextJson: string; // 임시 평문 JSON 경로 (호출자가 암호화/삭제 책임)
  outputFile: string;
  convertReturn: unknown;
}

async function runOpenDataLoader(
  pdfPath: string,
  hybridMode: HybridMode,
  hybrid: HybridConfig
): Promise<OdlRun> {
  if (
    process.platform === "win32" &&
    !/file\.encoding=UTF-?8/i.test(process.env.JAVA_TOOL_OPTIONS ?? "")
  ) {
    const prev = process.env.JAVA_TOOL_OPTIONS ?? "";
    process.env.JAVA_TOOL_OPTIONS =
      `${prev} -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8`.trim();
  }

  const mod = (await import("@opendataloader/pdf")) as unknown as {
    convert: (
      inputs: string[],
      options: {
        outputDir: string;
        format?: string;
        useStructTree?: boolean;
        imageOutput?: string;
        hybrid?: string;
        hybridMode?: string;
        hybridUrl?: string;
        hybridTimeout?: string;
        hybridFallback?: boolean;
      }
    ) => Promise<unknown>;
  };

  const outDir = tmpDir(); // 평문 산출은 임시 디렉터리에만
  const opts: Parameters<typeof mod.convert>[1] = {
    outputDir: outDir,
    format: "json",
    useStructTree: true,
    imageOutput: "off",
  };
  if (hybridMode !== "off" && hybrid.enabled) {
    opts.hybrid = hybrid.backend;
    opts.hybridMode = hybridMode;
    opts.hybridFallback = true;
    opts.hybridTimeout = String(hybrid.timeoutMs);
    if (hybrid.url) opts.hybridUrl = hybrid.url;
  }

  const convertReturn = await mod.convert([pdfPath], opts);

  const base = path.basename(pdfPath, path.extname(pdfPath));
  const expected = path.join(outDir, `${base}.json`);
  try {
    await fs.access(expected);
    return { plaintextJson: expected, outputFile: `${base}.json`, convertReturn };
  } catch {
    const entries = await fs.readdir(outDir);
    const match = entries.find(
      (f) =>
        f.toLowerCase().endsWith(".json") &&
        f.toLowerCase().startsWith(base.toLowerCase())
    );
    if (!match) {
      const sample = entries.filter((f) => f.toLowerCase().endsWith(".json")).slice(0, 20);
      throw new Error(
        `Converter produced no JSON. expected="${base}.json", tmp json files=[${sample.join(", ")}]`
      );
    }
    return { plaintextJson: path.join(outDir, match), outputFile: match, convertReturn };
  }
}

/** 임시 평문 JSON 을 암호화해 영구 저장하고 평문 임시본은 삭제 */
async function encryptAndStore(plaintextJson: string, id: string) {
  const data = await fs.readFile(plaintextJson);
  await writeEncryptedFile(encJsonPath(id), data);
  await deleteIfExists(plaintextJson);
}

interface ResultAnalysis {
  empty: boolean;
  textLength: number;
  nodeTypes: Record<string, number>;
}

/**
 * 결과 트리를 walk 해 전체 텍스트 길이 + 노드 타입 히스토그램 계산.
 * 모든 배열 값 프로퍼티를 재귀(표 rows/cells, 리스트 list items 포함) → 표 위주
 * 학생부의 텍스트 누락을 방지. 30자 미만이면 빈 결과(이미지 PDF)로 간주.
 */
async function analyzeOpenDataLoaderResult(jsonPath: string): Promise<ResultAnalysis> {
  let text: string;
  try {
    text = await fs.readFile(jsonPath, "utf8");
  } catch {
    return { empty: true, textLength: 0, nodeTypes: {} };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { empty: true, textLength: 0, nodeTypes: {} };
  }

  const buf: string[] = [];
  const nodeTypes: Record<string, number> = {};
  const visit = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o.type === "string") nodeTypes[o.type] = (nodeTypes[o.type] ?? 0) + 1;
    if (typeof o.content === "string") buf.push(o.content);
    if (typeof o.text === "string") buf.push(o.text);
    for (const key of Object.keys(o)) {
      if (Array.isArray(o[key])) visit(o[key]);
    }
  };
  visit(data);

  const textLength = buf.reduce((s, line) => s + line.trim().length, 0);
  return { empty: textLength < 30, textLength, nodeTypes };
}

/** pdfjs 폴백 — 임시 평문 PDF 에서 텍스트 추출 후 암호화 저장 */
async function convertWithPdfJs(pdfPath: string, id: string, reason: string): Promise<void> {
  const pages = await extractPagesFromPdf(pdfPath);
  const payload = {
    engine: "pdfjs-fallback",
    fallbackReason: reason,
    generatedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages: pages.map((p) => ({
      page: p.page,
      lineCount: p.lines.length,
      lines: p.lines,
      text: p.lines.join("\n"),
    })),
  };
  await writeEncryptedFile(encJsonPath(id), JSON.stringify(payload, null, 2));
}
