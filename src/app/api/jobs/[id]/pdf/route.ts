import { NextResponse } from "next/server";
import fs from "node:fs";
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
  if (!fs.existsSync(job.pdfPath)) {
    return NextResponse.json({ error: "pdf missing" }, { status: 410 });
  }

  const stream = fs.createReadStream(job.pdfPath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  const filename = encodeURIComponent(job.originalName);
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
