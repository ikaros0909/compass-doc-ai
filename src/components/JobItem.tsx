"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
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
  RotateCw,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { JobSubjectsDialog } from "./JobSubjectsDialog";
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
  "opendataloader-pdf-hybrid": {
    label: "opendataloader hybrid + OCR",
    variant: "success",
    icon: <Cpu className="h-3 w-3" />,
    title: "Java 엔진 + Python(docling-fast) 백엔드로 OCR/표 인식 강화 (이미지 PDF 지원)",
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
  onRetry?: (jobId: string) => void | Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (jobId: string, next: boolean) => void;
  /** 전역 과목코드 매핑이 바뀔 때 증가 — 미매핑 배지 재조회 트리거 */
  mappingVersion?: number;
  /** 이 작업에서 과목을 매핑 저장했을 때 — 부모가 전역 매핑/배지를 갱신 */
  onMappingChanged?: () => void;
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
  onRetry,
  selectable = false,
  selected = false,
  onSelectChange,
  mappingVersion = 0,
  onMappingChanged,
}: JobItemProps) {
  const meta = STATUS_META[job.status];
  const showBar = job.status === "processing" || job.status === "queued";
  const barWidth = job.status === "processing" ? Math.max(5, job.progress) : 0;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [subjectInfo, setSubjectInfo] = useState<
    { total: number; unmappedCount: number } | null
  >(null);
  const canSelect = selectable && job.status === "completed";

  // 완료 작업의 과목코드 매핑 점검 — 미매핑 여부를 처리 목록에 표시.
  useEffect(() => {
    if (job.status !== "completed") {
      setSubjectInfo(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/subjects`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { total: number; unmappedCount: number };
        if (alive) setSubjectInfo({ total: data.total, unmappedCount: data.unmappedCount });
      } catch {
        /* 무시 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [job.id, job.status, mappingVersion]);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry(job.id);
    } finally {
      setRetrying(false);
    }
  };

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
          {job.status === "completed" && subjectInfo && subjectInfo.total > 0 && (
            <button
              type="button"
              onClick={() => setSubjectsOpen(true)}
              title="과목코드 매핑 점검 / 수작업 매핑"
            >
              {subjectInfo.unmappedCount > 0 ? (
                <Badge variant="warning" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  과목 미매핑 {subjectInfo.unmappedCount}
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <ListChecks className="h-3 w-3" />
                  과목코드 OK
                </Badge>
              )}
            </button>
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
            <Button
              variant="ghost"
              size="icon"
              title="과목코드 매핑 점검 / 수작업 매핑"
              onClick={() => setSubjectsOpen(true)}
              className={cn(
                subjectInfo && subjectInfo.unmappedCount > 0 &&
                  "text-amber-600 hover:text-amber-700 dark:text-amber-400"
              )}
            >
              <ListChecks className="h-4 w-4" />
            </Button>
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
        {job.status === "failed" && onRetry && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            title="재시도 (다시 변환)"
            onClick={handleRetry}
            disabled={retrying}
            className="text-muted-foreground hover:text-sky-600 dark:hover:text-sky-400"
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </Button>
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

      {job.status === "completed" && (
        <JobSubjectsDialog
          jobId={job.id}
          jobName={job.originalName}
          open={subjectsOpen}
          onOpenChange={setSubjectsOpen}
          onMapped={onMappingChanged}
        />
      )}
    </div>
  );
}

export const JobItem = memo(JobItemComponent);
