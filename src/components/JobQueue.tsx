"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropzone } from "./Dropzone";
import { StatsBar } from "./StatsBar";
import { JobItem } from "./JobItem";
import { CreateExportDialog, ExportPreviewDialog } from "./ExportDialogs";
import { useJobEvents } from "@/hooks/useJobEvents";
import type { BatchSummary, JobRecord } from "@/types/job";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check,
  Database,
  Filter,
  History,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";

type JobFilter = "all" | "active" | "completed" | "failed";

interface Summary {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}

export function JobQueue() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    queued: 0,
  });
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobFilter>("all");
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    const url = activeBatch ? `/api/jobs?batchId=${activeBatch}` : "/api/jobs";
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as {
      jobs: JobRecord[];
      summary: Summary;
      batches: BatchSummary[];
    };
    setJobs(data.jobs);
    setSummary(data.summary);
    setBatches(data.batches);
  }, [activeBatch]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  useJobEvents((event) => {
    if (event.type === "job.queued") {
      setJobs((prev) => {
        if (prev.some((j) => j.id === event.job.id)) return prev;
        return [event.job, ...prev];
      });
      setSummary((s) => ({
        ...s,
        total: s.total + 1,
        queued: s.queued + 1,
      }));
      void fetchJobs();
      return;
    }
    if (event.type === "job.started") {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === event.jobId
            ? { ...j, status: "processing", startedAt: event.startedAt, progress: 5 }
            : j
        )
      );
      setSummary((s) => ({
        ...s,
        queued: Math.max(0, s.queued - 1),
        processing: s.processing + 1,
      }));
      return;
    }
    if (event.type === "job.progress") {
      setJobs((prev) =>
        prev.map((j) => (j.id === event.jobId ? { ...j, progress: event.progress } : j))
      );
      return;
    }
    if (event.type === "job.completed") {
      setJobs((prev) => prev.map((j) => (j.id === event.job.id ? event.job : j)));
      setSummary((s) => ({
        ...s,
        processing: Math.max(0, s.processing - 1),
        completed: s.completed + 1,
      }));
      return;
    }
    if (event.type === "job.failed") {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === event.jobId
            ? { ...j, status: "failed", error: event.error, progress: j.progress }
            : j
        )
      );
      setSummary((s) => ({
        ...s,
        processing: Math.max(0, s.processing - 1),
        failed: s.failed + 1,
      }));
    }
  });

  const filtered = useMemo(() => {
    let list: JobRecord[];
    switch (filter) {
      case "active":
        list = jobs.filter((j) => j.status === "queued" || j.status === "processing");
        break;
      case "completed":
        list = jobs.filter((j) => j.status === "completed");
        break;
      case "failed":
        list = jobs.filter((j) => j.status === "failed");
        break;
      default:
        list = jobs;
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((j) => j.originalName.toLowerCase().includes(q));
    return list;
  }, [jobs, filter, query]);

  // 진행 헤드업: 현재 처리 중 파일 + 완료 평균 소요시간 기반 ETA
  const processingJob = useMemo(
    () => jobs.find((j) => j.status === "processing") ?? null,
    [jobs]
  );
  const etaMs = useMemo(() => {
    const ds = jobs
      .filter((j) => j.status === "completed" && typeof j.durationMs === "number")
      .map((j) => j.durationMs as number);
    if (ds.length === 0) return null;
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    const remaining = summary.queued + summary.processing;
    return remaining > 0 ? Math.round(avg * remaining) : null;
  }, [jobs, summary.queued, summary.processing]);

  // 진행 중 항목은 목록 상단에 고정, 나머지는 스크롤 영역에
  const pinnedJobs = useMemo(
    () => filtered.filter((j) => j.status === "processing"),
    [filtered]
  );
  const listJobs = useMemo(
    () => filtered.filter((j) => j.status !== "processing"),
    [filtered]
  );
  const failedInView = useMemo(
    () => filtered.filter((j) => j.status === "failed"),
    [filtered]
  );

  const selectableFiltered = useMemo(
    () => filtered.filter((j) => j.status === "completed"),
    [filtered]
  );
  const selectedJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed" && selected.has(j.id)),
    [jobs, selected]
  );
  const allSelectableSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((j) => selected.has(j.id));
  const someSelectableSelected =
    !allSelectableSelected &&
    selectableFiltered.some((j) => selected.has(j.id));

  const toggleSelect = useCallback((jobId: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (allSelectableSelected) {
        for (const j of selectableFiltered) copy.delete(j.id);
      } else {
        for (const j of selectableFiltered) copy.add(j.id);
      }
      return copy;
    });
  }, [allSelectableSelected, selectableFiltered]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    clearSelection();
  }, [clearSelection]);

  const onUploaded = useCallback(
    (batchId: string) => {
      setActiveBatch(batchId);
      void fetchJobs();
    },
    [fetchJobs]
  );

  const deleteJob = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      alert(`삭제 실패: ${res.status} ${body}`);
      return;
    }
    setJobs((prev) => {
      const removed = prev.find((j) => j.id === jobId);
      if (removed) {
        setSummary((s) => ({
          total: Math.max(0, s.total - 1),
          completed: removed.status === "completed" ? Math.max(0, s.completed - 1) : s.completed,
          failed: removed.status === "failed" ? Math.max(0, s.failed - 1) : s.failed,
          processing: removed.status === "processing" ? Math.max(0, s.processing - 1) : s.processing,
          queued: removed.status === "queued" ? Math.max(0, s.queued - 1) : s.queued,
        }));
      }
      return prev.filter((j) => j.id !== jobId);
    });
    void fetchJobs();
  }, [fetchJobs]);

  const retryJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`재시도 실패: ${res.status} ${body}`);
        return;
      }
      await fetchJobs();
    },
    [fetchJobs]
  );

  const retryFailed = useCallback(async () => {
    const targets = failedInView;
    if (targets.length === 0) return;
    if (!confirm(`실패한 ${targets.length}건을 다시 시도할까요?`)) return;
    await Promise.allSettled(
      targets.map((j) => fetch(`/api/jobs/${j.id}/retry`, { method: "POST" }))
    );
    await fetchJobs();
  }, [failedInView, fetchJobs]);

  const deleteFiltered = useCallback(async () => {
    const targets = filtered.filter(
      (j) => j.status === "completed" || j.status === "failed"
    );
    if (targets.length === 0) return;
    if (!confirm(`현재 필터의 완료/실패 작업 ${targets.length}건을 삭제할까요?`)) return;
    await Promise.allSettled(
      targets.map((j) => fetch(`/api/jobs/${j.id}`, { method: "DELETE" }))
    );
    await fetchJobs();
  }, [filtered, fetchJobs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {jobs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xl">
            <Dropzone onUploaded={onUploaded} />
          </div>
        </div>
      ) : (
        <>
          {/* 적응형 상단 밴드: 슬림 업로드 + 가로 통계/진행 */}
          <div className="shrink-0 rounded-2xl border bg-card/60 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="lg:w-64 lg:shrink-0">
                <Dropzone onUploaded={onUploaded} compact />
              </div>
              <div className="lg:flex-1 lg:border-l lg:border-border/60 lg:pl-4">
                <StatsBar
                  summary={summary}
                  activeName={processingJob?.originalName ?? null}
                  etaMs={etaMs}
                  compact
                />
              </div>
            </div>
          </div>

          {/* 본문: 좁은 배치 사이드바 + 넓은 목록 */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
            <aside className="hidden min-h-0 lg:block">
              <Card className="flex h-full min-h-0 flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">최근 배치</CardTitle>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
                  {batches.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      아직 업로드된 배치가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveBatch(null)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                          activeBatch === null && "border-primary bg-accent"
                        )}
                      >
                        <span className="font-medium">전체 보기</span>
                        <span className="text-muted-foreground">{summary.total}</span>
                      </button>
                      {batches.map((b) => (
                        <BatchRow
                          key={b.batchId}
                          batch={b}
                          active={activeBatch === b.batchId}
                          onSelect={() => setActiveBatch(b.batchId)}
                          onDeleted={() => {
                            if (activeBatch === b.batchId) setActiveBatch(null);
                            void fetchJobs();
                          }}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>

            <div className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {(["all", "active", "completed", "failed"] as JobFilter[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                  className="h-7 text-xs"
                >
                  {f === "all"
                    ? "전체"
                    : f === "active"
                    ? "진행/대기"
                    : f === "completed"
                    ? "완료"
                    : "실패"}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="파일명 검색"
                className="h-7 w-36 rounded-md border border-input bg-background pl-7 pr-6 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="검색 지우기"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {selectMode ? (
              <>
                <span className="mr-1 text-xs text-muted-foreground">
                  {selected.size}건 선택
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectAllVisible}
                  disabled={selectableFiltered.length === 0}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Checkbox
                    checked={allSelectableSelected}
                    indeterminate={someSelectableSelected}
                    readOnly
                    className="pointer-events-none"
                  />
                  보이는 완료 전체
                </Button>
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  disabled={selected.size === 0}
                  className="h-7 gap-1 text-xs"
                >
                  <Database className="h-3.5 w-3.5" />
                  db3 생성 ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={exitSelectMode}
                  className="h-7 gap-1 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  선택 종료
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectMode(true)}
                  className="h-7 gap-1 text-xs"
                  title="완료된 PDF를 선택해 hsb.db3로 저장"
                >
                  <Database className="h-3.5 w-3.5" />
                  db3 내보내기
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  title="생성된 db3 히스토리"
                >
                  <Link href="/exports">
                    <History className="h-3.5 w-3.5" />
                    내보낸 목록
                  </Link>
                </Button>
                {failedInView.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void retryFailed()}
                    className="h-7 gap-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400"
                    title="현재 보이는 실패 작업을 모두 다시 시도"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    실패 {failedInView.length}건 재시도
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void deleteFiltered()}
                  disabled={
                    filtered.filter(
                      (j) => j.status === "completed" || j.status === "failed"
                    ).length === 0
                  }
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  title="현재 필터의 완료/실패 작업을 일괄 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  일괄 삭제
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void fetchJobs()}
                  className="h-7 gap-1 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  새로고침
                </Button>
              </>
            )}
          </div>
        </div>

        {selectMode && (
          <div className="shrink-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">선택 모드</span> — 완료된
            PDF만 체크박스로 선택할 수 있어요. 선택 후 상단의{" "}
            <span className="font-medium">db3 생성</span> 버튼을 누르세요.
          </div>
        )}
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {pinnedJobs.length > 0 && (
              <div className="shrink-0 space-y-2 border-b border-sky-500/20 bg-sky-500/[0.04] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  처리 중
                </div>
                {pinnedJobs.map((job) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    onDelete={deleteJob}
                    onRetry={retryJob}
                    selectable={selectMode}
                    selected={selected.has(job.id)}
                    onSelectChange={toggleSelect}
                  />
                ))}
              </div>
            )}
            <ScrollArea className="h-full flex-1">
              <div className="space-y-2 p-3">
                {filtered.length === 0 ? (
                  <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                    {jobs.length === 0
                      ? "PDF를 드롭하면 여기에 순차 처리 상태가 표시됩니다."
                      : query.trim()
                      ? `"${query.trim()}" 검색 결과가 없습니다.`
                      : "필터 조건에 맞는 작업이 없습니다."}
                  </div>
                ) : listJobs.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                    위 항목을 처리하는 중입니다…
                  </div>
                ) : (
                  listJobs.map((job) => (
                    <JobItem
                      key={job.id}
                      job={job}
                      onDelete={deleteJob}
                      onRetry={retryJob}
                      selectable={selectMode}
                      selected={selected.has(job.id)}
                      onSelectChange={toggleSelect}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
            </div>
          </div>
        </>
      )}

      <CreateExportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        selectedJobs={selectedJobs}
        onCreated={(exportId) => {
          setPreviewId(exportId);
          clearSelection();
          setSelectMode(false);
        }}
      />
      <ExportPreviewDialog
        exportId={previewId}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}

interface BatchRowProps {
  batch: BatchSummary;
  active: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}

function BatchRow({ batch: b, active, onSelect, onDeleted }: BatchRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/batches/${b.batchId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`배치 삭제 실패: ${res.status} ${body}`);
        return;
      }
      onDeleted();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs",
          active && "border-primary"
        )}
      >
        <span className="flex-1 truncate text-destructive">
          <span className="font-medium">
            {b.total}개 파일 삭제?
          </span>
          <span className="ml-2 text-muted-foreground">{b.batchId.slice(0, 8)}</span>
        </span>
        <button
          type="button"
          onClick={doDelete}
          disabled={deleting}
          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          title="확인"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
          title="취소"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-accent",
        active && "border-primary bg-accent"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center truncate text-left"
      >
        <span className="font-medium">{formatTimestamp(b.createdAt)}</span>
        <span className="ml-2 text-muted-foreground">{b.batchId.slice(0, 8)}</span>
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {b.processing > 0 && (
          <Badge variant="info" className="h-5 px-1.5 text-[10px]">
            {b.processing}
          </Badge>
        )}
        {b.queued > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {b.queued}
          </Badge>
        )}
        {b.failed > 0 && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            {b.failed}
          </Badge>
        )}
        <Badge variant="success" className="h-5 px-1.5 text-[10px]">
          {b.completed}/{b.total}
        </Badge>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="배치 전체 삭제 (PDF/JSON/DB 행 포함)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
