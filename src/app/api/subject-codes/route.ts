import { NextResponse } from "next/server";
import { subjectCodeRepo } from "@/lib/db";
import { isUnlocked } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);
  return NextResponse.json({
    count: subjectCodeRepo.count(),
    query: q,
    entries: subjectCodeRepo.search(q, limit),
  });
}

export async function DELETE() {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const removed = subjectCodeRepo.clear();
  return NextResponse.json({ removed });
}
