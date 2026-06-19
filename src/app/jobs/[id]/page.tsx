import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUnlocked } from "@/lib/security";
import { readEncryptedText } from "@/lib/storage";
import { ArrowLeft, Cpu, Download, FileText, LifeBuoy, Zap } from "lucide-react";
import { jobsRepo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { JsonTreeViewer } from "@/components/JsonTreeViewer";
import { StudentRecordView } from "@/components/StudentRecordView";
import { parseStudentRecord } from "@/lib/studentRecord";
import { formatBytes, formatDuration, formatTimestamp } from "@/lib/utils";
import type { ConverterEngine, ConvertDiagnostics } from "@/types/job";

export const dynamic = "force-dynamic";

async function loadJson(path: string | null) {
  if (!path) return null;
  try {
    const raw = await readEncryptedText(path);
    return { raw, parsed: JSON.parse(raw) as unknown };
  } catch {
    return null;
  }
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isUnlocked()) redirect("/");
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) notFound();

  const json = await loadJson(job.jsonPath);

  return (
    <main className="container mx-auto h-screen max-w-[1400px] overflow-y-auto py-6">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h1 className="truncate text-lg font-semibold">{job.originalName}</h1>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>ID {job.id.slice(0, 8)}</span>
                <span>배치 {job.batchId.slice(0, 8)}</span>
                <span>순번 #{job.orderIndex + 1}</span>
                <span>{formatBytes(job.sizeBytes)}</span>
                <span>업로드 {formatTimestamp(job.createdAt)}</span>
                {job.durationMs !== null && <span>변환 {formatDuration(job.durationMs)}</span>}
              </div>
              {job.engine && (
                <EngineNotice
                  engine={job.engine}
                  reason={job.fallbackReason}
                  json={json}
                />
              )}
              {job.diagnostics && (
                <DiagnosticsNotice diagnostics={job.diagnostics} />
              )}
              {job.error && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {job.error}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={job.status} />
              {job.status === "completed" && (
                <>
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <a href={`/api/jobs/${job.id}/pdf`} target="_blank" rel="noreferrer">
                      원본 PDF
                    </a>
                  </Button>
                  <Button asChild size="sm" className="gap-1">
                    <a href={`/api/jobs/${job.id}/json?download=1`}>
                      <Download className="h-4 w-4" />
                      JSON 다운로드
                    </a>
                  </Button>
                </>
              )}
              {(job.status === "completed" || job.status === "failed") && (
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a
                    href={`/api/jobs/${job.id}/diagnostics`}
                    title="변환 원본 JSON·진단 근거·서버 로그를 한 파일로 받아 개발자에게 보낼 수 있습니다"
                  >
                    <LifeBuoy className="h-4 w-4" />
                    진단 보내기
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {json === null ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {job.status === "completed"
              ? "JSON 파일을 읽을 수 없습니다. 파일이 삭제되었을 수 있습니다."
              : `현재 상태: ${job.status}. 변환이 완료되면 JSON이 여기에 표시됩니다.`}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="student">
          <TabsList>
            <TabsTrigger value="student">학생부 뷰</TabsTrigger>
            <TabsTrigger value="tree">JSON 트리</TabsTrigger>
            <TabsTrigger value="raw">원문 (Raw)</TabsTrigger>
          </TabsList>
          <TabsContent value="student">
            <StudentRecordView record={parseStudentRecord(json.parsed)} />
          </TabsContent>
          <TabsContent value="tree">
            <JsonTreeViewer data={json.parsed as never} defaultExpandDepth={2} />
          </TabsContent>
          <TabsContent value="raw">
            <Card>
              <CardContent className="p-0">
                <pre className="max-h-[70vh] overflow-auto rounded-md p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(json.parsed, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function EngineNotice({
  engine,
  reason,
  json,
}: {
  engine: ConverterEngine;
  reason: string | null;
  json: { parsed: unknown } | null;
}) {
  const fallbackReason: string | null = (() => {
    if (engine !== "pdfjs-fallback") return null;
    if (reason) return reason;
    if (!json?.parsed || typeof json.parsed !== "object") return null;
    const r = (json.parsed as { fallbackReason?: unknown }).fallbackReason;
    return typeof r === "string" ? r : null;
  })();

  if (engine !== "pdfjs-fallback") {
    const hybrid = engine === "opendataloader-pdf-hybrid";
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
        <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <div>
          <span className="font-medium text-emerald-700 dark:text-emerald-300">
            {hybrid ? "opendataloader hybrid + OCR" : "opendataloader-pdf"}
          </span>
          <span className="ml-2 text-muted-foreground">
            {hybrid
              ? "Java 엔진 + Python(docling) 백엔드로 OCR/표 인식까지 처리된 구조 JSON입니다."
              : "Java 엔진으로 변환된 고품질 구조 JSON입니다."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <Zap className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1">
        <div>
          <span className="font-medium text-amber-700 dark:text-amber-300">
            pdfjs fallback
          </span>
          <span className="ml-2 text-muted-foreground">
            Java 런타임이 없거나 opendataloader-pdf 호출이 실패해 pdfjs로 대체 변환했습니다.
            고품질 변환을 원하면 Docker 이미지 또는 Java 11+ JRE 설치 후 재업로드하세요.
          </span>
        </div>
        {fallbackReason && (
          <div className="rounded border border-amber-500/20 bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-0.5 font-sans text-xs font-medium text-foreground">
              실패 사유 (opendataloader-pdf)
            </div>
            <div className="whitespace-pre-wrap break-all">{fallbackReason}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticsNotice({
  diagnostics: d,
}: {
  diagnostics: ConvertDiagnostics;
}) {
  const pdf = d.pdf;
  const topNodes = d.nodeTypes
    ? Object.entries(d.nodeTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}:${v}`)
        .join("  ")
    : null;

  return (
    <details className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        변환 진단 (엔진 선택 근거)
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        {pdf && (
          <>
            <dt>PDF</dt>
            <dd>
              {pdf.pageCount ?? "?"}쪽 · 텍스트레이어{" "}
              {pdf.hasTextLayer === null ? "?" : pdf.hasTextLayer ? "있음" : "없음"}
              {pdf.encrypted ? " · 암호화" : ""}
            </dd>
            <dt>출처</dt>
            <dd className="break-all">
              producer={JSON.stringify(pdf.producer)} creator=
              {JSON.stringify(pdf.creator)}
            </dd>
          </>
        )}
        <dt>모드</dt>
        <dd>
          hybrid={d.hybridMode} · structTree={String(d.structTree)}
        </dd>
        <dt>텍스트</dt>
        <dd>{d.textLength === null ? "?" : `${d.textLength}자`}</dd>
        {d.outputFile && (
          <>
            <dt>출력</dt>
            <dd className="break-all">{d.outputFile}</dd>
          </>
        )}
        {topNodes && (
          <>
            <dt>노드</dt>
            <dd className="break-all">{topNodes}</dd>
          </>
        )}
      </dl>
      {d.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
          {d.notes.map((n, i) => (
            <li key={i} className="break-all">
              {n}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "info" | "secondary" | "destructive" }> = {
    completed: { label: "완료", variant: "success" },
    processing: { label: "진행중", variant: "info" },
    queued: { label: "대기", variant: "secondary" },
    failed: { label: "실패", variant: "destructive" },
    canceled: { label: "취소", variant: "secondary" },
  };
  const m = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
