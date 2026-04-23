import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { jobsRepo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  await Promise.allSettled([
    fs.unlink(job.pdfPath),
    job.jsonPath ? fs.unlink(job.jsonPath) : Promise.resolve(),
  ]);
  jobsRepo.delete(id);

  return NextResponse.json({ ok: true });
}
