import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { hsbExportsRepo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rec = hsbExportsRepo.findById(id);
  if (!rec) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  let buf: Buffer;
  try {
    buf = await fs.readFile(rec.filePath);
  } catch (err) {
    return NextResponse.json(
      { error: "file missing", detail: String(err) },
      { status: 410 }
    );
  }
  const filename = encodeURIComponent(rec.fileName);
  const body = new Blob([new Uint8Array(buf)], {
    type: "application/vnd.sqlite3",
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
