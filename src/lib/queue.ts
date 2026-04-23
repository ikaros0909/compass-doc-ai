import { jobsRepo } from "./db";
import { convertPdfToJson } from "./converter";
import { emitJobEvent } from "./events";

const globalForQueue = globalThis as unknown as {
  __compassQueue?: { running: boolean; started: boolean };
};

const state =
  globalForQueue.__compassQueue ??
  (globalForQueue.__compassQueue = { running: false, started: false });

export function kickQueue() {
  if (!state.started) {
    state.started = true;
    jobsRepo.resetStaleProcessing();
  }
  if (state.running) return;
  state.running = true;
  void runLoop().finally(() => {
    state.running = false;
  });
}

async function runLoop() {
  while (true) {
    const next = jobsRepo.nextQueued();
    if (!next) {
      emitJobEvent({ type: "queue.idle" });
      return;
    }

    const startedAt = new Date().toISOString();
    jobsRepo.markProcessing(next.id, startedAt);
    emitJobEvent({ type: "job.started", jobId: next.id, startedAt });

    const progressTicker = startProgressTicker(next.id);
    const t0 = Date.now();

    try {
      const { jsonPath, engine, fallbackReason } = await convertPdfToJson(
        next.pdfPath,
        next.storedName
      );
      stopProgressTicker(progressTicker);
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - t0;
      jobsRepo.markCompleted(
        next.id,
        jsonPath,
        completedAt,
        durationMs,
        engine,
        fallbackReason
      );
      console.log(
        `[queue] job ${next.id.slice(0, 8)} "${next.originalName}" ` +
          `completed in ${durationMs}ms via ${engine}` +
          (fallbackReason ? ` — reason: ${fallbackReason}` : "")
      );
      const updated = jobsRepo.findById(next.id);
      if (updated) emitJobEvent({ type: "job.completed", job: updated });
    } catch (err) {
      stopProgressTicker(progressTicker);
      const completedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);
      jobsRepo.markFailed(next.id, message, completedAt);
      emitJobEvent({ type: "job.failed", jobId: next.id, error: message });
    }
  }
}

interface Ticker {
  timer: NodeJS.Timeout;
}

function startProgressTicker(jobId: string): Ticker {
  let progress = 5;
  const timer = setInterval(() => {
    // fake-ish ease toward 90 while work is happening — the SDK does not
    // expose sub-step events, so we show steady forward motion until done.
    if (progress < 90) {
      const step = progress < 40 ? 4 : progress < 70 ? 2 : 1;
      progress = Math.min(90, progress + step);
      jobsRepo.updateProgress(jobId, progress);
      emitJobEvent({
        type: "job.progress",
        jobId,
        progress,
        stage: progress < 30 ? "파싱 시작" : progress < 60 ? "구조 추출" : "JSON 생성",
      });
    }
  }, 700);
  return { timer };
}

function stopProgressTicker(ticker: Ticker) {
  clearInterval(ticker.timer);
}
