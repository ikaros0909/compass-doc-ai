import fs from "node:fs/promises";

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

export async function extractPagesFromPdf(pdfPath: string): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Node 환경: worker를 번들의 mjs 경로로 지정해야 "fake worker" 초기화가 통과한다.
  const gwo = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } })
    .GlobalWorkerOptions;
  if (gwo && !gwo.workerSrc) {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    gwo.workerSrc = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }

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
