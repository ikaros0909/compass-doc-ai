"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
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

interface SubjectStatus {
  subjectName: string;
  subjectCode: string;
  mapped: boolean;
}

interface JobSubjectsDialogProps {
  jobId: string;
  jobName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 매핑 저장 성공 시 — 부모가 전역 매핑/배지를 갱신하도록 */
  onMapped?: () => void;
}

/**
 * 한 PDF(작업)의 과목들이 과목코드 매핑표에 매핑됐는지 보여주고, 미매핑 과목에
 * 코드를 직접 입력해 저장(수작업 매핑)할 수 있다.
 */
export function JobSubjectsDialog({
  jobId,
  jobName,
  open,
  onOpenChange,
  onMapped,
}: JobSubjectsDialogProps) {
  const [subjects, setSubjects] = useState<SubjectStatus[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/subjects`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        setSubjects([]);
        return;
      }
      setSubjects(data.subjects as SubjectStatus[]);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (open) void load();
    else {
      setSubjects([]);
      setEdits({});
      setError(null);
    }
  }, [open, load]);

  const unmapped = subjects.filter((s) => !s.mapped);
  const pendingEntries = Object.entries(edits)
    .map(([subjectName, subjectCode]) => ({ subjectName, subjectCode: subjectCode.trim() }))
    .filter((e) => e.subjectCode.length > 0);

  const save = async () => {
    if (pendingEntries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/subject-codes/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: pendingEntries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      await load();
      onMapped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,720px)] w-[min(94vw,760px)] flex-col">
        <DialogHeader>
          <DialogTitle className="truncate" title={jobName}>
            과목코드 매핑 점검 — {jobName}
          </DialogTitle>
          <DialogDescription>
            이 PDF의 과목이 과목코드 매핑표에 있는지 확인합니다. 미매핑 과목에
            코드를 입력하고 저장하면 매핑표에 추가되어 이후 모든 내보내기에 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2">
          {loading ? (
            <Badge variant="secondary" className="h-6 gap-1 px-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 확인 중…
            </Badge>
          ) : unmapped.length > 0 ? (
            <Badge variant="warning" className="h-6 gap-1 px-2">
              <AlertTriangle className="h-3.5 w-3.5" /> 미매핑 {unmapped.length}과목
            </Badge>
          ) : subjects.length > 0 ? (
            <Badge variant="success" className="h-6 gap-1 px-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> 전체 매핑됨 ({subjects.length}과목)
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-6 px-2">
              과목 없음
            </Badge>
          )}
        </div>

        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap break-all">{error}</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <div className="shrink-0 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            과목 {subjects.length}개 · 미매핑 과목은 코드를 입력해 저장하세요
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!loading && subjects.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                추출된 과목이 없습니다.
              </div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr>
                    <th className="border-b px-3 py-1.5 text-left font-medium">과목명</th>
                    <th className="w-48 border-b px-3 py-1.5 text-left font-medium">
                      과목코드
                    </th>
                    <th className="w-20 border-b px-3 py-1.5 text-left font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr
                      key={s.subjectName}
                      className={
                        s.mapped
                          ? "border-b last:border-b-0"
                          : "border-b bg-amber-500/[0.06] last:border-b-0"
                      }
                    >
                      <td className="px-3 py-1.5">{s.subjectName}</td>
                      <td className="px-3 py-1.5">
                        {s.mapped ? (
                          <span className="font-mono text-muted-foreground">
                            {s.subjectCode}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={edits[s.subjectName] ?? ""}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [s.subjectName]: e.target.value,
                              }))
                            }
                            placeholder="코드 입력"
                            className="h-7 w-40 rounded border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {s.mapped ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 매핑
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" /> 미매핑
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {pendingEntries.length > 0
              ? `${pendingEntries.length}건 입력됨 — 저장하면 매핑표에 추가됩니다`
              : "미매핑 과목에 코드를 입력하세요"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              닫기
            </Button>
            <Button onClick={save} disabled={saving || pendingEntries.length === 0} className="gap-1.5">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              매핑 저장 ({pendingEntries.length})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
