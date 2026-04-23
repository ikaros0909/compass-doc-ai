"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Table2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type {
  RecordSection,
  SectionId,
  StructuredTable,
  StudentRecord,
} from "@/lib/studentRecord";
import { cn } from "@/lib/utils";

const SECTION_ORDER: SectionId[] = [
  "personal",
  "attendance",
  "awards",
  "certificates",
  "activities",
  "grades",
  "reading",
  "behavior",
  "other",
];

interface StudentRecordViewProps {
  record: StudentRecord;
}

export function StudentRecordView({ record }: StudentRecordViewProps) {
  const ordered = [...record.sections].sort(
    (a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id)
  );

  return (
    <div className="space-y-4">
      <MetaCard record={record} />
      {record.warnings.length > 0 && <WarningsCard warnings={record.warnings} />}
      {ordered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            인식된 섹션이 없습니다. 원본 PDF 구조가 다를 수 있어요. 상단의 원문 탭을
            확인해주세요.
          </CardContent>
        </Card>
      ) : (
        ordered.map((s) => <SectionCard key={s.id + s.title} section={s} />)
      )}
    </div>
  );
}

function MetaCard({ record }: { record: StudentRecord }) {
  const m = record.meta;
  const items: Array<[string, string | undefined]> = [
    ["학교", m.school],
    ["발급일", m.issuedAt],
    ["학년", m.grade ? `${m.grade}학년` : undefined],
    ["반", m.classNo],
    ["번호", m.studentNo],
    ["페이지", m.pageCount ? `${m.pageCount}p` : undefined],
  ];
  const shown = items.filter(([, v]) => v);
  if (shown.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm">
        {shown.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="font-medium tabular-nums">{v}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 space-y-1 text-xs text-amber-800 dark:text-amber-300">
            {warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 섹션 내 복수 표가 있을 때 각 표 상단에 붙일 짧은 라벨.
 */
function tableCaption(sectionId: SectionId, index: number): string {
  if (sectionId === "grades") {
    return index === 0 ? "교과별 성적" : "세부능력 및 특기사항";
  }
  if (sectionId === "activities" || sectionId === "volunteer") {
    return index === 0 ? "창의적 체험활동" : "봉사활동실적";
  }
  return `표 ${index + 1}`;
}

function SectionCard({ section }: { section: RecordSection }) {
  const [open, setOpen] = useState(true);
  const hasTables = !!section.tables && section.tables.length > 0;
  // 표가 있으면 원문은 기본 접힘. 표가 없으면 원문이 유일한 정보라 펼침.
  const [rawOpen, setRawOpen] = useState(!hasTables);
  const lines = section.text.split("\n").filter((l) => l.trim().length > 0);
  // 섹션 헤더 뱃지는 "섹션의 대표 표"(= 첫 번째 표)의 행수만 표시해 사용자 혼동을
  // 방지한다. 세특/봉사 같은 하위 표는 각 표 위에 자체 행수 라벨로 노출된다.
  const primaryRowCount = section.tables?.[0]?.rows.length ?? 0;

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b px-4 py-3 text-left transition-colors hover:bg-accent/40"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-semibold">{section.title}</span>
          {hasTables && (
            <Badge variant="info" className="gap-1 text-[10px]">
              <Table2 className="h-3 w-3" />
              표 {primaryRowCount}행
            </Badge>
          )}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {lines.length}줄 · {section.text.length.toLocaleString()}자
          </Badge>
        </button>
        {open && (
          <div className="space-y-4 p-4">
            {hasTables && (
              <div className="space-y-4">
                {section.tables!.map((t, i) => (
                  <div key={i} className="space-y-1.5">
                    {section.tables!.length > 1 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Table2 className="h-3 w-3" />
                        <span>
                          {tableCaption(section.id, i)} · {t.rows.length}행
                        </span>
                      </div>
                    )}
                    <TableView table={t} />
                  </div>
                ))}
              </div>
            )}

            {lines.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setRawOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {rawOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <FileText className="h-3.5 w-3.5" />
                  원문 {rawOpen ? "숨기기" : "펼치기"} ({lines.length}줄)
                </button>
                {rawOpen && (
                  <div
                    className={cn(
                      "space-y-1.5 rounded-md border bg-muted/20 p-3 text-sm leading-relaxed",
                      section.id === "grades" &&
                        "font-mono text-xs text-muted-foreground"
                    )}
                  >
                    {lines.map((l, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {l}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {lines.length === 0 && !hasTables && (
              <div className="text-sm text-muted-foreground">(본문 없음)</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 줄바꿈을 허용해야 읽기 편한 긴 텍스트 컬럼. (이 외엔 nowrap)
const PROSE_COLUMNS = new Set([
  "내용",
  "도서",
  "특기사항",
  "활동내용",
  "참가대상",
  "수상명",
]);

function TableView({ table }: { table: StructuredTable }) {
  return (
    <ScrollArea className="w-full rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/60">
          <tr>
            {table.columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0 align-top hover:bg-accent/30">
              {table.columns.map((c) => (
                <td
                  key={c}
                  className={cn(
                    "px-3 py-1.5 tabular-nums",
                    PROSE_COLUMNS.has(c)
                      ? "min-w-[200px] whitespace-pre-wrap break-words"
                      : "whitespace-nowrap"
                  )}
                  title={r[c]}
                >
                  {r[c] || <span className="text-muted-foreground">·</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
