import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths";
import { extractPagesFromPdf, probePdf } from "./pdfText";
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
  backend: string; // 예: "docling-fast"
  url?: string; // 예: "http://127.0.0.1:5002"
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

/** 진단 노트로 남길 때 거대한/순환 객체로부터 안전하게 짧은 문자열을 만든다. */
function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    if (!s) return String(v);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  } catch {
    return String(v);
  }
}

/**
 * Classify common failure modes so the UI/log can show an actionable message
 * instead of a raw stack. Java-not-installed is overwhelmingly the #1 cause.
 */
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
    return {
      summary: "PATH에 java 명령이 없습니다. JRE 11+ 설치 필요",
      detail: msg,
    };
  }
  if (/UnsupportedClassVersionError|class file version/i.test(hay)) {
    return {
      summary: "Java 버전이 낮습니다 — JRE 11+ 필요",
      detail: msg,
    };
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
  return {
    summary: "opendataloader-pdf 실행 실패",
    detail: msg || String(err),
  };
}

/**
 * 변환 흐름:
 *   1. opendataloader-pdf 호출 (hybrid 백엔드 설정돼있으면 hybrid auto 모드)
 *   2. 결과가 비어있으면(이미지 PDF):
 *        - hybrid 백엔드 있음 → hybrid full 모드로 재시도 (모든 페이지 OCR)
 *        - hybrid 백엔드 없음 → pdfjs 폴백 (텍스트 한 글자도 못 뽑을 가능성 높음)
 *   3. opendataloader 자체가 예외(Java 미설치 등) → pdfjs 폴백
 *
 * 모든 경로에서 ConvertDiagnostics 를 채워 반환한다 — 어떤 학생부가 왜 폴백/오판
 * 되었는지 사후 분석할 수 있도록 엔진 선택 근거를 남긴다.
 */
export async function convertPdfToJson(
  pdfAbsolutePath: string,
  storedName: string
): Promise<ConvertResult> {
  const hybrid = getHybridConfig();
  const fileName = path.basename(pdfAbsolutePath);

  const diag: ConvertDiagnostics = {
    pdf: null,
    structTree: true,
    hybridMode: hybrid.enabled ? "auto" : "off",
    outputFile: null,
    textLength: null,
    nodeTypes: null,
    notes: [],
  };

  // ── Pre-probe: pdfjs 로 메타만 싸게 추출 (출처/암호화/텍스트레이어)
  try {
    diag.pdf = await probePdf(pdfAbsolutePath);
    console.log(
      `[converter] ${fileName} probe → pages=${diag.pdf.pageCount} ` +
        `encrypted=${diag.pdf.encrypted} textLayer=${diag.pdf.hasTextLayer} ` +
        `producer=${JSON.stringify(diag.pdf.producer)} ` +
        `creator=${JSON.stringify(diag.pdf.creator)}` +
        (diag.pdf.error ? ` probeError=${diag.pdf.error}` : "")
    );
    if (diag.pdf.encrypted) {
      diag.notes.push("PDF 가 암호화/보호되어 있어 파싱이 실패할 수 있음");
    }
    if (diag.pdf.hasTextLayer === false) {
      diag.notes.push(
        "앞쪽 페이지에 텍스트 레이어 없음 — 스캔/이미지 PDF 의심 (OCR 필요)"
      );
    }
  } catch (e) {
    diag.notes.push(
      `probe 실패: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // ── Phase 1: opendataloader (hybrid auto if configured)
  try {
    const initialMode: HybridMode = hybrid.enabled ? "auto" : "off";
    diag.hybridMode = initialMode;
    const { jsonPath, outputFile, convertReturn } =
      await convertWithOpenDataLoader(
        pdfAbsolutePath,
        storedName,
        initialMode,
        hybrid
      );
    diag.outputFile = outputFile;
    if (convertReturn !== undefined && convertReturn !== null) {
      diag.notes.push(`convert() 반환: ${safeStringify(convertReturn)}`);
    }

    const analysis = await analyzeOpenDataLoaderResult(jsonPath);
    diag.textLength = analysis.textLength;
    diag.nodeTypes = analysis.nodeTypes;
    console.log(
      `[converter] ${fileName} odl result → textLen=${analysis.textLength} ` +
        `empty=${analysis.empty} nodes=${JSON.stringify(analysis.nodeTypes)}`
    );

    if (!analysis.empty) {
      console.log(
        `[converter] ${fileName} → opendataloader-pdf` +
          (initialMode === "auto" ? `+hybrid(${hybrid.backend})` : "") +
          " OK"
      );
      return {
        jsonPath,
        engine: hybrid.enabled
          ? "opendataloader-pdf-hybrid"
          : "opendataloader-pdf",
        fallbackReason: null,
        diagnostics: diag,
      };
    }

    // ── Phase 2: 빈 결과 = 이미지 PDF. hybrid full + OCR 재시도.
    console.warn(
      `[converter] ${fileName} → 텍스트 추출 결과 비어있음 ` +
        `(textLen=${analysis.textLength} < 30, 이미지 PDF 추정)`
    );
    diag.notes.push(
      `opendataloader 결과가 비어있음으로 판정 (textLen=${analysis.textLength})`
    );

    if (hybrid.enabled) {
      try {
        console.log(
          `[converter] ${fileName} → hybrid full 모드 + OCR 재시도 ` +
            `(${hybrid.url})`
        );
        diag.hybridMode = "full";
        const {
          jsonPath: ocrPath,
          outputFile: ocrOut,
          convertReturn: ocrReturn,
        } = await convertWithOpenDataLoader(
          pdfAbsolutePath,
          storedName,
          "full",
          hybrid
        );
        diag.outputFile = ocrOut;
        if (ocrReturn !== undefined && ocrReturn !== null) {
          diag.notes.push(`OCR convert() 반환: ${safeStringify(ocrReturn)}`);
        }
        const ocrAnalysis = await analyzeOpenDataLoaderResult(ocrPath);
        diag.textLength = ocrAnalysis.textLength;
        diag.nodeTypes = ocrAnalysis.nodeTypes;
        if (!ocrAnalysis.empty) {
          console.log(`[converter] ${fileName} → hybrid full + OCR 성공`);
          return {
            jsonPath: ocrPath,
            engine: "opendataloader-pdf-hybrid",
            fallbackReason:
              "이미지 PDF 감지 → hybrid 백엔드 + OCR 사용 (모든 페이지 라우팅)",
            diagnostics: diag,
          };
        }
        console.warn(`[converter] ${fileName} → hybrid OCR 결과도 비어있음`);
        diag.notes.push("hybrid OCR 재시도 결과도 비어있음");
      } catch (ocrErr) {
        const ocrMsg =
          ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
        console.error(
          `[converter] ${fileName} → hybrid OCR 재시도 실패: ${ocrMsg}`
        );
        diag.notes.push(`hybrid OCR 재시도 실패: ${ocrMsg}`);
      }
    } else {
      console.warn(
        `[converter] ${fileName} → COMPASS_HYBRID_URL 환경변수 미설정. ` +
          `이미지 PDF 처리 위해 hybrid 백엔드(opendataloader-pdf-hybrid --force-ocr) 가동 필요`
      );
      diag.notes.push("COMPASS_HYBRID_URL 미설정 — OCR 경로 사용 불가");
    }

    // 빈 결과 + 재시도 실패 → pdfjs 폴백 (대개 의미 없는 결과지만 일관성 위해)
    const reason = hybrid.enabled
      ? "이미지 PDF — hybrid OCR 백엔드도 빈 결과 → pdfjs 폴백"
      : "이미지 PDF 감지 — hybrid 백엔드 미설정 → pdfjs 폴백 (사실상 텍스트 없음)";
    const pdfjsResult = await convertWithPdfJs(
      pdfAbsolutePath,
      storedName,
      reason
    );
    return {
      jsonPath: pdfjsResult.jsonPath,
      engine: "pdfjs-fallback",
      fallbackReason: reason,
      diagnostics: diag,
    };
  } catch (err) {
    // ── Phase 3: opendataloader 자체 예외 (Java 미설치 등)
    const classified = classifyError(err);
    const reason = `${classified.summary} | ${classified.detail}`;
    diag.notes.push(`opendataloader 예외: ${reason}`);
    console.error(
      `[converter] ${fileName} → opendataloader-pdf FAILED\n` +
        `  summary: ${classified.summary}\n` +
        `  detail : ${classified.detail}\n` +
        (err instanceof Error && err.stack
          ? `  stack  : ${err.stack.split("\n").slice(0, 5).join("\n           ")}\n`
          : "") +
        `  → fallback to pdfjs`
    );
    const pdfjsResult = await convertWithPdfJs(
      pdfAbsolutePath,
      storedName,
      reason
    );
    return {
      jsonPath: pdfjsResult.jsonPath,
      engine: "pdfjs-fallback",
      fallbackReason: reason,
      diagnostics: diag,
    };
  }
}

type HybridMode = "off" | "auto" | "full";

interface OpenDataLoaderRun {
  jsonPath: string;
  outputFile: string; // basename of produced JSON
  convertReturn: unknown; // SDK 반환값 (상태/경고/에러가 들어올 수 있음)
}

async function convertWithOpenDataLoader(
  pdfAbsolutePath: string,
  storedName: string,
  hybridMode: HybridMode,
  hybrid: HybridConfig
): Promise<OpenDataLoaderRun> {
  // Windows 한국어 콘솔은 CP949가 기본이라 Java가 stdout에 한글 로그를 찍으면
  // Node가 UTF-8로 읽어 깨진다. JVM에게 UTF-8 출력을 강제해 해결.
  if (
    process.platform === "win32" &&
    !/file\.encoding=UTF-?8/i.test(process.env.JAVA_TOOL_OPTIONS ?? "")
  ) {
    const prev = process.env.JAVA_TOOL_OPTIONS ?? "";
    process.env.JAVA_TOOL_OPTIONS = `${prev} -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8`.trim();
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

  const outDir = paths.jsonDir;
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

  const convertReturn = await mod.convert([pdfAbsolutePath], opts);

  const base = path.basename(storedName, path.extname(storedName));
  const expected = path.join(outDir, `${base}.json`);
  try {
    await fs.access(expected);
    return { jsonPath: expected, outputFile: `${base}.json`, convertReturn };
  } catch {
    const entries = await fs.readdir(outDir);
    const match = entries.find(
      (f) =>
        f.toLowerCase().endsWith(".json") &&
        f.toLowerCase().startsWith(base.toLowerCase())
    );
    if (!match) {
      // 출력 파일명 매칭 실패 — 사후 진단을 위해 기대값과 실제 목록을 함께 노출
      const sample = entries
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .slice(0, 20);
      throw new Error(
        `Converter produced no JSON for ${storedName}. ` +
          `expected="${base}.json", outDir json files (max 20)=[${sample.join(", ")}]`
      );
    }
    return { jsonPath: path.join(outDir, match), outputFile: match, convertReturn };
  }
}

interface ResultAnalysis {
  empty: boolean;
  textLength: number;
  nodeTypes: Record<string, number>;
}

/**
 * opendataloader-pdf 결과를 walk 하여 (1) 전체 텍스트 길이와 (2) 노드 타입
 * 히스토그램을 동시에 계산한다. 30자 미만이면 빈 결과(=이미지 PDF)로 간주.
 *
 * 중요: 이전 구현은 `kids/children/items/elements/blocks` 키만 재귀해서
 * 표(`rows`→`cells`→`kids`)·리스트(`list items`) 안의 텍스트를 통째로 누락했다
 * (실측 누락률 ~92%). 학생부는 표가 대부분이라 표 위주 문서를 "이미지 PDF"로
 * 오판할 수 있었다. 이제 모든 배열 값 프로퍼티를 재귀해 키 구조 변화에도 견딘다.
 */
async function analyzeOpenDataLoaderResult(
  jsonPath: string
): Promise<ResultAnalysis> {
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
    if (typeof o.type === "string") {
      nodeTypes[o.type] = (nodeTypes[o.type] ?? 0) + 1;
    }
    if (typeof o.content === "string") buf.push(o.content);
    if (typeof o.text === "string") buf.push(o.text);
    // 모든 배열 값 프로퍼티를 재귀 (rows/cells/list items 포함). bounding box
    // 같은 숫자 배열은 안에서 typeof !== object 로 즉시 걸러져 비용이 거의 없다.
    for (const key of Object.keys(o)) {
      if (Array.isArray(o[key])) visit(o[key]);
    }
  };
  visit(data);

  const textLength = buf.reduce((s, line) => s + line.trim().length, 0);
  return { empty: textLength < 30, textLength, nodeTypes };
}

async function convertWithPdfJs(
  pdfAbsolutePath: string,
  storedName: string,
  reason: string
): Promise<{ jsonPath: string }> {
  const pages = await extractPagesFromPdf(pdfAbsolutePath);

  const payload = {
    engine: "pdfjs-fallback",
    fallbackReason: reason,
    sourceFile: path.basename(pdfAbsolutePath),
    generatedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages: pages.map((p) => ({
      page: p.page,
      lineCount: p.lines.length,
      lines: p.lines,
      text: p.lines.join("\n"),
    })),
  };

  const base = path.basename(storedName, path.extname(storedName));
  const outPath = path.join(paths.jsonDir, `${base}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  return { jsonPath: outPath };
}
