import { NextResponse } from "next/server";
import fs from "node:fs";
import { jobsRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";
import { readEncryptedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!fs.existsSync(job.pdfPath)) {
    return NextResponse.json({ error: "pdf missing" }, { status: 410 });
  }

  let buf: Buffer;
  try {
    buf = await readEncryptedFile(job.pdfPath); // 메모리에서 복호화
  } catch (err) {
    return NextResponse.json(
      { error: "decrypt failed", detail: String(err) },
      { status: 500 }
    );
  }

  const filename = encodeURIComponent(job.originalName);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
