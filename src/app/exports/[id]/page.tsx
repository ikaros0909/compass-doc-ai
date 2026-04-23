import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { hsbExportsRepo } from "@/lib/db";
import { HSB_TABLE_NAMES, previewHsbDb } from "@/lib/hsbExport";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatTimestamp } from "@/lib/utils";
import { ExportTableViewer } from "./_components/ExportTableViewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ table?: string }>;
}

export default async function ExportDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { table } = await searchParams;

  const rec = hsbExportsRepo.findById(id);
  if (!rec) notFound();

  let tables;
  try {
    tables = previewHsbDb(rec.filePath, 0);
  } catch {
    // 파일이 사라진 경우 등
    tables = HSB_TABLE_NAMES.map((n) => ({
      name: n,
      rowCount: 0,
      columns: [] as string[],
      sampleRows: [] as Array<Record<string, unknown>>,
    }));
  }

  const activeTable =
    (table && HSB_TABLE_NAMES.includes(table as (typeof HSB_TABLE_NAMES)[number])
      ? table
      : tables.find((t) => t.rowCount > 0)?.name) ?? tables[0].name;

  return (
    <main className="container mx-auto h-screen max-w-[1400px] overflow-y-auto py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/exports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-lg font-semibold">
              {rec.fileName}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{rec.studentCount}명</span>
              <span>{formatBytes(rec.sizeBytes)}</span>
              <span>{formatTimestamp(rec.createdAt)}</span>
              <span>
                Mogib1=<code className="font-mono">{rec.mogib1}</code>
              </span>
              <span>
                Mogib2=<code className="font-mono">{rec.mogib2}</code>
              </span>
            </p>
          </div>
        </div>
        <Button asChild>
          <a href={`/api/exports/${rec.id}/download`} download>
            <Download className="h-4 w-4" /> 다운로드
          </a>
        </Button>
      </header>

      {rec.warnings.length > 0 && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              경고 <Badge variant="warning">{rec.warnings.length}</Badge>
            </div>
            <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
              {rec.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ExportTableViewer
        exportId={rec.id}
        tables={tables.map((t) => ({
          name: t.name,
          rowCount: t.rowCount,
          columns: t.columns,
        }))}
        initialTable={activeTable}
      />
    </main>
  );
}
