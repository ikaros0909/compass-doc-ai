import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { jobsRepo, hsbExportsRepo } from "@/lib/db";
import {
  buildHsbDb,
  generateExportFileName,
  exportFilePath,
  type StudentExportInput,
} from "@/lib/hsbExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const exports = hsbExportsRepo.list(100);
  return NextResponse.json({
    exports: exports.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      mogib1: e.mogib1,
      mogib2: e.mogib2,
      studentCount: e.studentCount,
      tableCounts: e.tableCounts,
      sizeBytes: e.sizeBytes,
      createdAt: e.createdAt,
      warnings: e.warnings,
    })),
  });
}

interface CreateBody {
  jobIds?: unknown;
  mogib1?: unknown;
  mogib2?: unknown;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const jobIds = Array.isArray(body.jobIds)
    ? body.jobIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const mogib1 = typeof body.mogib1 === "string" ? body.mogib1.trim() : "";
  const mogib2 = typeof body.mogib2 === "string" ? body.mogib2.trim() : "";

  if (jobIds.length === 0) {
    return NextResponse.json(
      { error: "jobIds required (completed jobs only)" },
      { status: 400 }
    );
  }
  if (!mogib1 || !mogib2) {
    return NextResponse.json(
      { error: "mogib1, mogib2 required" },
      { status: 400 }
    );
  }

  const jobs = jobsRepo.completedByIds(jobIds);
  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "no completed jobs match given ids" },
      { status: 400 }
    );
  }

  // IdentifyNumber/SocialNumber는 파일명(확장자 제외)에서 유도되어 PK의 일부가
  // 된다. 따라서 같은 basename 의 PDF가 두 개 이상 섞여 있으면 PersonalInfo PK
  // 충돌이 발생한다. 선제 검증으로 SQL 에러가 나기 전에 명확한 메시지를 돌려준다.
  const byBase = new Map<string, string[]>();
  for (const j of jobs) {
    const base = j.originalName.replace(/\.pdf$/i, "");
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(j.originalName);
  }
  const duplicates = Array.from(byBase.entries()).filter(
    ([, names]) => names.length > 1
  );
  if (duplicates.length > 0) {
    return NextResponse.json(
      {
        error:
          "선택한 PDF에 파일명이 중복된 항목이 있습니다. IdentifyNumber/SocialNumber가 파일명으로 부여되므로 서로 다른 학생의 PDF는 파일명이 달라야 합니다. (수험번호.pdf 규칙)",
        detail: duplicates.map(([base, names]) => ({
          baseName: base,
          originalNames: names,
          count: names.length,
        })),
      },
      { status: 400 }
    );
  }

  const inputs: StudentExportInput[] = [];
  const loadErrors: string[] = [];
  for (const job of jobs) {
    if (!job.jsonPath) {
      loadErrors.push(`${job.originalName}: jsonPath missing`);
      continue;
    }
    try {
      const raw = await fs.readFile(job.jsonPath, "utf8");
      inputs.push({
        jobId: job.id,
        originalName: job.originalName,
        recordJson: JSON.parse(raw),
      });
    } catch (err) {
      loadErrors.push(
        `${job.originalName}: JSON 로드 실패 — ${(err as Error).message ?? String(err)}`
      );
    }
  }

  if (inputs.length === 0) {
    return NextResponse.json(
      { error: "no readable job JSON files", detail: loadErrors },
      { status: 500 }
    );
  }

  // 파일명 중복 회피: 초 단위 timestamp 기반이라 드물지만 동시 요청 시 suffix 부여.
  let fileName = generateExportFileName();
  let attempt = 0;
  const BASE = fileName;
  while (true) {
    const full = exportFilePath(fileName);
    try {
      await fs.access(full);
      attempt += 1;
      fileName = BASE.replace(/\.db3$/, `_${attempt}.db3`);
    } catch {
      break;
    }
  }

  let result;
  try {
    result = buildHsbDb(inputs, { mogib1, mogib2 }, fileName);
  } catch (err) {
    return NextResponse.json(
      { error: "build failed", detail: (err as Error).message ?? String(err) },
      { status: 500 }
    );
  }

  const stat = await fs.stat(result.filePath);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  hsbExportsRepo.insert({
    id,
    fileName: result.fileName,
    filePath: result.filePath,
    mogib1,
    mogib2,
    studentCount: result.totalStudents,
    jobIds: inputs.map((i) => i.jobId),
    tableCounts: result.tableCounts,
    warnings: [...loadErrors, ...result.warnings],
    sizeBytes: stat.size,
    createdAt,
  });

  return NextResponse.json({
    id,
    fileName: result.fileName,
    studentCount: result.totalStudents,
    tableCounts: result.tableCounts,
    warnings: [...loadErrors, ...result.warnings],
    students: result.students,
    createdAt,
    sizeBytes: stat.size,
  });
}
