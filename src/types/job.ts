export type JobStatus = "queued" | "processing" | "completed" | "failed" | "canceled";

export type ConverterEngine = "opendataloader-pdf" | "pdfjs-fallback";

export interface JobRecord {
  id: string;
  batchId: string;
  orderIndex: number;
  originalName: string;
  storedName: string;
  sizeBytes: number;
  pdfPath: string;
  jsonPath: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  engine: ConverterEngine | null;
  fallbackReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface BatchSummary {
  batchId: string;
  createdAt: string;
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}

export type JobEvent =
  | { type: "job.queued"; job: JobRecord }
  | { type: "job.started"; jobId: string; startedAt: string }
  | { type: "job.progress"; jobId: string; progress: number; stage: string }
  | { type: "job.completed"; job: JobRecord }
  | { type: "job.failed"; jobId: string; error: string }
  | { type: "queue.idle" };
