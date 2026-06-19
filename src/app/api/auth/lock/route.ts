import { NextResponse } from "next/server";
import { lock } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  lock();
  return NextResponse.json({ ok: true });
}
