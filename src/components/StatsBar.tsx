"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Loader2, XCircle, FileText } from "lucide-react";

interface Summary {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}

export function StatsBar({ summary }: { summary: Summary }) {
  const done = summary.completed + summary.failed;
  const pct = summary.total ? Math.round((done / summary.total) * 100) : 0;

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
          </div>
        )}
      </CardContent>
    </Card>
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
