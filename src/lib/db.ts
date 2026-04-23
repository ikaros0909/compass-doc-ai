import Database from "better-sqlite3";
import { ensureDataDirs, paths } from "./paths";
import type {
  BatchSummary,
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
    return instance;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__compassDb = db;
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    batchId: row.batch_id as string,
    orderIndex: row.order_index as number,
    originalName: row.original_name as string,
    storedName: row.stored_name as string,
    sizeBytes: row.size_bytes as number,
    pdfPath: row.pdf_path as string,
    jsonPath: (row.json_path as string | null) ?? null,
    status: row.status as JobStatus,
    progress: row.progress as number,
    error: (row.error as string | null) ?? null,
    engine: (row.engine as ConverterEngine | null) ?? null,
    fallbackReason: (row.fallback_reason as string | null) ?? null,
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
    ).run(job);
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
      for (const item of items) stmt.run(item);
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
    fallbackReason: string | null
  ) {
    db.prepare(
      `UPDATE jobs SET status = 'completed', progress = 100, json_path = ?,
         completed_at = ?, duration_ms = ?, engine = ?, fallback_reason = ?,
         error = NULL
       WHERE id = ?`
    ).run(jsonPath, completedAt, durationMs, engine, fallbackReason, id);
  },

  markFailed(id: string, error: string, completedAt: string) {
    db.prepare(
      `UPDATE jobs SET status = 'failed', completed_at = ?, error = ?
       WHERE id = ?`
    ).run(completedAt, error, id);
  },

  delete(id: string) {
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  },

  deleteBatch(batchId: string) {
    db.prepare(`DELETE FROM jobs WHERE batch_id = ?`).run(batchId);
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
};
