"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  RotateCcw,
  WifiOff,
  FileJson2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Status {
  configured: boolean;
  unlocked: boolean;
}

export function SecurityGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  // 최초 설정 직후 복구코드 — 사용자가 저장 확인(시작하기) 전까지 화면을 고정.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/status", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      setStatus({ configured: true, unlocked: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 서버 자동잠금(유휴) 반영: 주기적 + 창 포커스 시 상태 재확인
  useEffect(() => {
    const iv = setInterval(refresh, 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // 복구코드 표시가 최우선 — status 폴링(unlocked)이 화면을 덮어쓰지 못하게.
  if (recoveryCode) {
    return (
      <RecoveryScreen
        code={recoveryCode}
        onDone={() => {
          setRecoveryCode(null);
          void refresh();
        }}
      />
    );
  }

  if (status?.unlocked) return <>{children}</>;
  return (
    <LockScreen
      status={status}
      onChanged={refresh}
      onSetupComplete={setRecoveryCode}
    />
  );
}

function RecoveryScreen({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto bg-background p-6">
      <div className="w-full max-w-md py-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">복구코드를 저장하세요</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            비밀번호를 잊었을 때 데이터를 되살릴 유일한 수단입니다
          </p>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              이 코드는 <span className="font-medium text-foreground">지금만 표시</span>됩니다.
              안전한 곳(메모·비밀번호 관리자 등)에 보관하세요. 화면을 벗어나면 다시 볼 수 없습니다.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-background px-2 py-2 text-center font-mono text-base tracking-widest">
                {code}
              </code>
              <Button
                variant="outline"
                size="icon"
                title="복사"
                onClick={() => {
                  void navigator.clipboard?.writeText(code);
                  setCopied(true);
                }}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            복구코드를 안전한 곳에 저장했습니다.
          </label>
          <Button onClick={onDone} disabled={!ack} className="w-full">
            시작하기
          </Button>
        </div>
      </div>
    </div>
  );
}

function LockScreen({
  status,
  onChanged,
  onSetupComplete,
}: {
  status: Status | null;
  onChanged: () => void;
  onSetupComplete: (recoveryCode: string) => void;
}) {
  if (status === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto bg-background p-6">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-2">
        {/* 좌: 브랜딩 + 시스템 설명 */}
        <aside className="flex flex-col gap-4 border-b bg-gradient-to-br from-emerald-500/[0.06] to-card p-6 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-inset ring-white/10">
              <FileJson2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">
                <span className="text-foreground">Compass</span>
                <span className="ml-1 font-medium text-muted-foreground">Doc AI</span>
              </h1>
              <p className="text-xs text-muted-foreground">학생부를 안전하게 데이터로</p>
            </div>
          </div>

          <Intro configured={status.configured} />

          <div className="mt-auto border-t pt-3">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              사용 문의
              <a
                href="mailto:danny@jinhakapply.com"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                danny@jinhakapply.com
              </a>
            </p>
          </div>
        </aside>

        {/* 우: 비밀번호 입력 */}
        <div className="flex flex-col justify-center gap-3 p-6">
          {status.configured ? (
            <UnlockForm onUnlocked={onChanged} />
          ) : (
            <SetupForm onSetupComplete={onSetupComplete} />
          )}
        </div>
      </div>
    </div>
  );
}

function Intro({ configured }: { configured: boolean }) {
  return (
    <div className="text-left">
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Compass Doc AI</span>는 학생부(생활기록부)
        PDF를 구조화된 데이터(JSON · db3)로 변환하는 도구입니다.
      </p>
      <ul className="mt-3 space-y-2.5">
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <WifiOff className="h-3.5 w-3.5" />
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">완전 오프라인</span> — 인터넷 없이 이
            PC에서만 처리하며, 학생부 데이터는 외부로 전송되지 않습니다.
          </p>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">비밀번호 보호</span> — 학생부는 민감한
            개인정보라, 설정한 비밀번호로 암호화해 저장합니다.
          </p>
        </li>
      </ul>
      {configured ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          비밀번호를 입력해 잠금을 해제하면 작업을 이어서 할 수 있습니다.
        </p>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-amber-700 dark:text-amber-400">처음이신가요?</span>{" "}
          왼쪽 설명을 확인하고, 오른쪽에서 사용할 비밀번호를 정하세요. 이 비밀번호로 데이터가
          암호화됩니다. 설정 직후 표시되는{" "}
          <span className="font-medium text-foreground">복구코드</span>는 비밀번호를 잊었을 때 쓰는
          유일한 수단이니 꼭 안전한 곳에 보관하세요.
        </p>
      )}
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="password"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
    />
  );
}

function UserNumberField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="사용자번호"
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm tracking-wider outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        사용 문의(danny@jinhakapply.com)로 발급받은 번호
      </p>
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {msg}
    </p>
  );
}

function UnlockForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [userNumber, setUserNumber] = useState("");
  const [pw, setPw] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const body = useRecovery
        ? { recoveryCode: recovery, userNumber }
        : { password: pw, userNumber };
      const r = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? "잠금 해제 실패");
        return;
      }
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <UserNumberField value={userNumber} onChange={setUserNumber} autoFocus />
      {useRecovery ? (
        <input
          type="text"
          value={recovery}
          onChange={(e) => setRecovery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="복구코드 (XXXX-XXXX-…)"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
        />
      ) : (
        <Field value={pw} onChange={setPw} placeholder="비밀번호" onEnter={submit} />
      )}
      {err && <ErrorLine msg={err} />}
      <Button onClick={submit} disabled={busy} className="w-full gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        잠금 해제
      </Button>
      <button
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v);
          setErr(null);
        }}
        className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <KeyRound className="h-3 w-3" />
        {useRecovery ? "비밀번호로 잠금 해제" : "비밀번호를 잊으셨나요? 복구코드 사용"}
      </button>
      <div className="border-t pt-3">
        <ResetBlock onDone={onUnlocked} />
      </div>
    </div>
  );
}

function ResetBlock({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/reset", { method: "POST" });
      onDone(); // 상태 갱신 → 미설정(설정 화면)으로
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground/70 hover:text-destructive"
      >
        <RotateCcw className="h-3 w-3" />
        비밀번호·복구코드를 모두 잊으셨나요? 완전 초기화
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        모든 데이터가 영구 삭제됩니다
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        저장된 학생부 · 변환 결과 · 내보낸 db3가 전부 삭제되고 비밀번호 설정부터 다시
        시작합니다. <span className="font-medium text-foreground">되돌릴 수 없습니다.</span>
      </p>
      <input
        type="text"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder='확인을 위해 "초기화" 입력'
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-destructive/50 focus:ring-2 focus:ring-destructive/20"
      />
      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={reset}
          disabled={confirm.trim() !== "초기화" || busy}
          className="flex-1 gap-1.5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          초기화하고 새로 시작
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setConfirm("");
          }}
          disabled={busy}
        >
          취소
        </Button>
      </div>
    </div>
  );
}

function SetupForm({
  onSetupComplete,
}: {
  onSetupComplete: (recoveryCode: string) => void;
}) {
  const [userNumber, setUserNumber] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!userNumber.trim()) return setErr("사용자번호를 입력하세요");
    if (pw.length < 4) return setErr("비밀번호는 4자 이상이어야 합니다");
    if (pw !== pw2) return setErr("비밀번호가 일치하지 않습니다");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw, userNumber: userNumber.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error ?? "설정 실패");
        return;
      }
      // 복구코드 화면은 SecurityGate 가 띄운다(폴링에 안 덮이도록).
      onSetupComplete(d.recoveryCode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">사용자번호</span>와 이 PC에서 학생부를 보호할{" "}
        <span className="font-medium text-foreground">비밀번호</span>를 설정하세요. 데이터는 이
        비밀번호로 암호화됩니다.
      </p>
      <UserNumberField value={userNumber} onChange={setUserNumber} autoFocus />
      <Field value={pw} onChange={setPw} placeholder="비밀번호 (4자 이상)" />
      <Field value={pw2} onChange={setPw2} placeholder="비밀번호 확인" onEnter={submit} />
      {err && <ErrorLine msg={err} />}
      <Button onClick={submit} disabled={busy} className="w-full gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        비밀번호 설정
      </Button>
    </div>
  );
}
