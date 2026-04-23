import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { jobsRepo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!job.jsonPath) {
    return NextResponse.json({ error: "json not ready" }, { status: 409 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  let content: string;
  try {
    content = await fs.readFile(job.jsonPath, "utf8");
  } catch (err) {
    return NextResponse.json(
      { error: "json file missing", detail: String(err) },
      { status: 410 }
    );
  }

  const filename = encodeURIComponent(job.originalName.replace(/\.pdf$/i, ".json"));
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${filename}`
    );
  }
  return new Response(content, { headers });
}
