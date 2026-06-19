import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { jobsRepo } from "@/lib/db";
import { ensureDataDirs } from "@/lib/paths";
import { emitJobEvent } from "@/lib/events";
import { kickQueue } from "@/lib/queue";
import { isUnlocked } from "@/lib/security";
import { encPdfPath, writeEncryptedFile } from "@/lib/storage";
import type { JobRecord } from "@/types/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  ensureDataDirs();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "multipart/form-data 파싱 실패", detail: String(err) },
      { status: 400 }
    );
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "files 필드에 PDF가 없습니다" }, { status: 400 });
  }

  const batchId = randomUUID();
  const createdAt = new Date().toISOString();
  const jobs: JobRecord[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file.name.toLowerCase().endsWith(".pdf")) continue;

    const id = randomUUID();
    // 불투명 저장: 파일명/경로에 수험번호가 드러나지 않게 작업 id 기반.
    const storedName = id;
    const pdfPath = encPdfPath(id);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeEncryptedFile(pdfPath, buffer); // AES-256-GCM 로 암호화 저장

    const job: JobRecord = {
      id,
      batchId,
      orderIndex: i,
      originalName: file.name,
      storedName,
      sizeBytes: buffer.byteLength,
      pdfPath,
      jsonPath: null,
      status: "queued",
      progress: 0,
      error: null,
      engine: null,
      fallbackReason: null,
      diagnostics: null,
      createdAt,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    };
    jobs.push(job);
  }

  if (jobs.length === 0) {
    return NextResponse.json({ error: "유효한 PDF가 없습니다" }, { status: 400 });
  }

  jobsRepo.insertMany(jobs);
  for (const job of jobs) {
    emitJobEvent({ type: "job.queued", job });
  }

  kickQueue();

  return NextResponse.json({
    batchId,
    count: jobs.length,
    jobs: jobs.map((j) => ({ id: j.id, originalName: j.originalName })),
  });
}
