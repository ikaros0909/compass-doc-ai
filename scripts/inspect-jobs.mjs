// 변환 진단(diagnostics) 조회 도구 — "안 된" 케이스의 근거를 한눈에 본다.
//
// 사용법:
//   node scripts/inspect-jobs.mjs              # 폴백/실패 건만 (기본)
//   node scripts/inspect-jobs.mjs --all        # 전체
//   node scripts/inspect-jobs.mjs --failed     # status=failed 만
//   node scripts/inspect-jobs.mjs --fallback   # pdfjs-fallback 만
//   node scripts/inspect-jobs.mjs --json       # 원시 JSON 으로 덤프
//   node scripts/inspect-jobs.mjs --limit 50   # 개수 제한 (기본 30)
//
// DB 경로는 COMPASS_DATA_DIR 환경변수를 따른다(기본 ./data/compass.db).

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.COMPASS_DATA_DIR
  ? path.resolve(process.env.COMPASS_DATA_DIR)
  : path.resolve(__dirname, "..", "data");
const dbPath = path.join(dataDir, "compass.db");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 30 : 30;

let where = "engine = 'pdfjs-fallback' OR status = 'failed'"; // 기본: 문제 케이스
if (has("--all")) where = "1=1";
else if (has("--failed")) where = "status = 'failed'";
else if (has("--fallback")) where = "engine = 'pdfjs-fallback'";

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare(
    `SELECT id, original_name, status, engine, fallback_reason, error,
            diagnostics, duration_ms, created_at
       FROM jobs
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ?`
  )
  .all(limit);

if (rows.length === 0) {
  console.log(`해당 조건의 작업이 없습니다. (DB: ${dbPath})`);
  process.exit(0);
}

if (has("--json")) {
  console.log(
    JSON.stringify(
      rows.map((r) => ({ ...r, diagnostics: safeParse(r.diagnostics) })),
      null,
      2
    )
  );
  process.exit(0);
}

console.log(`DB: ${dbPath}`);
console.log(`조건: ${where}  (총 ${rows.length}건)\n`);

for (const r of rows) {
  const d = safeParse(r.diagnostics);
  console.log("─".repeat(70));
  console.log(`📄 ${r.original_name}   [${r.status} / ${r.engine ?? "-"}]`);
  console.log(`   id=${r.id.slice(0, 8)}  ${r.created_at}  ${r.duration_ms ?? "?"}ms`);
  if (r.error) console.log(`   ⚠ error: ${r.error}`);
  if (r.fallback_reason) console.log(`   ↩ fallback: ${r.fallback_reason}`);

  if (!d) {
    console.log("   (diagnostics 없음 — 이 컬럼 추가 이전에 처리된 작업)");
    continue;
  }
  if (d.pdf) {
    const p = d.pdf;
    console.log(
      `   PDF: ${p.pageCount ?? "?"}쪽 · textLayer=${p.hasTextLayer} ` +
        `· encrypted=${p.encrypted}` +
        (p.error ? ` · probeError=${p.error}` : "")
    );
    console.log(
      `   출처: producer=${JSON.stringify(p.producer)} creator=${JSON.stringify(p.creator)}`
    );
  }
  console.log(
    `   엔진선택: hybrid=${d.hybridMode} structTree=${d.structTree} ` +
      `textLen=${d.textLength} output=${d.outputFile ?? "-"}`
  );
  if (d.nodeTypes) {
    const top = Object.entries(d.nodeTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}:${v}`)
      .join("  ");
    console.log(`   노드: ${top}`);
  }
  if (d.notes?.length) {
    for (const n of d.notes) console.log(`   • ${n}`);
  }
}
console.log("─".repeat(70));

// 출처(producer)별 폴백 빈도 집계 — "어떤 발급본이 잘 안되는지" 패턴
const byProducer = {};
for (const r of rows) {
  const d = safeParse(r.diagnostics);
  const key = d?.pdf?.producer ?? "(unknown/diag없음)";
  byProducer[key] = (byProducer[key] ?? 0) + 1;
}
console.log("\n출처(producer)별 건수:");
for (const [k, v] of Object.entries(byProducer).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${v.toString().padStart(3)}  ${k}`);
}

function safeParse(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
