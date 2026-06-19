"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 지금 잠그기(로그아웃) — 서버 메모리의 키를 폐기하고 잠금 화면으로 돌아간다. */
export function LockButton() {
  const [busy, setBusy] = useState(false);

  const lock = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/lock", { method: "POST" });
      // SecurityGate 가 상태를 다시 읽어 잠금 화면을 띄우도록 새로고침
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={lock}
      disabled={busy}
      className="h-8 gap-1.5"
      title="지금 잠그기 — 자리를 비울 때 누르면 비밀번호를 다시 입력해야 합니다"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Lock className="h-3.5 w-3.5" />
      )}
      잠금
    </Button>
  );
}
