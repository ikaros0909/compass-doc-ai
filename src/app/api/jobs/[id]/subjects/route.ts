import { NextResponse } from "next/server";
import { jobsRepo, subjectCodeRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { readEncryptedText } from "@/lib/storage";
import { extractSubjectNames } from "@/lib/hsbExport";
import { normalizeSubjectName } from "@/lib/subjectCodeNorm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 완료된 작업(PDF)의 교과 과목들이 과목코드 매핑표에 매핑됐는지 점검한다.
 * 내보내기 전에 "어떤 과목이 미매핑인지"를 처리 목록에서 확인하기 위한 용도.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  if (job.status !== "completed" || !job.jsonPath) {
    return NextResponse.json({ error: "job not completed" }, { status: 409 });
  }

  let names: string[];
  try {
    const raw = await readEncryptedText(job.jsonPath);
    names = extractSubjectNames(JSON.parse(raw));
  } catch (err) {
    return NextResponse.json(
      { error: "subject 추출 실패", detail: (err as Error).message ?? String(err) },
      { status: 500 }
    );
  }

  const map = subjectCodeRepo.asMap();
  const subjects = names.map((subjectName) => {
    const subjectCode = map[normalizeSubjectName(subjectName)] ?? "";
    return { subjectName, subjectCode, mapped: subjectCode.length > 0 };
  });
  const unmappedCount = subjects.filter((s) => !s.mapped).length;

  return NextResponse.json({
    jobId: id,
    total: subjects.length,
    unmappedCount,
    subjects,
  });
}
