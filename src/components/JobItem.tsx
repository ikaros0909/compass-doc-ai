"use client";

import Link from "next/link";
import { memo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  XCircle,
  ArrowRight,
  Download,
  Cpu,
  Zap,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import type { JobRecord } from "@/types/job";

const ENGINE_META: Record<
  NonNullable<JobRecord["engine"]>,
  { label: string; variant: "success" | "warning"; icon: React.ReactNode; title: string }
> = {
  "opendataloader-pdf": {
    label: "opendataloader-pdf",
    variant: "success",
    icon: <Cpu className="h-3 w-3" />,
    title: "Java 엔진으로 변환 — 고품질 구조 JSON",
  },
  "pdfjs-fallback": {
    label: "pdfjs fallback",
    variant: "warning",
    icon: <Zap className="h-3 w-3" />,
    title: "Java 미사용 → pdfjs 텍스트 추출로 대체 변환",
  },
};

interface JobItemProps {
  job: JobRecord;
  onDelete?: (jobId: string) => void | Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (jobId: string, next: boolean) => void;
}

const STATUS_META: Record<
  JobRecord["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "info"; icon: React.ReactNode }
> = {
  queued: { label: "대기", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  processing: {
    label: "진행중",
    variant: "info",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "완료",
    variant: "success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: { label: "실패", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  canceled: { label: "취소", variant: "secondary", icon: <XCircle className="h-3 w-3" /> },
};

function JobItemComponent({
  job,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
}: JobItemProps) {
  const meta = STATUS_META[job.status];
  const showBar = job.status === "processing" || job.status === "queued";
  const barWidth = job.status === "processing" ? Math.max(5, job.progress) : 0;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canSelect = selectable && job.status === "completed";

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(job.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors",
        job.status === "processing" && "border-sky-500/40",
        job.status === "completed" && "hover:bg-accent/30",
        job.status === "failed" && "border-destructive/30 bg-destructive/5"
      )}
    >
      {selectable && (
        <div className="mt-0.5 shrink-0">
          <Checkbox
            checked={canSelect ? selected : false}
            disabled={!canSelect}
            onChange={(e) => onSelectChange?.(job.id, e.target.checked)}
            title={canSelect ? "내보내기 대상으로 선택" : "완료된 작업만 선택 가능"}
          />
        </div>
      )}
      <div className="mt-0.5 shrink-0">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={job.originalName}>
            {job.originalName}
          </span>
          <Badge variant={meta.variant} className="gap-1">
            {meta.icon}
            {meta.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>#{job.orderIndex + 1}</span>
          <span>{formatBytes(job.sizeBytes)}</span>
          {job.durationMs !== null && <span>⏱ {formatDuration(job.durationMs)}</span>}
          {job.engine && (
            <Badge
              variant={ENGINE_META[job.engine].variant}
              className="gap-1 text-[10px]"
              title={
                job.fallbackReason
                  ? `${ENGINE_META[job.engine].title}\n\n${job.fallbackReason}`
                  : ENGINE_META[job.engine].title
              }
            >
              {ENGINE_META[job.engine].icon}
              {ENGINE_META[job.engine].label}
            </Badge>
          )}
          {job.error && (
            <span className="text-destructive" title={job.error}>
              ⚠ {job.error.slice(0, 80)}
            </span>
          )}
        </div>

        {showBar && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            {job.status === "processing" ? (
              <div
                className="h-full bg-sky-500 transition-all"
                style={{ width: `${barWidth}%` }}
              />
            ) : (
              <div className="h-full w-1/4 processing-bar" />
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1 transition-opacity",
          confirming ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        )}
      >
        {job.status === "completed" && !confirming && (
          <>
            <Button asChild variant="ghost" size="icon" title="JSON 다운로드">
              <a href={`/api/jobs/${job.id}/json?download=1`}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="icon" title="상세 보기">
              <Link href={`/jobs/${job.id}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        )}
        {onDelete && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            title="삭제"
            onClick={() => setConfirming(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {onDelete && confirming && (
          <>
            <span className="mr-1 text-xs text-destructive">삭제하시겠습니까?</span>
            <Button
              variant="destructive"
              size="icon"
              title="확인"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="취소"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export const JobItem = memo(JobItemComponent);
