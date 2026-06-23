// 기본 과목코드 시드 생성기.
//   입력: test/SubjectCodeSet_Sample.xlsx (시트 "과목코드": 과목코드/과목명/사용여부)
//   출력: src/lib/data/subjectCodeSeed.json  ([subjectName, subjectCode] 쌍 배열)
//
// 빌드/배포 시 매핑표 기본값을 앱에 내장하기 위해, "미사용" 행을 제외한 활성
// 과목만 추려 (과목명, 코드) 쌍으로 저장한다. 매칭 키(normName)는 런타임에서
// normalizeSubjectName 으로 다시 계산하므로 여기서는 저장하지 않는다.
//
// 재생성: node scripts/gen-subject-seed.mjs  (원본 xlsx 필요)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "test", "SubjectCodeSet_Sample.xlsx");
const OUT = path.join(root, "src", "lib", "data", "subjectCodeSeed.json");

const CODE_RE = /(코드|code)/i;
const NAME_RE = /(과목\s*명|과목명|명|name|과목)/i;
const USE_RE = /(사용여부|사용|use)/i;
const INACTIVE_RE = /(미사용|미\s*사용|폐지|삭제|불가|불사용|^n$|^x$)/i;

function normalize(raw) {
  return String(raw)
    .normalize("NFC")
    .replace(/[ㆍ・·∙•]/g, "·")
    .replace(/\s+/g, "")
    .trim();
}

if (!fs.existsSync(SRC)) {
  console.error(`원본 엑셀을 찾을 수 없습니다: ${SRC}`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(SRC), { type: "buffer" });
const sheetName = wb.SheetNames.find((n) => /과목\s*코드/.test(n)) ?? wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
  header: 1,
  blankrows: false,
  defval: "",
});

const header = rows[0].map((c) => String(c ?? "").trim());
const codeIdx = header.findIndex((h) => CODE_RE.test(h));
const nameIdx = header.findIndex((h, i) => i !== codeIdx && NAME_RE.test(h));
const useIdx = header.findIndex(
  (h, i) => i !== codeIdx && i !== nameIdx && USE_RE.test(h)
);
const byHeader = codeIdx >= 0 && nameIdx >= 0 && codeIdx !== nameIdx;

const cIdx = byHeader ? codeIdx : 0;
const nIdx = byHeader ? nameIdx : 1;
const uIdx = byHeader ? useIdx : -1;
const start = byHeader ? 1 : 0;

const byNorm = new Map();
let inactive = 0;
for (let r = start; r < rows.length; r += 1) {
  const row = rows[r];
  const use = uIdx >= 0 ? String(row[uIdx] ?? "").trim() : "";
  if (uIdx >= 0 && use && INACTIVE_RE.test(use)) {
    inactive += 1;
    continue;
  }
  const code = String(row[cIdx] ?? "").trim();
  const name = String(row[nIdx] ?? "").trim();
  if (!code || !name) continue;
  const norm = normalize(name);
  if (!norm) continue;
  byNorm.set(norm, [name, code]);
}

const pairs = Array.from(byNorm.values());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pairs), "utf8");

console.log(
  `시트 "${sheetName}" → ${pairs.length}건 (미사용 ${inactive}건 제외) → ${path.relative(root, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`
);
