"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TableMeta {
  name: string;
  rowCount: number;
  columns: string[];
}

interface Props {
  exportId: string;
  tables: TableMeta[];
  initialTable: string;
}

const PAGE_SIZE = 50;

interface TableData {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
  primaryKey: string[];
  columnTypes: Record<string, string>;
}

interface EditingCell {
  rowIndex: number;
  column: string;
  value: string;
}

interface SaveState {
  status: "saving" | "error";
  message?: string;
}

export function ExportTableViewer({ exportId, tables, initialTable }: Props) {
  const [active, setActive] = useState(initialTable);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  // 셀 좌표 → 저장 상태 ("rowIndex:column")
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (table: string, off: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/exports/${exportId}/table/${table}?limit=${PAGE_SIZE}&offset=${off}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json?.detail || json?.error || `HTTP ${res.status}`);
          setData(null);
          return;
        }
        setData({
          columns: json.columns,
          rows: json.rows,
          total: json.total,
          primaryKey: json.primaryKey ?? [],
          columnTypes: json.columnTypes ?? {},
        });
        setSaveStates({});
        setEditing(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [exportId]
  );

  useEffect(() => {
    void load(active, offset);
  }, [active, offset, load]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const activeMeta = tables.find((t) => t.name === active);
  const total = data?.total ?? activeMeta?.rowCount ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(total, offset + (data?.rows.length ?? PAGE_SIZE));

  const pkSet = new Set(data?.primaryKey ?? []);
  const isEditable = (column: string) =>
    (data?.primaryKey.length ?? 0) > 0 && !pkSet.has(column);

  const startEdit = (rowIndex: number, column: string, current: unknown) => {
    if (!data) return;
    if (!isEditable(column)) return;
    setEditing({
      rowIndex,
      column,
      value: current === null || current === undefined ? "" : String(current),
    });
  };

  const cancelEdit = () => setEditing(null);

  const commitEdit = async () => {
    if (!data || !editing) return;
    const { rowIndex, column, value } = editing;
    const row = data.rows[rowIndex];
    const before = row[column];
    const beforeStr =
      before === null || before === undefined ? "" : String(before);
    if (value === beforeStr) {
      setEditing(null);
      return;
    }
    const cellKey = `${rowIndex}:${column}`;
    const pk: Record<string, unknown> = {};
    for (const k of data.primaryKey) pk[k] = row[k];

    setEditing(null);
    setSaveStates((s) => ({ ...s, [cellKey]: { status: "saving" } }));

    try {
      const res = await fetch(
        `/api/exports/${exportId}/table/${active}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pk, column, value }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.detail || json?.error || `HTTP ${res.status}`;
        setSaveStates((s) => ({
          ...s,
          [cellKey]: { status: "error", message: msg },
        }));
        return;
      }
      // 서버에서 정규화된 값을 받아 행 전체를 교체.
      setData((d) => {
        if (!d) return d;
        const newRows = d.rows.slice();
        newRows[rowIndex] = json.updatedRow;
        return { ...d, rows: newRows };
      });
      setSaveStates((s) => {
        const next = { ...s };
        delete next[cellKey];
        return next;
      });
    } catch (err) {
      setSaveStates((s) => ({
        ...s,
        [cellKey]: {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card>
        <CardContent className="p-2">
          <div className="mb-1 px-2 py-1 text-xs font-medium text-muted-foreground">
            테이블 ({tables.length})
          </div>
          <div className="space-y-0.5">
            {tables.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setActive(t.name);
                  setOffset(0);
                }}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                  active === t.name ? "bg-accent font-medium" : ""
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs">
            <div>
              <span className="font-semibold">{active}</span>
              <span className="ml-2 text-muted-foreground">
                {total.toLocaleString()}행
                {total > 0 && (
                  <>
                    {" · "}
                    {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} 표시
                  </>
                )}
              </span>
              {data && data.primaryKey.length > 0 && (
                <span className="ml-3 text-muted-foreground/80">
                  더블클릭하여 셀 편집 (PK 컬럼 제외)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                title="이전 페이지"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                title="다음 페이지"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {error && (
            <div className="p-4 text-xs text-destructive">{error}</div>
          )}
          {loading ? (
            <div className="flex h-[400px] items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 로딩 중…
            </div>
          ) : data && data.rows.length > 0 ? (
            <div className="max-h-[calc(100vh-280px)] overflow-auto">
              <table className="w-max min-w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap border-b px-2 py-1.5 text-left font-medium"
                      >
                        <span className="inline-flex items-center gap-1">
                          {pkSet.has(c) && (
                            <KeyRound
                              className="h-3 w-3 text-amber-600"
                              aria-label="primary key"
                            />
                          )}
                          {c}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-b-0 align-top hover:bg-accent/30"
                    >
                      {data.columns.map((c) => {
                        const cellKey = `${i}:${c}`;
                        const save = saveStates[cellKey];
                        const editable = isEditable(c);
                        const isEditing =
                          editing &&
                          editing.rowIndex === i &&
                          editing.column === c;
                        return (
                          <td
                            key={c}
                            onDoubleClick={() => startEdit(i, c, r[c])}
                            className={`max-w-[280px] px-2 py-1 ${
                              editable ? "cursor-text" : "cursor-not-allowed bg-muted/20"
                            } ${
                              save?.status === "error"
                                ? "bg-red-50 dark:bg-red-900/30"
                                : save?.status === "saving"
                                  ? "bg-blue-50 dark:bg-blue-900/30"
                                  : ""
                            }`}
                            title={
                              save?.status === "error"
                                ? `저장 실패: ${save.message}`
                                : !editable
                                  ? "PK 컬럼은 수정할 수 없습니다"
                                  : String(r[c] ?? "")
                            }
                          >
                            {isEditing ? (
                              <input
                                ref={inputRef}
                                type="text"
                                value={editing.value}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing,
                                    value: e.target.value,
                                  })
                                }
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitEdit();
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                className="w-full min-w-[80px] border border-primary bg-background px-1 py-0.5 text-[11px] outline-none"
                              />
                            ) : (
                              <span className="block truncate whitespace-nowrap">
                                {save?.status === "saving" && (
                                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                                )}
                                {r[c] === null || r[c] === undefined
                                  ? ""
                                  : String(r[c])}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-muted-foreground">
              (빈 테이블)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
