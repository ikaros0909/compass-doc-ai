import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { getDek } from "./security";
import { encryptBytes, decryptBytes } from "./vault";

/**
 * 암호화 저장 헬퍼.
 *   - PDF/JSON 은 AES-256-GCM 으로 암호화해 디스크에 저장한다.
 *   - 파일명은 불투명(작업 id 기반)이라 수험번호 등 개인정보가 파일명에 노출되지 않는다.
 *   - 변환 엔진(opendataloader/pdfjs)은 실제 파일 경로가 필요하므로,
 *     처리 동안만 임시 평문 파일로 복호화했다가 끝나면 즉시 삭제한다.
 */

const TMP_DIR = path.join(paths.dataDir, "tmp");

function ensureTmp() {
  if (!fssync.existsSync(TMP_DIR)) fssync.mkdirSync(TMP_DIR, { recursive: true });
}

/** 암호화 PDF/JSON 경로 (수험번호 미포함 — 작업 id 기반) */
export function encPdfPath(id: string): string {
  return path.join(paths.pdfDir, `${id}.pdfenc`);
}
export function encJsonPath(id: string): string {
  return path.join(paths.jsonDir, `${id}.jsonenc`);
}

export async function writeEncryptedFile(absPath: string, data: Buffer | string) {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  await fs.writeFile(absPath, encryptBytes(getDek(), buf));
}

export async function readEncryptedFile(absPath: string): Promise<Buffer> {
  const blob = await fs.readFile(absPath);
  return decryptBytes(getDek(), blob);
}

export async function readEncryptedText(absPath: string): Promise<string> {
  return (await readEncryptedFile(absPath)).toString("utf8");
}

/**
 * 암호화 파일을 임시 평문 파일로 풀어 콜백에 경로를 넘기고, 끝나면 삭제한다.
 * (변환 엔진이 파일 경로를 요구하기 때문)
 */
export async function withDecryptedTempFile<T>(
  encPath: string,
  ext: string,
  fn: (tmpPath: string) => Promise<T>
): Promise<T> {
  ensureTmp();
  const tmpPath = path.join(TMP_DIR, `${crypto.randomUUID()}${ext}`);
  await fs.writeFile(tmpPath, await readEncryptedFile(encPath));
  try {
    return await fn(tmpPath);
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

/** 변환 엔진이 평문 산출물을 쓸 임시 디렉터리 */
export function tmpDir(): string {
  ensureTmp();
  return TMP_DIR;
}

export async function deleteIfExists(absPath: string) {
  await fs.rm(absPath, { force: true });
}
