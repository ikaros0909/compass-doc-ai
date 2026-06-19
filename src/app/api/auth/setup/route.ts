import { NextResponse } from "next/server";
import { isConfigured, setup } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isConfigured()) {
    return NextResponse.json(
      { error: "이미 비밀번호가 설정되어 있습니다" },
      { status: 409 }
    );
  }
  let body: { password?: string; userNumber?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const password = (body.password ?? "").trim();
  const userNumber = (body.userNumber ?? "").trim();
  try {
    const { recoveryCode } = setup(password, userNumber);
    return NextResponse.json({ ok: true, recoveryCode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
