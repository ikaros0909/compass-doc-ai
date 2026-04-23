import { NextResponse } from "next/server";
import { hsbExportsRepo } from "@/lib/db";
import { HSB_TABLE_NAMES, queryHsbTable, type HsbTableName } from "@/lib/hsbExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await params;
  const rec = hsbExportsRepo.findById(id);
  if (!rec) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!HSB_TABLE_NAMES.includes(table as HsbTableName)) {
    return NextResponse.json(
      { error: `unknown table: ${table}` },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "100"))
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  try {
    const data = queryHsbTable(rec.filePath, table as HsbTableName, limit, offset);
    return NextResponse.json({
      table,
      limit,
      offset,
      ...data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "query failed", detail: String(err) },
      { status: 500 }
    );
  }
}
