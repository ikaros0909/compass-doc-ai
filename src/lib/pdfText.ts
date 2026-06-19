import fs from "node:fs/promises";
import type { PdfProbe } from "@/types/job";

interface PageText {
  page: number;
  lines: string[];
}

/**
 * pdfjs-dist needs a few browser globals. Install them once at module load so
 * they exist BEFORE the (dynamic) import pulls the library in — otherwise the
 * library sees an undefined prototype and throws
 * "Object.defineProperty called on non-object".
 */
function installPolyfills() {
  const g = globalThis as Record<string, unknown>;

  if (!g.DOMMatrix) {
    class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true;
      isIdentity = true;
      constructor(_init?: unknown) {}
      translate() { return new DOMMatrix(); }
      translateSelf() { return this; }
      scale() { return new DOMMatrix(); }
      scaleSelf() { return this; }
      multiply() { return new DOMMatrix(); }
      multiplySelf() { return this; }
      invertSelf() { return this; }
      rotate() { return new DOMMatrix(); }
      rotateSelf() { return this; }
      transformPoint(p: { x: number; y: number }) { return { ...p }; }
      static fromMatrix() { return new DOMMatrix(); }
      static fromFloat32Array() { return new DOMMatrix(); }
      static fromFloat64Array() { return new DOMMatrix(); }
    }
    g.DOMMatrix = DOMMatrix;
  }

  if (!g.ImageData) {
    class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    }
    g.ImageData = ImageData;
  }

  if (!g.Path2D) {
    class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
      roundRect() {}
    }
    g.Path2D = Path2D;
  }
}

installPolyfills();

// pdfjs 동적 import + worker 설정을 1회만 수행하고 캐시 (probe/extract 공용)
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null =
  null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Node 환경: worker를 번들의 mjs 경로로 지정해야 "fake worker" 초기화가 통과한다.
      const gwo = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } })
        .GlobalWorkerOptions;
      if (gwo && !gwo.workerSrc) {
        const { createRequire } = await import("node:module");
        const req = createRequire(import.meta.url);
        gwo.workerSrc = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * 변환 전에 PDF 메타를 싸게 뽑는다(앞 3페이지만 샘플링). 어떤 출처/형식의
 * 학생부가 실패하는지 상관분석할 수 있도록 producer/creator/텍스트레이어/암호화
 * 여부를 남긴다. 어떤 이유로든 실패해도 throw 하지 않고 error 필드로 보고한다.
 */
export async function probePdf(pdfPath: string): Promise<PdfProbe> {
  try {
    const pdfjs = await loadPdfjs();
    const buf = await fs.readFile(pdfPath);
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    } as never).promise;

    let producer: string | null = null;
    let creator: string | null = null;
    try {
      const meta = await doc.getMetadata();
      const info = (meta?.info ?? {}) as Record<string, unknown>;
      producer = typeof info.Producer === "string" ? info.Producer : null;
      creator = typeof info.Creator === "string" ? info.Creator : null;
    } catch {
      /* metadata 는 없을 수 있음 */
    }

    let sampledChars = 0;
    const sample = Math.min(doc.numPages, 3);
    for (let p = 1; p <= sample; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items as Array<{ str?: string }>) {
        sampledChars += item.str?.length ?? 0;
      }
    }
    const pageCount = doc.numPages;
    await doc.destroy?.();
    return {
      pageCount,
      encrypted: false,
      hasTextLayer: sampledChars > 20,
      producer,
      creator,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPwd = /password|encrypt/i.test(msg);
    return {
      pageCount: null,
      encrypted: isPwd ? true : null,
      hasTextLayer: null,
      producer: null,
      creator: null,
      error: msg,
    };
  }
}

export async function extractPagesFromPdf(pdfPath: string): Promise<PageText[]> {
  const pdfjs = await loadPdfjs();

  const buf = await fs.readFile(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  } as never).promise;

  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;
    let buffer: string[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        const line = buffer.join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
        buffer = [];
      }
      buffer.push(item.str);
      lastY = y;
    }
    const tail = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (tail) lines.push(tail);
    pages.push({ page: p, lines });
  }

  await doc.destroy?.();
  return pages;
}

export function pagesToPlainText(pages: PageText[]): string {
  return pages.map((p) => p.lines.join("\n")).join("\n\n");
}
