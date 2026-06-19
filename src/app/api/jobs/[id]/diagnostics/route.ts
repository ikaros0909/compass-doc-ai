import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { jobsRepo } from "@/lib/db";
import { paths } from "@/lib/paths";
import { isUnlocked } from "@/lib/security";
import { readEncryptedText } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 4 * 1024 * 1024; // 변환 JSON 첨부 상한 (그 이상은 잘라냄)
const MAX_LOG_LINES = 400; // 이 작업과 무관한 일반 로그 꼬리 줄 수

/**
 * 한 작업에 대한 "진단 번들"을 단일 JSON 파일로 내려준다.
 * 엔드유저가 이 파일 하나만 보내면 변환 원본 JSON·진단 근거·해당 서버 로그를
 * 한 번에 받을 수 있다. (별도 zip 의존성 없이 자체 완결형)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUnlocked()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }
  const { id } = await params;
  const job = jobsRepo.findById(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 1) 변환 결과 JSON (있으면 파싱해서, 너무 크면 잘라서 첨부)
  let convertedJson: unknown = null;
  let convertedJsonNote: string | null = null;
  if (job.jsonPath) {
    try {
      const raw = await readEncryptedText(job.jsonPath);
      if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
        convertedJson = raw.slice(0, MAX_JSON_BYTES);
        convertedJsonNote = `JSON 이 ${MAX_JSON_BYTES} 바이트를 초과해 앞부분만 첨부함`;
      } else {
        try {
          convertedJson = JSON.parse(raw);
        } catch {
          convertedJson = raw; // 파싱 실패 시 원문 그대로
          convertedJsonNote = "JSON 파싱 실패 — 원문 문자열로 첨부";
        }
      }
    } catch (err) {
      convertedJsonNote = `JSON 파일 읽기 실패: ${String(err)}`;
    }
  } else {
    convertedJsonNote = "jsonPath 없음 (변환 미완료/실패)";
  }

  // 2) 서버 로그 (Electron: userData/logs/next-server.log). 이 작업의 storedName
  //    이 들어간 줄만 골라내고, 일반 꼬리도 일부 덧붙인다. 없으면 best-effort skip.
  const logInfo = await collectServerLog(job.storedName);

  const bundle = {
    bundle: "compass-doc-ai-diagnostic",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: readAppVersion(),
    job: {
      id: job.id,
      originalName: job.originalName,
      storedName: job.storedName,
      status: job.status,
      engine: job.engine,
      fallbackReason: job.fallbackReason,
      error: job.error,
      sizeBytes: job.sizeBytes,
      durationMs: job.durationMs,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    },
    diagnostics: job.diagnostics,
    convertedJson,
    convertedJsonNote,
    serverLog: logInfo,
  };

  const safeName = job.originalName.replace(/\.pdf$/i, "").replace(/[^\w가-힣.-]+/g, "_");
  const filename = encodeURIComponent(`진단_${safeName}_${job.id.slice(0, 8)}.json`);

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    }),
  });
}

interface ServerLogInfo {
  file: string | null;
  matchedLines: string[]; // 이 작업(storedName)에 해당하는 줄
  tailLines: string[]; // 최근 일반 꼬리 (맥락용)
  note: string | null;
}

async function collectServerLog(storedName: string): Promise<ServerLogInfo> {
  // logs 디렉터리는 dataDir 의 형제(Electron: userData/{data,logs}).
  const candidates = [
    path.join(path.dirname(paths.dataDir), "logs", "next-server.log"),
    path.join(paths.dataDir, "logs", "next-server.log"),
  ];

  for (const file of candidates) {
    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue; // 다음 후보
    }
    const lines = content.split(/\r?\n/);
    const matchedLines = lines.filter((l) => l.includes(storedName));
    const tailLines = lines.slice(-MAX_LOG_LINES);
    return {
      file,
      matchedLines,
      tailLines,
      note:
        matchedLines.length === 0
          ? "이 작업명이 포함된 로그 줄을 찾지 못함 (로그 회전/삭제 가능)"
          : null,
    };
  }

  return {
    file: null,
    matchedLines: [],
    tailLines: [],
    note:
      "next-server.log 를 찾지 못함. 개발/웹서버 모드에서는 로그가 콘솔/PM2 로 출력됩니다.",
  };
}

function readAppVersion(): string | null {
  // 표준 npm 실행 시 주입되는 값 → 데스크톱 standalone 에서는 없을 수 있음
  return process.env.npm_package_version ?? null;
}
