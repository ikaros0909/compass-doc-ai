import path from "node:path";
import fs from "node:fs";

// Electron(데스크톱 설치본)에서는 사용자별 쓰기 가능 경로를 주입한다.
// 기본값은 기존 동작(개발/Docker)과 동일하게 ./data.
const DATA_DIR = process.env.COMPASS_DATA_DIR
  ? path.resolve(process.env.COMPASS_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdf");
const JSON_DIR = path.join(DATA_DIR, "json");
const DB_PATH = path.join(DATA_DIR, "compass.db");

export function ensureDataDirs() {
  for (const dir of [DATA_DIR, PDF_DIR, JSON_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export const paths = {
  dataDir: DATA_DIR,
  pdfDir: PDF_DIR,
  jsonDir: JSON_DIR,
  dbPath: DB_PATH,
  pdfFor: (storedName: string) => path.join(PDF_DIR, storedName),
  jsonFor: (storedName: string) => path.join(JSON_DIR, storedName.replace(/\.pdf$/i, ".json")),
};
