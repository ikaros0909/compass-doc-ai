import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { jobsRepo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const jobs = jobsRepo.listByBatch(batchId);
  if (jobs.length === 0) {
    return NextResponse.json({ error: "batch not found" }, { status: 404 });
  }

  const unlinks: Array<Promise<unknown>> = [];
  for (const j of jobs) {
    unlinks.push(fs.unlink(j.pdfPath).catch(() => undefined));
    if (j.jsonPath) {
      unlinks.push(fs.unlink(j.jsonPath).catch(() => undefined));
    }
  }
  await Promise.allSettled(unlinks);

  jobsRepo.deleteBatch(batchId);

  return NextResponse.json({ ok: true, removed: jobs.length });
}
