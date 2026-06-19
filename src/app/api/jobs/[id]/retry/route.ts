import { NextResponse } from "next/server";
import { jobsRepo } from "@/lib/db";
import { emitJobEvent } from "@/lib/events";
import { kickQueue } from "@/lib/queue";
import { isUnlocked } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 실패/완료 작업을 다시 큐에 넣어 재변환한다 (삭제·재업로드 불필요). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status === "queued" || job.status === "processing") {
    return NextResponse.json(
      { error: "이미 대기/진행 중인 작업입니다" },
      { status: 409 }
    );
  }

  jobsRepo.requeue(id);
  const updated = jobsRepo.findById(id);
  if (updated) emitJobEvent({ type: "job.queued", job: updated });
  kickQueue();

  return NextResponse.json({ ok: true });
}
