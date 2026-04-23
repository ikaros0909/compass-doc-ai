import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { hsbExportsRepo } from "@/lib/db";
import { previewHsbDb } from "@/lib/hsbExport";

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
  let tables;
  try {
    tables = previewHsbDb(rec.filePath, 5);
  } catch (err) {
    return NextResponse.json(
      { error: "preview failed", detail: String(err) },
      { status: 500 }
    );
  }
  return NextResponse.json({
    id: rec.id,
    fileName: rec.fileName,
    mogib1: rec.mogib1,
    mogib2: rec.mogib2,
    studentCount: rec.studentCount,
    jobIds: rec.jobIds,
    tableCounts: rec.tableCounts,
    warnings: rec.warnings,
    sizeBytes: rec.sizeBytes,
    createdAt: rec.createdAt,
    tables,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rec = hsbExportsRepo.delete(id);
  if (!rec) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // WAL/SHM 사이드카 파일도 같이 정리. Windows에서는 이전에 열린 읽기 핸들이
  // GC 되기 전이라면 EBUSY가 날 수 있어 짧은 재시도 루프를 둔다.
  const targets = [rec.filePath, `${rec.filePath}-wal`, `${rec.filePath}-shm`];
  const fileErrors: string[] = [];

  for (const target of targets) {
    if (!fsSync.existsSync(target)) continue;
    let removed = false;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5 && !removed; attempt += 1) {
      try {
        await fs.unlink(target);
        removed = true;
      } catch (err) {
        lastErr = err;
        // 다음 시도 전 잠시 대기
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!removed) {
      fileErrors.push(
        `${target}: ${(lastErr as Error)?.message ?? String(lastErr)}`
      );
    }
  }

  return NextResponse.json({
    deleted: rec.id,
    fileName: rec.fileName,
    fileRemoved: fileErrors.length === 0,
    fileErrors: fileErrors.length > 0 ? fileErrors : undefined,
  });
}
