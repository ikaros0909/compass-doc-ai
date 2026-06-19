"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Loader2, XCircle, FileText } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

interface Summary {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}

export function StatsBar({
  summary,
  activeName,
  etaMs,
  compact = false,
}: {
  summary: Summary;
  activeName?: string | null;
  etaMs?: number | null;
  compact?: boolean;
}) {
  const done = summary.completed + summary.failed;
  const pct = summary.total ? Math.round((done / summary.total) * 100) : 0;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-3.5">
          <CompactStat label="전체" value={summary.total} color="text-foreground" />
          <CompactStat label="대기" value={summary.queued} color="text-muted-foreground" />
          <CompactStat
            label="진행"
            value={summary.processing}
            color={
              summary.processing > 0
                ? "text-sky-600 dark:text-sky-400"
                : "text-muted-foreground"
            }
          />
          <CompactStat
            label="완료"
            value={summary.completed}
            color={
              summary.completed > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          />
          <CompactStat
            label="실패"
            value={summary.failed}
            color={
              summary.failed > 0 ? "text-destructive" : "text-muted-foreground"
            }
          />
        </div>
        {summary.total > 0 && (
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <Progress value={pct} className="flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {done}/{summary.total} · {pct}%
            </span>
          </div>
        )}
        {summary.processing > 0 && activeName && (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="max-w-[220px] truncate" title={activeName}>
              {activeName}
            </span>
            {etaMs != null && etaMs > 0 && (
              <span className="text-muted-foreground">· 약 {formatDuration(etaMs)}</span>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-5 gap-1.5">
          <Stat
            icon={<FileText className="h-4 w-4" />}
            label="전체"
            value={summary.total}
            color="text-foreground"
          />
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label="대기"
            value={summary.queued}
            color="text-muted-foreground"
          />
          <Stat
            icon={
              <Loader2
                className={
                  summary.processing > 0 ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
              />
            }
            label="진행중"
            value={summary.processing}
            color={
              summary.processing > 0
                ? "text-sky-600 dark:text-sky-400"
                : "text-muted-foreground"
            }
          />
          <Stat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="완료"
            value={summary.completed}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            icon={<XCircle className="h-4 w-4" />}
            label="실패"
            value={summary.failed}
            color="text-destructive"
          />
        </div>

        {summary.total > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>전체 진행률</span>
              <span className="tabular-nums">
                {done}/{summary.total} · {pct}%
              </span>
            </div>
            <Progress value={pct} />
            {summary.processing > 0 && activeName && (
              <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                <span className="flex min-w-0 items-center gap-1 text-sky-600 dark:text-sky-400">
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  <span className="truncate" title={activeName}>
                    처리 중: {activeName}
                  </span>
                </span>
                {etaMs != null && etaMs > 0 && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    약 {formatDuration(etaMs)} 남음
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompactStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", color)}>{value}</span>
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-background/50 px-2 py-2">
      <div className={`flex items-center gap-1 ${color}`}>
        {icon}
        <span className="whitespace-nowrap text-[11px] leading-none text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-lg font-semibold leading-none tabular-nums">
        {value}
      </div>
    </div>
  );
}
