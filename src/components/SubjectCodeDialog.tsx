"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Upload,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  FileSpreadsheet,
  RotateCcw,
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
import { Badge } from "@/components/ui/badge";

interface SubjectCodeEntry {
  normName: string;
  subjectName: string;
  subjectCode: string;
  updatedAt: string;
}

interface UploadResult {
  fileName: string;
  sheetName: string | null;
  upserted: number;
  skipped: number;
  inactive: number;
  total: number;
}

interface SubjectCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 매핑 개수가 바뀌면 호출 — 부모 배지 갱신용 */
  onChanged?: (count: number) => void;
}

/**
 * 과목코드 매핑표 관리 — 엑셀(.xlsx/.xls/.csv) 업로드, 검색 조회, 전체 삭제.
 * 업로드된 매핑은 db3 내보내기 시 SubjectName → SubjectCode 채우기에 사용된다.
 */
export function SubjectCodeDialog({
  open,
  onOpenChange,
  onChanged,
}: SubjectCodeDialogProps) {
  const [count, setCount] = useState(0);
  const [entries, setEntries] = useState<SubjectCodeEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/subject-codes?q=${encodeURIComponent(q)}&limit=200`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`);
          return;
        }
        setCount(data.count);
        setEntries(data.entries);
        onChanged?.(data.count);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [onChanged]
  );

  // 열릴 때 초기 로드 + 검색어 디바운스
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [open, query, load]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setQuery("");
    }
  }, [open]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/subject-codes/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || data?.detail || `HTTP ${res.status}`);
        return;
      }
      setResult(data as UploadResult);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const restoreDefault = async () => {
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const res = await fetch("/api/subject-codes/restore-default", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setResult({
        fileName: "앱 내장 기본 과목코드",
        sheetName: null,
        upserted: data.upserted,
        skipped: 0,
        inactive: 0,
        total: data.total,
      });
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const clearAll = async () => {
    if (
      !confirm(
        `과목코드 매핑 ${count.toLocaleString()}건을 모두 삭제할까요? 이후 내보내기에서 SubjectCode 가 비워집니다.`
      )
    )
      return;
    setError(null);
    try {
      const res = await fetch("/api/subject-codes", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || `HTTP ${res.status}`);
        return;
      }
      setResult(null);
      await load("");
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,760px)] w-[min(95vw,820px)] flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            과목코드 매핑표
          </DialogTitle>
          <DialogDescription>
            db3 내보내기 시 과목명으로 SubjectCode 를 자동으로 채웁니다. 설치 시 기본
            과목코드가 내장되어 있으며, 엑셀(.xlsx/.xls/.csv)로 덮어쓰거나 추가할 수
            있습니다. 표준 서식: 시트 <code className="font-mono">과목코드</code>, 컬럼{" "}
            <code className="font-mono">과목코드 / 과목명 / 사용여부</code> (미사용
            행은 제외).
          </DialogDescription>
        </DialogHeader>

        {/* 상단: 현황 + 액션 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={count > 0 ? "success" : "secondary"} className="h-7 px-2.5">
            매핑 {count.toLocaleString()}건
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileChange}
            />
            <Button size="sm" onClick={onPickFile} disabled={uploading} className="gap-1.5">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              엑셀 업로드
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={restoreDefault}
              disabled={uploading}
              className="gap-1.5"
              title="앱에 내장된 기본 과목코드 매핑을 다시 적용"
            >
              <RotateCcw className="h-4 w-4" />
              기본값 복원
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAll}
              disabled={count === 0 || uploading}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              전체 삭제
            </Button>
          </div>
        </div>

        {result && (
          <div className="flex shrink-0 items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium">{result.fileName}</span>
              {result.sheetName && (
                <>
                  {" "}
                  · 시트 <code className="font-mono">{result.sheetName}</code>
                </>
              )}{" "}
              업로드 완료 — <b>{result.upserted.toLocaleString()}</b>건 반영
              {result.inactive > 0 && `, 미사용 ${result.inactive.toLocaleString()}건 제외`}
              {result.skipped > 0 && `, 빈 행 ${result.skipped.toLocaleString()}건 건너뜀`}
              . 총 <b>{result.total.toLocaleString()}</b>건.
            </span>
          </div>
        )}

        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap break-all">{error}</span>
          </div>
        )}

        {/* 검색 */}
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="과목명 또는 코드 검색"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 목록 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <div className="flex shrink-0 items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>
              {query.trim()
                ? `"${query.trim()}" 검색 결과`
                : "전체 (앞 200건)"}{" "}
              · {entries.length}건 표시
            </span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {count === 0
                  ? "업로드된 매핑이 없습니다. 과목코드 엑셀을 업로드하세요."
                  : "검색 결과가 없습니다."}
              </div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr>
                    <th className="border-b px-3 py-1.5 text-left font-medium">과목명</th>
                    <th className="w-40 border-b px-3 py-1.5 text-left font-medium">
                      과목코드
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.normName} className="border-b last:border-b-0 hover:bg-accent/30">
                      <td className="px-3 py-1.5">{e.subjectName}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">
                        {e.subjectCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
