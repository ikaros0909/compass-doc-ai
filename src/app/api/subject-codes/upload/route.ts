import { NextResponse } from "next/server";
import { subjectCodeRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { parseSubjectCodeWorkbook } from "@/lib/subjectCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 과목코드 매핑 엑셀(.xlsx/.xls/.csv) 업로드 → 파싱 → subject_code_map 에 upsert.
 * 기존 매핑은 유지하고 같은 과목명은 덮어쓴다(누적). 전체 교체가 필요하면
 * 먼저 DELETE /api/subject-codes 로 비운 뒤 업로드한다.
 */
export async function POST(request: Request) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "multipart/form-data 파싱 실패", detail: String(err) },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file 필드에 엑셀/CSV 파일이 없습니다" },
      { status: 400 }
    );
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "지원하지 않는 형식입니다. .xlsx / .xls / .csv 만 가능합니다." },
      { status: 400 }
    );
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseSubjectCodeWorkbook(buf);
  } catch (err) {
    return NextResponse.json(
      { error: "엑셀 파싱 실패", detail: (err as Error).message ?? String(err) },
      { status: 400 }
    );
  }

  if (parsed.entries.length === 0) {
    return NextResponse.json(
      {
        error:
          "유효한 (과목코드, 과목명) 행을 찾지 못했습니다. 헤더에 '과목코드'/'과목명'을 두거나, 1열=코드·2열=과목명 순서로 작성해주세요.",
        detail: parsed.detectedColumns,
      },
      { status: 400 }
    );
  }

  const updatedAt = new Date().toISOString();
  const upserted = subjectCodeRepo.upsertMany(parsed.entries, updatedAt);

  return NextResponse.json({
    fileName: file.name,
    sheetName: parsed.sheetName,
    upserted,
    skipped: parsed.skipped,
    inactive: parsed.inactive,
    detectedColumns: parsed.detectedColumns,
    total: subjectCodeRepo.count(),
  });
}
