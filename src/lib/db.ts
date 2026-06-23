import Database from "better-sqlite3";
import { ensureDataDirs, paths } from "./paths";
import { getDek } from "./security";
import { encryptField, decryptField } from "./vault";
import { defaultSubjectCodeEntries } from "./subjectCodeSeed";
import { normalizeSubjectName } from "./subjectCodeNorm";
import type {
  BatchSummary,
  ConvertDiagnostics,
  ConverterEngine,
  JobRecord,
  JobStatus,
} from "@/types/job";

ensureDataDirs();

const globalForDb = globalThis as unknown as { __compassDb?: Database.Database };

export const db =
  globalForDb.__compassDb ??
  (() => {
    const instance = new Database(paths.dbPath);
    instance.pragma("journal_mode = WAL");
    instance.pragma("foreign_keys = ON");
    instance.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        pdf_path TEXT NOT NULL,
        json_path TEXT,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        engine TEXT,
        fallback_reason TEXT,
        diagnostics TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

      CREATE TABLE IF NOT EXISTS hsb_exports (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        mogib1 TEXT NOT NULL,
        mogib2 TEXT NOT NULL,
        student_count INTEGER NOT NULL,
        job_ids TEXT NOT NULL,
        table_counts TEXT NOT NULL,
        warnings TEXT,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hsb_exports_created ON hsb_exports(created_at DESC);

      CREATE TABLE IF NOT EXISTS subject_code_map (
        norm_name TEXT PRIMARY KEY,
        subject_name TEXT NOT NULL,
        subject_code TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // Additive migration — older DBs created before the engine column exists.
    const columns = instance
      .prepare(`PRAGMA table_info(jobs)`)
      .all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === "engine")) {
      instance.exec(`ALTER TABLE jobs ADD COLUMN engine TEXT`);
    }
    if (!columns.some((c) => c.name === "fallback_reason")) {
      instance.exec(`ALTER TABLE jobs ADD COLUMN fallback_reason TEXT`);
    }
    if (!columns.some((c) => c.name === "diagnostics")) {
      instance.exec(`ALTER TABLE jobs ADD COLUMN diagnostics TEXT`);
    }
    return instance;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__compassDb = db;
}

// ── 민감 필드 암복호화 (수험번호·진단 등). 잠금 상태면 getDek() 가 throw → 보호.
function encField(v: string | null | undefined): string | null {
  if (v == null) return null;
  return encryptField(getDek(), v);
}
function decField(v: string | null | undefined): string | null {
  if (v == null) return null;
  return decryptField(getDek(), v);
}

function parseDiagnostics(raw: string | null): ConvertDiagnostics | null {
  if (!raw) return null;
  try {
    return JSON.parse(decField(raw) as string) as ConvertDiagnostics;
  } catch {
    return null;
  }
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    batchId: row.batch_id as string,
    orderIndex: row.order_index as number,
    originalName: decField(row.original_name as string) as string,
    storedName: row.stored_name as string,
    sizeBytes: row.size_bytes as number,
    pdfPath: row.pdf_path as string,
    jsonPath: (row.json_path as string | null) ?? null,
    status: row.status as JobStatus,
    progress: row.progress as number,
    error: decField(row.error as string | null),
    engine: (row.engine as ConverterEngine | null) ?? null,
    fallbackReason: decField(row.fallback_reason as string | null),
    diagnostics: parseDiagnostics(row.diagnostics as string | null),
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
  };
}

export const jobsRepo = {
  insert(job: JobRecord) {
    db.prepare(
      `INSERT INTO jobs
        (id, batch_id, order_index, original_name, stored_name, size_bytes,
         pdf_path, json_path, status, progress, error, engine, fallback_reason,
         created_at, started_at, completed_at, duration_ms)
       VALUES
        (@id, @batchId, @orderIndex, @originalName, @storedName, @sizeBytes,
         @pdfPath, @jsonPath, @status, @progress, @error, @engine, @fallbackReason,
         @createdAt, @startedAt, @completedAt, @durationMs)`
    ).run({ ...job, originalName: encField(job.originalName) });
  },

  insertMany(jobs: JobRecord[]) {
    const stmt = db.prepare(
      `INSERT INTO jobs
        (id, batch_id, order_index, original_name, stored_name, size_bytes,
         pdf_path, json_path, status, progress, error, engine, fallback_reason,
         created_at, started_at, completed_at, duration_ms)
       VALUES
        (@id, @batchId, @orderIndex, @originalName, @storedName, @sizeBytes,
         @pdfPath, @jsonPath, @status, @progress, @error, @engine, @fallbackReason,
         @createdAt, @startedAt, @completedAt, @durationMs)`
    );
    const tx = db.transaction((items: JobRecord[]) => {
      for (const item of items)
        stmt.run({ ...item, originalName: encField(item.originalName) });
    });
    tx(jobs);
  },

  findById(id: string): JobRecord | null {
    const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToJob(row) : null;
  },

  listAll(limit = 500): JobRecord[] {
    const rows = db
      .prepare(`SELECT * FROM jobs ORDER BY created_at DESC, order_index ASC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToJob);
  },

  listByBatch(batchId: string): JobRecord[] {
    const rows = db
      .prepare(`SELECT * FROM jobs WHERE batch_id = ? ORDER BY order_index ASC`)
      .all(batchId) as Record<string, unknown>[];
    return rows.map(rowToJob);
  },

  nextQueued(): JobRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued'
         ORDER BY created_at ASC, order_index ASC LIMIT 1`
      )
      .get() as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  },

  resetStaleProcessing() {
    db.prepare(
      `UPDATE jobs SET status = 'queued', progress = 0, started_at = NULL
       WHERE status = 'processing'`
    ).run();
  },

  markProcessing(id: string, startedAt: string) {
    db.prepare(
      `UPDATE jobs SET status = 'processing', progress = 5, started_at = ?
       WHERE id = ?`
    ).run(startedAt, id);
  },

  updateProgress(id: string, progress: number) {
    db.prepare(`UPDATE jobs SET progress = ? WHERE id = ?`).run(progress, id);
  },

  markCompleted(
    id: string,
    jsonPath: string,
    completedAt: string,
    durationMs: number,
    engine: ConverterEngine,
    fallbackReason: string | null,
    diagnostics: ConvertDiagnostics | null
  ) {
    db.prepare(
      `UPDATE jobs SET status = 'completed', progress = 100, json_path = ?,
         completed_at = ?, duration_ms = ?, engine = ?, fallback_reason = ?,
         diagnostics = ?, error = NULL
       WHERE id = ?`
    ).run(
      jsonPath,
      completedAt,
      durationMs,
      engine,
      encField(fallbackReason),
      diagnostics ? encField(JSON.stringify(diagnostics)) : null,
      id
    );
  },

  /** 실패/완료된 작업을 다시 큐에 넣는다 (이전 결과/진단 초기화, PDF 는 그대로 재사용) */
  requeue(id: string) {
    db.prepare(
      `UPDATE jobs SET status = 'queued', progress = 0, error = NULL,
         started_at = NULL, completed_at = NULL, duration_ms = NULL,
         engine = NULL, fallback_reason = NULL, diagnostics = NULL
       WHERE id = ?`
    ).run(id);
  },

  markFailed(
    id: string,
    error: string,
    completedAt: string,
    diagnostics: ConvertDiagnostics | null = null
  ) {
    db.prepare(
      `UPDATE jobs SET status = 'failed', completed_at = ?, error = ?,
         diagnostics = ?
       WHERE id = ?`
    ).run(
      completedAt,
      encField(error),
      diagnostics ? encField(JSON.stringify(diagnostics)) : null,
      id
    );
  },

  delete(id: string) {
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  },

  deleteBatch(batchId: string) {
    db.prepare(`DELETE FROM jobs WHERE batch_id = ?`).run(batchId);
  },

  deleteAll() {
    db.prepare(`DELETE FROM jobs`).run();
  },

  summary(): {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    queued: number;
  } {
    const row = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
           SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
         FROM jobs`
      )
      .get() as Record<string, number>;
    return {
      total: row.total ?? 0,
      completed: row.completed ?? 0,
      failed: row.failed ?? 0,
      processing: row.processing ?? 0,
      queued: row.queued ?? 0,
    };
  },

  completedByIds(ids: string[]): JobRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'completed' AND id IN (${placeholders}) ORDER BY created_at DESC, order_index ASC`
      )
      .all(...ids) as Record<string, unknown>[];
    return rows.map(rowToJob);
  },

  batches(limit = 20): BatchSummary[] {
    const rows = db
      .prepare(
        `SELECT
           batch_id,
           MIN(created_at) as created_at,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
           SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
         FROM jobs
         GROUP BY batch_id
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      batchId: r.batch_id as string,
      createdAt: r.created_at as string,
      total: (r.total as number) ?? 0,
      completed: (r.completed as number) ?? 0,
      failed: (r.failed as number) ?? 0,
      processing: (r.processing as number) ?? 0,
      queued: (r.queued as number) ?? 0,
    }));
  },
};

export interface HsbExportRecord {
  id: string;
  fileName: string;
  filePath: string;
  mogib1: string;
  mogib2: string;
  studentCount: number;
  jobIds: string[];
  tableCounts: Record<string, number>;
  warnings: string[];
  sizeBytes: number;
  createdAt: string;
}

function rowToExport(row: Record<string, unknown>): HsbExportRecord {
  return {
    id: row.id as string,
    fileName: row.file_name as string,
    filePath: row.file_path as string,
    mogib1: row.mogib1 as string,
    mogib2: row.mogib2 as string,
    studentCount: row.student_count as number,
    jobIds: JSON.parse((row.job_ids as string) || "[]"),
    tableCounts: JSON.parse((row.table_counts as string) || "{}"),
    warnings: JSON.parse((row.warnings as string) || "[]"),
    sizeBytes: row.size_bytes as number,
    createdAt: row.created_at as string,
  };
}

export const hsbExportsRepo = {
  insert(rec: HsbExportRecord) {
    db.prepare(
      `INSERT INTO hsb_exports
        (id, file_name, file_path, mogib1, mogib2, student_count,
         job_ids, table_counts, warnings, size_bytes, created_at)
       VALUES
        (@id, @fileName, @filePath, @mogib1, @mogib2, @studentCount,
         @jobIds, @tableCounts, @warnings, @sizeBytes, @createdAt)`
    ).run({
      id: rec.id,
      fileName: rec.fileName,
      filePath: rec.filePath,
      mogib1: rec.mogib1,
      mogib2: rec.mogib2,
      studentCount: rec.studentCount,
      jobIds: JSON.stringify(rec.jobIds),
      tableCounts: JSON.stringify(rec.tableCounts),
      warnings: JSON.stringify(rec.warnings),
      sizeBytes: rec.sizeBytes,
      createdAt: rec.createdAt,
    });
  },

  findById(id: string): HsbExportRecord | null {
    const row = db.prepare(`SELECT * FROM hsb_exports WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToExport(row) : null;
  },

  list(limit = 100): HsbExportRecord[] {
    const rows = db
      .prepare(
        `SELECT * FROM hsb_exports ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToExport);
  },

  delete(id: string): HsbExportRecord | null {
    const rec = this.findById(id);
    if (!rec) return null;
    db.prepare(`DELETE FROM hsb_exports WHERE id = ?`).run(id);
    return rec;
  },

  deleteAll() {
    db.prepare(`DELETE FROM hsb_exports`).run();
  },
};

export interface SubjectCodeRecord {
  normName: string;
  subjectName: string;
  subjectCode: string;
  updatedAt: string;
}

/** LIKE 와일드카드(%,_,\) 이스케이프 — 사용자 검색어를 리터럴로 취급 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 과목코드 매핑표. 학생 개인정보가 아닌 코드표라 평문 저장(잠금 상태와 무관).
 * 매칭 키는 정규화된 과목명(norm_name).
 */
export const subjectCodeRepo = {
  upsertMany(
    entries: Array<{ normName: string; subjectName: string; subjectCode: string }>,
    updatedAt: string
  ): number {
    const stmt = db.prepare(
      `INSERT INTO subject_code_map (norm_name, subject_name, subject_code, updated_at)
       VALUES (@normName, @subjectName, @subjectCode, @updatedAt)
       ON CONFLICT(norm_name) DO UPDATE SET
         subject_name = excluded.subject_name,
         subject_code = excluded.subject_code,
         updated_at = excluded.updated_at`
    );
    const tx = db.transaction(
      (items: Array<{ normName: string; subjectName: string; subjectCode: string }>) => {
        for (const it of items) stmt.run({ ...it, updatedAt });
      }
    );
    tx(entries);
    return entries.length;
  },

  /** 과목명/코드 부분일치 검색 (매핑표가 수만 행이라 전량 반환 대신 검색·상한). */
  search(query: string, limit = 200): SubjectCodeRecord[] {
    const q = query.trim();
    const rows = (
      q
        ? db
            .prepare(
              `SELECT norm_name, subject_name, subject_code, updated_at
               FROM subject_code_map
               WHERE subject_name LIKE ? ESCAPE '\\' OR subject_code LIKE ? ESCAPE '\\'
               ORDER BY subject_name ASC LIMIT ?`
            )
            .all(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`, limit)
        : db
            .prepare(
              `SELECT norm_name, subject_name, subject_code, updated_at
               FROM subject_code_map ORDER BY subject_name ASC LIMIT ?`
            )
            .all(limit)
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      normName: r.norm_name as string,
      subjectName: r.subject_name as string,
      subjectCode: r.subject_code as string,
      updatedAt: r.updated_at as string,
    }));
  },

  count(): number {
    const row = db
      .prepare(`SELECT COUNT(*) as n FROM subject_code_map`)
      .get() as { n: number };
    return row.n ?? 0;
  },

  /**
   * 정규화 과목명 → 과목코드 lookup map (내보내기 시 일괄 조회용).
   * 저장된 norm_name(업로드 시점 정규화 규칙) 대신 원본 subject_name 을 현재
   * normalizeSubjectName 으로 다시 정규화해 키를 만든다. 정규화 규칙이 개선되면
   * 시드/재업로드 없이도 즉시 매칭에 반영된다(PDF 측과 동일 함수 사용).
   */
  asMap(): Record<string, string> {
    const rows = db
      .prepare(`SELECT subject_name, subject_code FROM subject_code_map`)
      .all() as Array<{ subject_name: string; subject_code: string }>;
    const out: Record<string, string> = {};
    for (const r of rows) out[normalizeSubjectName(r.subject_name)] = r.subject_code;
    return out;
  },

  clear(): number {
    const n = this.count();
    db.prepare(`DELETE FROM subject_code_map`).run();
    return n;
  },
};

export const appMetaRepo = {
  get(key: string): string | null {
    const row = db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  },
  set(key: string, value: string) {
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  },
};

// ── 기본 과목코드 시드(최초 1회). 설치 직후 매핑표가 채워져 있도록 하되,
//    사용자가 직접 삭제/업로드한 결과는 덮어쓰지 않는다(삭제 후 재시드 방지).
const SUBJECT_CODE_SEED_KEY = "subject_code_seeded";
function seedDefaultSubjectCodesOnce() {
  try {
    if (appMetaRepo.get(SUBJECT_CODE_SEED_KEY)) return; // 이미 1회 시드 처리됨
    // 마이그레이션 안전장치: 이미 매핑이 있으면(기존 사용자) 건드리지 않고 마커만 기록.
    if (subjectCodeRepo.count() === 0) {
      subjectCodeRepo.upsertMany(defaultSubjectCodeEntries(), new Date().toISOString());
    }
    appMetaRepo.set(SUBJECT_CODE_SEED_KEY, new Date().toISOString());
  } catch (err) {
    console.error("[db] 기본 과목코드 시드 실패:", err);
  }
}

seedDefaultSubjectCodesOnce();
