"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, Loader2, FileWarning, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface DropzoneProps {
  onUploaded?: (batchId: string, count: number) => void;
}

export function Dropzone({ onUploaded }: DropzoneProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

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

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-10 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          busy && "cursor-not-allowed opacity-70"
        )}
      >
        <input {...getInputProps()} />
        {busy ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">
              업로드 중… {progress}%
            </div>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">
                학생부 PDF를 이 영역에 끌어다 놓으세요
              </p>
              <p className="text-xs text-muted-foreground">
                수백 개 한 번에 가능 · 파일명 기준 오름차순으로 순차 처리됩니다
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary">
              파일 선택
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="font-medium">파일명 규칙:</p>
          <p className="text-muted-foreground">
            <code className="rounded bg-background px-1 py-0.5 font-mono">
              수험번호.pdf
            </code>{" "}
            형식으로 업로드해주세요. 파일명(확장자 제외)이 db3의{" "}
            <code className="font-mono">SocialNumber</code> 컬럼에 그대로
            기록됩니다. 예: <code className="font-mono">10999-001.pdf</code>
          </p>
        </div>
      </div>

      {acceptedFiles.length > 0 && !busy && (
        <div className="text-xs text-muted-foreground">
          마지막 업로드: {acceptedFiles.length}개 · {formatBytes(totalSize)}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <FileWarning className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
