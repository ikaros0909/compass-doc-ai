"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  Loader2,
  FileWarning,
  Info,
  ShieldCheck,
  WifiOff,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface DropzoneProps {
  onUploaded?: (batchId: string, count: number) => void;
  /** 작업이 이미 있을 때 쓰는 슬림 업로드 바 */
  compact?: boolean;
}

export function Dropzone({ onUploaded, compact = false }: DropzoneProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const upload = useCallback(
    async (files: File[]) => {
      setError(null);
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length === 0) {
        setError("PDF 파일만 업로드 가능합니다.");
        return;
      }

      setBusy(true);
      setProgress(0);

      try {
        const form = new FormData();
        pdfs
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .forEach((file) => form.append("files", file, file.name));

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.round((ev.loaded / ev.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                onUploaded?.(data.batchId, data.count);
                resolve();
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("network error"));
          xhr.send(form);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setProgress(0);
      }
    },
    [onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop: upload,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    disabled: busy,
  });

  const totalSize = acceptedFiles.reduce((sum, f) => sum + f.size, 0);

  if (compact) {
    return (
      <div className="space-y-2">
        <div
          {...getRootProps()}
          title="수험번호.pdf 형식 · 끌어다 놓거나 클릭해 추가"
          className={cn(
            "group flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]",
            isDragActive && "border-primary bg-primary/5",
            busy && "cursor-not-allowed opacity-80"
          )}
        >
          <input {...getInputProps()} />
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <span className="text-xs font-medium">업로드 중… {progress}%</span>
              <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                <UploadCloud className="h-4 w-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-semibold">PDF 추가</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  끌어다 놓거나 클릭
                </p>
              </div>
            </>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            <FileWarning className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── 업로드 드롭존 ───────────────────────────────────────── */}
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-card/80 to-card/20 px-6 py-12 text-center transition-all duration-300",
          "hover:border-primary/50 hover:from-primary/[0.04] hover:to-transparent",
          !busy && !isDragActive && "dropzone-pulse",
          isDragActive && "border-primary !from-primary/10 ring-2 ring-primary/20",
          busy && "cursor-not-allowed opacity-80"
        )}
      >
        <input {...getInputProps()} />

        {busy ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-11 w-11 animate-spin text-primary" />
            <div className="text-sm font-medium text-foreground">
              업로드 중… {progress}%
            </div>
            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-background/60 shadow-sm ring-1 ring-inset ring-white/5 transition-all duration-300 group-hover:scale-105 group-hover:border-primary/40">
              <UploadCloud className="h-8 w-8 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold tracking-tight">
                학생부 PDF를 끌어다 놓으세요
              </p>
              <p className="text-xs text-muted-foreground">
                수백 개 한 번에 가능 · 파일명 오름차순으로 순차 처리
              </p>
              <p className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />이 PC 안에서만 처리 · 인터넷
                업로드 없음
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" className="mt-1 shadow-sm">
              파일 선택
            </Button>
          </div>
        )}
      </div>

      {/* ── 개인정보 안내 (접이식) ──────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPrivacyOpen((v) => !v);
          }}
          aria-expanded={privacyOpen}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-emerald-500/[0.06]"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="flex-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            개인정보는 인터넷으로 나가지 않습니다
            <span className="ml-1 font-normal text-muted-foreground">
              — 완전 로컬 처리
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-emerald-600/70 transition-transform duration-300 dark:text-emerald-400/70",
              privacyOpen && "rotate-180"
            )}
          />
        </button>
        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            privacyOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <ul className="space-y-2 px-3.5 pb-3.5 pt-0.5 text-xs leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2">
                <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  업로드한 학생부 PDF와 변환 결과(JSON·DB)는{" "}
                  <span className="font-medium text-foreground">
                    전부 이 컴퓨터 안에서만
                  </span>{" "}
                  처리·저장됩니다. 외부 서버나 클라우드로 전송하지 않으며,{" "}
                  <span className="font-medium text-foreground">
                    인터넷이 끊겨 있어도
                  </span>{" "}
                  정상 동작합니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  저장 위치는 내 PC의 데이터 폴더뿐입니다 (상단 메뉴{" "}
                  <span className="font-medium text-foreground">
                    도움말 → 데이터 폴더 열기
                  </span>
                  에서 직접 확인).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  인터넷은 오직{" "}
                  <span className="font-medium text-foreground">
                    프로그램 업데이트 확인
                  </span>
                  에만 쓰이며, 그때도 학생부 파일이나 변환 데이터는 전송되지 않습니다.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── 파일명 규칙 ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">파일명 규칙</p>
          <p className="leading-relaxed text-muted-foreground">
            <code className="rounded bg-background px-1 py-0.5 font-mono text-foreground">
              수험번호.pdf
            </code>{" "}
            형식으로 업로드해주세요. 파일명(확장자 제외)이 db3의{" "}
            <code className="font-mono text-foreground">SocialNumber</code> 컬럼에
            그대로 기록됩니다. 예:{" "}
            <code className="font-mono text-foreground">10999-001.pdf</code>
          </p>
        </div>
      </div>

      {acceptedFiles.length > 0 && !busy && (
        <p className="text-center text-xs text-muted-foreground">
          마지막 업로드:{" "}
          <span className="font-medium text-foreground">
            {acceptedFiles.length}개
          </span>{" "}
          · {formatBytes(totalSize)}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <FileWarning className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
