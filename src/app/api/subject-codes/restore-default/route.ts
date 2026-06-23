import { NextResponse } from "next/server";
import { subjectCodeRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { defaultSubjectCodeEntries } from "@/lib/subjectCodeSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 앱 내장 기본 과목코드 매핑을 다시 적용한다(엑셀 없이 기본값 복원).
 * 기존 매핑 위에 upsert 하므로 사용자가 추가한 과목명은 보존되고, 같은 과목명은
 * 기본값으로 덮어쓴다.
 */
export async function POST() {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const entries = defaultSubjectCodeEntries();
  const upserted = subjectCodeRepo.upsertMany(entries, new Date().toISOString());
  return NextResponse.json({ upserted, total: subjectCodeRepo.count() });
}
