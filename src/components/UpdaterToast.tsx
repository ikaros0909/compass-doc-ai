"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";

interface ProgressPayload {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface State {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error"
    | "not-available";
  version?: string;
  current?: string;
  latest?: string;
  progress?: ProgressPayload;
  message?: string;
}

declare global {
  interface Window {
    compassUpdater?: {
      on: (
        event:
          | "checking"
          | "available"
          | "not-available"
          | "progress"
          | "downloaded"
          | "error",
        listener: (payload: unknown) => void
      ) => () => void;
      checkNow: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
    };
  }
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatEta(remainingBytes: number, bps: number): string {
  if (!bps || bps <= 0) return "—";
  const sec = Math.max(0, Math.round(remainingBytes / bps));
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}

export function UpdaterToast() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const api = window.compassUpdater;
    if (!api) return;

    const offs: Array<() => void> = [];
    offs.push(
      api.on("checking", () => {
        setHidden(false);
        setState({ status: "checking" });
      })
    );
    offs.push(
      api.on("available", (p) => {
        const payload = p as { version: string };
        setHidden(false);
        setState({
          status: "available",
          version: payload.version,
        });
      })
    );
    offs.push(
      api.on("not-available", (p) => {
        const payload = p as { current: string; latest: string };
        setState({
          status: "not-available",
          current: payload.current,
          latest: payload.latest,
        });
        // 최신 상태는 잠깐만 보여주고 자동 숨김
        setTimeout(() => setHidden(true), 4000);
      })
    );
    offs.push(
      api.on("progress", (p) => {
        const payload = p as ProgressPayload;
        setHidden(false);
        setState({
          status: "downloading",
          progress: payload,
        });
      })
    );
    offs.push(
      api.on("downloaded", (p) => {
        const payload = p as { version: string };
        setHidden(false);
        setState({ status: "downloaded", version: payload.version });
      })
    );
    offs.push(
      api.on("error", (p) => {
        const payload = p as { message: string };
        setHidden(false);
        setState({ status: "error", message: payload.message });
      })
    );

    return () => {
      for (const off of offs) off();
    };
  }, []);

  if (hidden || state.status === "idle") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center">
      <div className="pointer-events-auto w-full max-w-[680px] rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur">
        {state.status === "checking" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 업데이트 확인 중…
          </div>
        )}

        {state.status === "not-available" && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              현재 버전이 최신입니다 ({state.current})
            </span>
            <button
              onClick={() => setHidden(true)}
              className="rounded p-1 hover:bg-accent"
              aria-label="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {state.status === "available" && (
          <div className="text-xs text-muted-foreground">
            새 버전 <strong>{state.version}</strong> 발견 — 다운로드 시작…
          </div>
        )}

        {state.status === "downloading" && state.progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                업데이트 다운로드 {state.progress.percent.toFixed(1)}%
              </span>
              <span className="text-muted-foreground">
                {formatBytes(state.progress.transferred)} /{" "}
                {formatBytes(state.progress.total)} ·{" "}
                {formatBytes(state.progress.bytesPerSecond)}/s · 남은 시간{" "}
                {formatEta(
                  state.progress.total - state.progress.transferred,
                  state.progress.bytesPerSecond
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${state.progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {state.status === "downloaded" && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>
              새 버전 <strong>{state.version}</strong> 다운로드 완료. 재시작 시 적용됩니다.
            </span>
            <button
              onClick={() => window.compassUpdater?.quitAndInstall()}
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
            >
              <RefreshCw className="h-3 w-3" /> 지금 재시작
            </button>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-destructive">
              업데이트 실패: {state.message}
            </span>
            <button
              onClick={() => setHidden(true)}
              className="rounded p-1 hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
