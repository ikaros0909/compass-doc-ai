import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths";
import { extractPagesFromPdf } from "./pdfText";

export interface ConvertResult {
  jsonPath: string;
  engine: "opendataloader-pdf" | "pdfjs-fallback";
  fallbackReason: string | null;
}

interface ClassifiedError {
  summary: string;
  detail: string;
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
 * Try @opendataloader/pdf first (requires Java 11+). On failure — missing Java,
 * native spawn error, etc. — fall back to a pdfjs-dist text extraction so the
 * app works end-to-end on dev machines without a JRE.
 */
export async function convertPdfToJson(
  pdfAbsolutePath: string,
  storedName: string
): Promise<ConvertResult> {
  try {
    const result = await convertWithOpenDataLoader(pdfAbsolutePath, storedName);
    console.log(
      `[converter] ${path.basename(pdfAbsolutePath)} → opendataloader-pdf OK`
    );
    return { jsonPath: result, engine: "opendataloader-pdf", fallbackReason: null };
  } catch (err) {
    const classified = classifyError(err);
    const reason = `${classified.summary} | ${classified.detail}`;
    console.error(
      `[converter] ${path.basename(pdfAbsolutePath)} → opendataloader-pdf FAILED\n` +
        `  summary: ${classified.summary}\n` +
        `  detail : ${classified.detail}\n` +
        (err instanceof Error && err.stack
          ? `  stack  : ${err.stack.split("\n").slice(0, 5).join("\n           ")}\n`
          : "") +
        `  → fallback to pdfjs`
    );
    const result = await convertWithPdfJs(pdfAbsolutePath, storedName, reason);
    return { jsonPath: result, engine: "pdfjs-fallback", fallbackReason: reason };
  }
}

async function convertWithOpenDataLoader(
  pdfAbsolutePath: string,
  storedName: string
): Promise<string> {
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
      }
    ) => Promise<unknown>;
  };

  const outDir = paths.jsonDir;
  await mod.convert([pdfAbsolutePath], {
    outputDir: outDir,
    format: "json",
    useStructTree: true,
    imageOutput: "off",
  });

  const base = path.basename(storedName, path.extname(storedName));
  const expected = path.join(outDir, `${base}.json`);
  try {
    await fs.access(expected);
    return expected;
  } catch {
    const entries = await fs.readdir(outDir);
    const match = entries.find(
      (f) =>
        f.toLowerCase().endsWith(".json") &&
        f.toLowerCase().startsWith(base.toLowerCase())
    );
    if (!match) {
      throw new Error(`Converter produced no JSON for ${storedName}`);
    }
    return path.join(outDir, match);
  }
}

async function convertWithPdfJs(
  pdfAbsolutePath: string,
  storedName: string,
  reason: string
): Promise<string> {
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
  return outPath;
}
