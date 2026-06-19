export type JobStatus = "queued" | "processing" | "completed" | "failed" | "canceled";

export type ConverterEngine =
  | "opendataloader-pdf"
  | "opendataloader-pdf-hybrid"
  | "pdfjs-fallback";

/** 변환 전 pdfjs 로 싸게 뽑는 PDF 메타 — 실패 패턴(발급 출처/암호화 등) 상관분석용 */
export interface PdfProbe {
  pageCount: number | null;
  encrypted: boolean | null;
  /** 앞쪽 페이지 샘플에 텍스트 레이어가 있는지 (false 면 스캔/이미지 PDF 의심) */
  hasTextLayer: boolean | null;
  producer: string | null; // 예: NEIS, 정부24, 브라우저 인쇄 등 출처 단서
  creator: string | null;
  error?: string; // 프로빙 자체가 실패한 경우 (암호/손상)
}

/** 한 건의 변환에서 엔진 선택 근거를 남겨 사후 분석을 가능하게 하는 진단 정보 */
export interface ConvertDiagnostics {
  pdf: PdfProbe | null;
  structTree: boolean;
  hybridMode: "off" | "auto" | "full";
  /** opendataloader 가 실제로 만든 출력 파일명 (기대값과 다르면 매칭 문제 단서) */
  outputFile: string | null;
  /** 표/리스트 포함 전체 텍스트 길이 (emptiness 판정 입력값) */
  textLength: number | null;
  /** 노드 타입별 개수 (heading/table/paragraph…) */
  nodeTypes: Record<string, number> | null;
  notes: string[];
}

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
  diagnostics: ConvertDiagnostics | null;
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
