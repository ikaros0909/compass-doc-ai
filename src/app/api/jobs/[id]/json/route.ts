import { NextResponse } from "next/server";
import { jobsRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { readEncryptedText } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
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
    content = await readEncryptedText(job.jsonPath);
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
