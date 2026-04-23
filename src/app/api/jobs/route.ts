import { NextResponse } from "next/server";
import { jobsRepo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const jobs = batchId ? jobsRepo.listByBatch(batchId) : jobsRepo.listAll(500);
  const summary = jobsRepo.summary();
  const batches = jobsRepo.batches(20);
  return NextResponse.json({ jobs, summary, batches });
}
