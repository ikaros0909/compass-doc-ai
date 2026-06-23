import * as XLSX from "xlsx";
import { normalizeSubjectName } from "./subjectCodeNorm";

export { normalizeSubjectName };

/**
 * 과목코드 매핑(SubjectCode ↔ SubjectName).
 *
 * PDF에서 추출한 과목명(SubjectName)만으로는 db3의 SubjectCode를 알 수 없어,
 * 사전에 업로드한 엑셀 매핑표로 과목명 → 코드를 채운다. 매칭은 공백/중점 표기
 * 차이에 견디도록 정규화된 키(normName)로 수행한다.
 *
 * 표준 서식: 시트명 "과목코드", 컬럼 [과목코드, 과목명, 사용여부].
 * "미사용" 행은 매핑에서 제외한다.
 */

export interface SubjectCodeEntry {
  /** 매칭 키 — 정규화된 과목명 */
  normName: string;
  /** 원본(표시용) 과목명 */
  subjectName: string;
  /** 과목 코드 */
  subjectCode: string;
}

const CODE_HEADER_RE = /(코드|code)/i;
const NAME_HEADER_RE = /(과목\s*명|과목명|명|name|과목)/i;
const USE_HEADER_RE = /(사용여부|사용|use)/i;
// "미사용/폐지/삭제/불가" 또는 N/X 표기는 비활성으로 간주해 매핑에서 제외.
const INACTIVE_RE = /(미사용|미\s*사용|폐지|삭제|불가|불사용|^n$|^x$)/i;

/** 시트명이 "과목코드"인 시트를 우선 선택, 없으면 첫 시트 */
function pickSheet(wb: XLSX.WorkBook): string | null {
  const preferred = wb.SheetNames.find((n) => /과목\s*코드/.test(n));
  return preferred ?? wb.SheetNames[0] ?? null;
}

/**
 * 엑셀(.xlsx/.xls) 또는 CSV 버퍼에서 (과목명, 과목코드) 행을 추출한다.
 *
 * 컬럼 인식:
 *   1) 첫 행을 헤더로 보고 "코드"/"과목명"/"사용여부" 키워드로 컬럼 위치 자동 판별
 *   2) 헤더를 못 찾으면 위치 기반 폴백 — 1열=과목코드, 2열=과목명
 *
 * "사용여부" 컬럼이 있으면 "미사용" 행은 건너뛴다. 같은 정규화 키가 중복되면
 * 마지막(활성) 값이 우선한다.
 */
export function parseSubjectCodeWorkbook(buf: Buffer): {
  entries: SubjectCodeEntry[];
  skipped: number;
  inactive: number;
  sheetName: string | null;
  detectedColumns: { code: number; name: number; use: number; byHeader: boolean };
} {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = pickSheet(wb);
  const empty = {
    entries: [],
    skipped: 0,
    inactive: 0,
    sheetName,
    detectedColumns: { code: 0, name: 1, use: -1, byHeader: false },
  };
  if (!sheetName) return empty;

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length === 0) return empty;

  const cell = (row: unknown[], idx: number): string =>
    idx >= 0 && idx < row.length ? String(row[idx] ?? "").trim() : "";

  // ── 헤더 기반 컬럼 판별
  const header = rows[0].map((c) => String(c ?? "").trim());
  let codeIdx = header.findIndex((h) => CODE_HEADER_RE.test(h));
  let nameIdx = header.findIndex(
    (h, i) => i !== codeIdx && NAME_HEADER_RE.test(h)
  );
  let useIdx = header.findIndex(
    (h, i) => i !== codeIdx && i !== nameIdx && USE_HEADER_RE.test(h)
  );
  let byHeader = codeIdx >= 0 && nameIdx >= 0 && codeIdx !== nameIdx;
  let dataStart = 1;

  if (!byHeader) {
    // 위치 폴백: 1열=코드, 2열=과목명. 첫 행이 데이터일 수 있으므로 0행부터.
    codeIdx = 0;
    nameIdx = 1;
    useIdx = -1;
    byHeader = false;
    dataStart = 0;
  }

  const byNorm = new Map<string, SubjectCodeEntry>();
  let skipped = 0;
  let inactive = 0;
  for (let r = dataStart; r < rows.length; r += 1) {
    const row = rows[r];
    const use = cell(row, useIdx);
    if (useIdx >= 0 && use && INACTIVE_RE.test(use)) {
      inactive += 1;
      continue;
    }
    const subjectCode = cell(row, codeIdx);
    const subjectName = cell(row, nameIdx);
    if (!subjectCode || !subjectName) {
      skipped += 1;
      continue;
    }
    const normName = normalizeSubjectName(subjectName);
    if (!normName) {
      skipped += 1;
      continue;
    }
    byNorm.set(normName, { normName, subjectName, subjectCode });
  }

  return {
    entries: Array.from(byNorm.values()),
    skipped,
    inactive,
    sheetName,
    detectedColumns: { code: codeIdx, name: nameIdx, use: useIdx, byHeader },
  };
}
