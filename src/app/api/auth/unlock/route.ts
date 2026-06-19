import { NextResponse } from "next/server";
import { unlock, unlockRecovery, checkUserNumber } from "@/lib/security";
import { kickQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { password?: string; recoveryCode?: string; userNumber?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 사용자번호 먼저 확인 — 무엇이 틀렸는지 안내 (라이선스성, 비밀 아님)
  if (!checkUserNumber(body.userNumber)) {
    return NextResponse.json(
      { error: "사용자번호가 올바르지 않습니다 (사용 문의: danny@jinhakapply.com)" },
      { status: 401 }
    );
  }

  const userNumber = (body.userNumber ?? "").trim();
  const ok = body.recoveryCode
    ? unlockRecovery(body.recoveryCode, userNumber)
    : unlock(body.password ?? "", userNumber);

  if (!ok) {
    return NextResponse.json(
      {
        error: body.recoveryCode
          ? "복구코드가 올바르지 않습니다"
          : "비밀번호가 올바르지 않습니다",
      },
      { status: 401 }
    );
  }
  kickQueue(); // 잠금 중 멈춰 있던 대기열 재개
  return NextResponse.json({ ok: true });
}
