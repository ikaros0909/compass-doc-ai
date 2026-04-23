"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
}

export function ExportTableViewer({ exportId, tables, initialTable }: Props) {
  const [active, setActive] = useState(initialTable);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        });
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

  const activeMeta = tables.find((t) => t.name === active);
  const total = data?.total ?? activeMeta?.rowCount ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(total, offset + (data?.rows.length ?? PAGE_SIZE));

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
                        {c}
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
                      {data.columns.map((c) => (
                        <td
                          key={c}
                          className="max-w-[280px] truncate whitespace-nowrap px-2 py-1"
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
