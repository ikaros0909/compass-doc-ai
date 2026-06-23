import { NextResponse } from "next/server";
import { subjectCodeRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { normalizeSubjectName } from "@/lib/subjectCodeNorm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ManualEntry {
  subjectName?: unknown;
  subjectCode?: unknown;
}

/**
 * 과목코드 수작업 매핑 — (과목명, 과목코드) 한 건 이상을 직접 추가/수정한다.
 * 미매핑 과목을 처리 목록에서 즉시 매핑할 때 사용.
 */
export async function POST(request: Request) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }

  let body: { entries?: unknown };
  try {
    body = (await request.json()) as { entries?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const raw = Array.isArray(body.entries) ? (body.entries as ManualEntry[]) : [];
  const entries = raw
    .map((e) => ({
      subjectName: typeof e.subjectName === "string" ? e.subjectName.trim() : "",
      subjectCode: typeof e.subjectCode === "string" ? e.subjectCode.trim() : "",
    }))
    .filter((e) => e.subjectName && e.subjectCode)
    .map((e) => ({
      normName: normalizeSubjectName(e.subjectName),
      subjectName: e.subjectName,
      subjectCode: e.subjectCode,
    }))
    .filter((e) => e.normName);

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "유효한 (과목명, 과목코드) 항목이 없습니다." },
      { status: 400 }
    );
  }

  const upserted = subjectCodeRepo.upsertMany(entries, new Date().toISOString());
  return NextResponse.json({ upserted, total: subjectCodeRepo.count() });
}
