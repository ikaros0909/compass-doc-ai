import Link from "next/link";
import { ArrowLeft, Database, Download, Eye, Users } from "lucide-react";
import { hsbExportsRepo } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatTimestamp } from "@/lib/utils";
import { ExportDeleteButton } from "./_components/ExportDeleteButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ExportsPage() {
  const exports = hsbExportsRepo.list(200);

  return (
    <main className="container mx-auto h-screen max-w-[1100px] overflow-y-auto py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">내보낸 db3 목록</h1>
              <p className="text-xs text-muted-foreground">
                hsb.db3 스키마로 생성된 SQLite 파일 ({exports.length}개)
              </p>
            </div>
          </div>
        </div>
      </header>

      {exports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            아직 생성된 db3 파일이 없습니다. 메인에서 완료된 PDF를 선택해
            내보내기를 시작하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {exports.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate font-mono text-sm font-medium">
                      {e.fileName}
                    </code>
                    {e.warnings.length > 0 && (
                      <Badge variant="warning" className="text-[10px]">
                        경고 {e.warnings.length}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {e.studentCount}명
                    </span>
                    <span>{formatBytes(e.sizeBytes)}</span>
                    <span>{formatTimestamp(e.createdAt)}</span>
                    <span>
                      Mogib1=
                      <code className="font-mono">{e.mogib1}</code>
                    </span>
                    <span>
                      Mogib2=
                      <code className="font-mono">{e.mogib2}</code>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                    <Link href={`/exports/${e.id}`}>
                      <Eye className="h-3.5 w-3.5" /> 조회
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
                    <a href={`/api/exports/${e.id}/download`} download>
                      <Download className="h-3.5 w-3.5" /> 다운로드
                    </a>
                  </Button>
                  <ExportDeleteButton id={e.id} fileName={e.fileName} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
