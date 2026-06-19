import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resetVault } from "@/lib/security";
import { jobsRepo, hsbExportsRepo } from "@/lib/db";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function clearDir(dir: string) {
  try {
    const entries = await fs.readdir(dir);
    await Promise.allSettled(
      entries.map((f) => fs.rm(path.join(dir, f), { recursive: true, force: true }))
    );
  } catch {
    /* 디렉터리 없음 등은 무시 */
  }
}

/**
 * 완전 초기화 — 비밀번호/복구코드 분실 시 처음부터 다시 시작.
 * 암호화된 데이터는 키 없이는 어차피 복구 불가하므로 전부 삭제한다.
 * (비인증 동작: 데이터는 암호화돼 있어 노출 위험은 없고, UI 에서 확인 문구로 보호)
 */
export async function POST() {
  // 1) 키 폐기 + vault.json 삭제 → 미설정 상태로
  resetVault();

  // 2) DB 메타(작업/내보내기) 행 비우기 (열린 연결 유지, 파일은 삭제 안 함)
  try {
    jobsRepo.deleteAll();
    hsbExportsRepo.deleteAll();
  } catch {
    /* 무시 */
  }

  // 3) 디스크의 암호화 산출물 삭제
  await clearDir(paths.pdfDir);
  await clearDir(paths.jsonDir);
  await clearDir(path.join(paths.dataDir, "exports"));
  await clearDir(path.join(paths.dataDir, "tmp"));

  return NextResponse.json({ ok: true });
}
