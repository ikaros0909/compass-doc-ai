"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Download,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/utils";
import type { JobRecord } from "@/types/job";

interface CreateExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobs: JobRecord[];
  onCreated: (exportId: string) => void;
}

/**
 * Mogib1/Mogib2 입력 + 선택한 PDF 목록 확인 → 서버로 POST /api/exports 호출.
 * 생성 성공 시 ExportPreviewDialog를 열기 위해 onCreated(id)를 호출한다.
 */
export function CreateExportDialog({
  open,
  onOpenChange,
  selectedJobs,
  onCreated,
}: CreateExportDialogProps) {
  const [mogib1, setMogib1] = useState("");
  const [mogib2, setMogib2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    if (!mogib1.trim() || !mogib2.trim()) {
      setError("Mogib1, Mogib2 를 모두 입력해주세요.");
      return;
    }
    if (selectedJobs.length === 0) {
      setError("선택된 완료 PDF가 없습니다.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: selectedJobs.map((j) => j.id),
          mogib1: mogib1.trim(),
          mogib2: mogib2.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data?.detail)) {
          const lines = (
            data.detail as Array<{ baseName: string; originalNames: string[] }>
          )
            .map(
              (d) =>
                `• ${d.baseName} — ${d.originalNames.length}건: ${d.originalNames.join(", ")}`
            )
            .join("\n");
          setError(`${data.error}\n\n${lines}`);
        } else {
          setError(data?.detail || data?.error || `HTTP ${res.status}`);
        }
        return;
      }
      onCreated(data.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>db3 내보내기</DialogTitle>
          <DialogDescription>
            선택한 완료 PDF 학생부를 hsb.db3 스키마에 맞춰 새 SQLite 파일로 저장합니다.
            파일명은 생성 시각 기준으로 자동 부여됩니다 (예: hsb_2026-04-23_153045.db3).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mogib1">Mogib1</Label>
              <Input
                id="mogib1"
                value={mogib1}
                placeholder="예: 0"
                onChange={(e) => setMogib1(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mogib2">Mogib2</Label>
              <Input
                id="mogib2"
                value={mogib2}
                placeholder="예: SAMPLE-001"
                onChange={(e) => setMogib2(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            모든 테이블의 Mogib1/Mogib2 컬럼에 동일한 값으로 기록됩니다. SchoolCode는
            비워두고 생성 이후 관리자가 편집 모드에서 입력합니다.
          </p>

          <div className="space-y-1.5">
            <div className="text-sm font-medium">
              선택된 PDF ({selectedJobs.length}건)
            </div>
            <ScrollArea className="h-48 rounded-md border">
              <ul className="divide-y text-xs">
                {selectedJobs.map((j, i) => (
                  <li key={j.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-6 shrink-0 text-right text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="truncate font-mono" title={j.originalName}>
                      {j.originalName}
                    </span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {formatBytes(j.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap break-all">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 생성 중…
              </>
            ) : (
              "생성"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExportPreviewDialogProps {
  exportId: string | null;
  onClose: () => void;
}

interface ExportDetail {
  id: string;
  fileName: string;
  mogib1: string;
  mogib2: string;
  studentCount: number;
  tableCounts: Record<string, number>;
  warnings: string[];
  sizeBytes: number;
  createdAt: string;
  tables: Array<{
    name: string;
    rowCount: number;
    columns: string[];
    sampleRows: Array<Record<string, unknown>>;
  }>;
}

const PAGE_SIZE = 50;

interface TablePage {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
}

/**
 * 생성/선택된 export의 내용을 테이블별로 보여준다. "다운로드" 버튼이 최종 단계.
 */
export function ExportPreviewDialog({
  exportId,
  onClose,
}: ExportPreviewDialogProps) {
  const [data, setData] = useState<ExportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [page, setPage] = useState<TablePage | null>(null);
  const [offset, setOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    if (!exportId) {
      setData(null);
      setError(null);
      setActiveTable(null);
      setPage(null);
      setOffset(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/exports/${exportId}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.detail || json?.error || `HTTP ${res.status}`);
          return;
        }
        setData(json as ExportDetail);
        setActiveTable(
          (json as ExportDetail).tables.find((t) => t.rowCount > 0)?.name ?? null
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportId]);

  const active = useMemo(
    () => data?.tables.find((t) => t.name === activeTable) ?? null,
    [data, activeTable]
  );

  const loadPage = useCallback(
    async (table: string, off: number) => {
      if (!exportId) return;
      setPageLoading(true);
      try {
        const res = await fetch(
          `/api/exports/${exportId}/table/${table}?limit=${PAGE_SIZE}&offset=${off}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json?.detail || json?.error || `HTTP ${res.status}`);
          setPage(null);
          return;
        }
        setPage({ columns: json.columns, rows: json.rows, total: json.total });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPageLoading(false);
      }
    },
    [exportId]
  );

  useEffect(() => {
    if (!activeTable || !exportId) {
      setPage(null);
      return;
    }
    setOffset(0);
    void loadPage(activeTable, 0);
  }, [activeTable, exportId, loadPage]);

  useEffect(() => {
    if (!activeTable || !exportId) return;
    void loadPage(activeTable, offset);
  }, [offset, activeTable, exportId, loadPage]);

  const total = page?.total ?? active?.rowCount ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(total, offset + (page?.rows.length ?? 0));

  return (
    <Dialog open={exportId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[min(97vw,1100px)]">
        <DialogHeader>
          <DialogTitle>
            {data ? data.fileName : "미리보기 로딩 중..."}
          </DialogTitle>
          <DialogDescription>
            {data ? (
              <>
                {data.studentCount}명 · {formatBytes(data.sizeBytes)} · Mogib1=
                <code className="font-mono">{data.mogib1}</code>, Mogib2=
                <code className="font-mono">{data.mogib2}</code>
              </>
            ) : (
              "db3 파일을 읽고 있습니다"
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {data && (
          <>
            {data.warnings.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
                <div className="font-medium">경고 ({data.warnings.length}건)</div>
                <ScrollArea className="max-h-24">
                  <ul className="space-y-0.5">
                    {data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <ScrollArea className="h-[340px] rounded-md border">
                <div className="space-y-0.5 p-1">
                  {data.tables.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setActiveTable(t.name)}
                      className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                        activeTable === t.name ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <Badge
                        variant={t.rowCount > 0 ? "success" : "secondary"}
                        className="ml-2 h-4 px-1 text-[10px]"
                      >
                        {t.rowCount}
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="rounded-md border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
                  <div className="min-w-0 truncate">
                    {active ? (
                      <>
                        <span className="font-semibold">{active.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          총 {total.toLocaleString()}행
                          {total > 0 && (
                            <>
                              {" · "}
                              {pageStart.toLocaleString()}–
                              {pageEnd.toLocaleString()} 표시
                            </>
                          )}
                        </span>
                        <Link
                          href={`/exports/${data.id}?table=${active.name}`}
                          className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                          target="_blank"
                        >
                          새 탭 <ExternalLink className="h-3 w-3" />
                        </Link>
                      </>
                    ) : (
                      "테이블을 선택하세요"
                    )}
                  </div>
                  {active && total > PAGE_SIZE && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={offset === 0 || pageLoading}
                        onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={offset + PAGE_SIZE >= total || pageLoading}
                        onClick={() => setOffset((o) => o + PAGE_SIZE)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="h-[360px] overflow-auto">
                  {!active ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      (테이블을 선택하세요)
                    </div>
                  ) : pageLoading && !page ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 로딩 중…
                    </div>
                  ) : page && page.rows.length > 0 ? (
                    <table className="w-max min-w-full border-collapse text-[11px]">
                      <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                        <tr>
                          {page.columns.map((c) => (
                            <th
                              key={c}
                              className="whitespace-nowrap border-b px-2 py-1.5 text-left font-medium"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {page.rows.map((r, i) => (
                          <tr
                            key={i}
                            className="border-b last:border-b-0 align-top hover:bg-accent/30"
                          >
                            {page.columns.map((c) => (
                              <td
                                key={c}
                                className="max-w-[240px] truncate whitespace-nowrap px-2 py-1"
                                title={String(r[c] ?? "")}
                              >
                                {r[c] === null || r[c] === undefined
                                  ? ""
                                  : String(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      (빈 테이블)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          {data && (
            <Button asChild>
              <a href={`/api/exports/${data.id}/download`} download>
                <Download className="h-4 w-4" /> db3 다운로드
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
