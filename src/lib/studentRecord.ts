export interface StudentRecord {
  meta: {
    school?: string;
    issuedAt?: string;
    grade?: string;
    classNo?: string;
    studentNo?: string;
    name?: string;
    pageCount?: number;
  };
  sections: RecordSection[];
  warnings: string[];
}

export interface StructuredTable {
  columns: string[];
  rows: Array<Record<string, string>>;
}

export interface RecordSection {
  id: SectionId;
  title: string;
  text: string;
  tables?: StructuredTable[];
}

export type SectionId =
  | "personal"
  | "attendance"
  | "awards"
  | "certificates"
  | "activities"
  | "volunteer"
  | "grades"
  | "reading"
  | "behavior"
  | "other";

// pdfjs는 한글 제목 글자 사이에 공백을 끼워 넣는 경우가 잦다
// (예: "2. 출 결상황", "6. 교 과학습발달상황"). 라인을 공백 제거한
// compact 형태로 검사하므로 아래 정규식도 공백 없는 형태로 유지한다.
const SECTION_PATTERNS: Array<{ id: SectionId; title: string; re: RegExp }> = [
  { id: "personal", title: "인적·학적사항", re: /^\d+\.?인적[·・]?학적사항/ },
  { id: "attendance", title: "출결상황", re: /^\d+\.?출결상황/ },
  { id: "awards", title: "수상경력", re: /^\d+\.?수상경력/ },
  { id: "certificates", title: "자격증 및 인증 취득상황", re: /^\d+\.?자격증및인증/ },
  { id: "activities", title: "창의적 체험활동상황", re: /^\d+\.?창의적체험활동/ },
  { id: "grades", title: "교과학습발달상황", re: /^\d+\.?교과학습발달상황/ },
  { id: "reading", title: "독서활동상황", re: /^\d+\.?독서활동상황/ },
  { id: "behavior", title: "행동특성 및 종합의견", re: /^\d+\.?행동특성및종합의견/ },
];

function matchSection(line: string) {
  const compact = line.replace(/\s+/g, "");
  return SECTION_PATTERNS.find((s) => s.re.test(compact));
}

const HEADER_PATTERNS = [
  /^\s*◆?\s*본\s*문서는.*나이스.*위[·・]?변조.*확인할 수 있습니다/,
  /^\s*\/\s*\d+\s+.+?(고등학교|중학교|초등학교)\s+\d{4}년/,
  /^\s*[가-힯]{2,}\s*(고등학교|중학교|초등학교)\s+\d{4}년\s+\d+월/,
];

function isPageHeader(line: string) {
  return HEADER_PATTERNS.some((re) => re.test(line));
}

function cleanLines(raw: string[]): string[] {
  return raw
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0)
    .filter((l) => !isPageHeader(l));
}

function linesFromJson(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // pdfjs fallback shape
  if (Array.isArray(obj.pages)) {
    const pages = obj.pages as Array<{ lines?: string[]; text?: string }>;
    const out: string[] = [];
    for (const p of pages) {
      if (Array.isArray(p.lines)) out.push(...p.lines);
      else if (typeof p.text === "string") out.push(...p.text.split(/\n/));
    }
    return cleanLines(out);
  }

  // opendataloader-pdf shape: `{ "file name": ..., "kids": [...] }` with
  // heading / paragraph / list / table nodes and rows→cells→kids sub-structure.
  if ("file name" in obj || "number of pages" in obj || Array.isArray(obj.kids)) {
    return cleanLines(linesFromOpendataloader(data));
  }

  // Generic fallback: walk any tree, collecting leaf text.
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o.content === "string") out.push(o.content);
    else if (typeof o.text === "string") out.push(o.text);
    for (const key of ["children", "kids", "items", "elements", "blocks"]) {
      if (o[key]) walk(o[key]);
    }
  };
  walk(data);
  return cleanLines(out);
}

/**
 * opendataloader-pdf 트리 → 라인 배열.
 * 규칙:
 *   - heading / paragraph / list item: `content`를 한 줄로 방출
 *   - list: 내부 `list items`를 순회
 *   - table: 각 row당 한 줄로 cell 텍스트를 공백으로 이어붙여 방출
 *     (cell 안의 `kids`는 paragraph 단위로 모아 한 덩어리로 합친다)
 *   - 그 외 컨테이너: `kids`/`children`로 재귀
 */
function linesFromOpendataloader(root: unknown): string[] {
  const out: string[] = [];
  const emit = (s: string) => {
    const v = s.replace(/\s+/g, " ").trim();
    if (v) out.push(v);
  };

  const collectCellText = (node: unknown): string => {
    if (!node) return "";
    if (Array.isArray(node)) return node.map(collectCellText).filter(Boolean).join(" ");
    if (typeof node !== "object") return "";
    const o = node as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.content === "string") parts.push(o.content);
    for (const key of ["kids", "children", "list items"]) {
      if (o[key]) {
        const sub = collectCellText(o[key]);
        if (sub) parts.push(sub);
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";

    if (type === "table") {
      const rows = Array.isArray(o.rows) ? (o.rows as unknown[]) : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const cells = (row as Record<string, unknown>).cells;
        if (!Array.isArray(cells)) continue;
        const cellTexts = (cells as unknown[])
          .map((c) => collectCellText(c))
          .filter((s) => s.length > 0);
        if (cellTexts.length > 0) emit(cellTexts.join(" "));
      }
      return;
    }

    if (type === "list") {
      const items = Array.isArray(o["list items"])
        ? (o["list items"] as unknown[])
        : [];
      // opendataloader-pdf는 문서 앞에 "1. 인적·학적사항 / 2. 출결상황 / 3. 수상경력"
      // 처럼 섹션 라벨만 묶인 TOC를 별도 list로 뽑아낸다. 이 목차를 그대로 emit하면
      // 실제 섹션 본문이 전부 수상경력 버킷으로 빨려들어간다. 모든 아이템이
      // 섹션 번호 라벨 형태이며 내부 kids가 비어 있으면 목차로 간주하고 건너뛴다.
      const isTocOnly =
        items.length >= 2 &&
        items.every((it) => {
          if (!it || typeof it !== "object") return false;
          const content = (it as Record<string, unknown>).content;
          const kids = (it as Record<string, unknown>).kids;
          return (
            typeof content === "string" &&
            /^\s*\d+\.\s/.test(content) &&
            Array.isArray(kids) &&
            kids.length === 0
          );
        });
      if (isTocOnly) return;
      walk(items);
      return;
    }

    // heading / paragraph / list item / heading-with-kids
    if (typeof o.content === "string") emit(o.content);

    for (const key of ["kids", "children", "list items"]) {
      if (o[key]) walk(o[key]);
    }
  };

  walk(root);
  return out;
}

function extractMeta(lines: string[], fallbackPageCount?: number): StudentRecord["meta"] {
  const meta: StudentRecord["meta"] = {};
  if (fallbackPageCount) meta.pageCount = fallbackPageCount;

  for (const line of lines.slice(0, 40)) {
    const school = line.match(/([가-힯]{2,}(?:고등학교|중학교|초등학교))/);
    if (!meta.school && school) meta.school = school[1];

    const issued = line.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (!meta.issuedAt && issued) {
      meta.issuedAt = `${issued[1]}-${issued[2].padStart(2, "0")}-${issued[3].padStart(2, "0")}`;
    }

    const gradeClass = line.match(/(\d+)\s*학년\s*(\d+)?\s*반?\s*(\d+)?\s*번?/);
    if (!meta.grade && gradeClass) {
      meta.grade = gradeClass[1];
      if (gradeClass[2]) meta.classNo = gradeClass[2];
      if (gradeClass[3]) meta.studentNo = gradeClass[3];
    }
  }
  return meta;
}

interface Bucket {
  id: SectionId;
  title: string;
  lines: string[];
}

function splitIntoBuckets(lines: string[]): Bucket[] {
  const buckets: Bucket[] = [];
  let current: Bucket = { id: "other", title: "기타", lines: [] };

  for (const line of lines) {
    const hit = matchSection(line);
    if (hit) {
      if (current.lines.length > 0 || current.id !== "other") buckets.push(current);
      current = { id: hit.id, title: hit.title, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) buckets.push(current);
  return buckets;
}

/**
 * opendataloader-pdf는 문서 앞에 섹션 1~3 라벨만 묶은 TOC를 둔 뒤, 본문에는
 * 해당 라벨을 다시 찍지 않는다. walker에서 TOC를 건너뛰었기 때문에 섹션 1~3의
 * 실제 내용은 모두 `other` 버킷에 들어간다. 본문 내부 마커
 * ("학생정보"/"학년 수업일수"/"수 상 명" 또는 "학년 (학기)")로 재분할한다.
 */
function redistributeSections1to3(buckets: Bucket[]): Bucket[] {
  const otherIdx = buckets.findIndex((b) => b.id === "other" && b.lines.length > 0);
  if (otherIdx < 0) return buckets;
  const hasPersonal = buckets.some((b) => b.id === "personal" && b.lines.length > 0);
  const hasAttendance = buckets.some(
    (b) => b.id === "attendance" && b.lines.length > 0
  );
  const hasAwards = buckets.some((b) => b.id === "awards" && b.lines.length > 0);
  if (hasPersonal || hasAttendance || hasAwards) return buckets;

  const lines = buckets[otherIdx].lines;

  const findFirst = (predicate: (l: string) => boolean): number => {
    for (let i = 0; i < lines.length; i += 1) if (predicate(lines[i])) return i;
    return -1;
  };

  const personalStart = findFirst((l) => /학생정보|학\s*적\s*사\s*항/.test(l));
  const attendanceStart = findFirst((l) =>
    /^(\s*학년\s*)?수업일수|결석일수|질병.*미인정.*기타/.test(l)
  );
  const awardsStart = findFirst((l) =>
    /수\s*상\s*명|등급\s*\(위\)|수상연월일|^학년\s*\(학기\)/.test(l)
  );

  if (personalStart < 0 && attendanceStart < 0 && awardsStart < 0) return buckets;

  const cuts: Array<{ id: SectionId; title: string; start: number }> = [];
  if (personalStart >= 0) cuts.push({ id: "personal", title: "인적·학적사항", start: personalStart });
  if (attendanceStart >= 0) cuts.push({ id: "attendance", title: "출결상황", start: attendanceStart });
  if (awardsStart >= 0) cuts.push({ id: "awards", title: "수상경력", start: awardsStart });
  cuts.sort((a, b) => a.start - b.start);

  const newBuckets: Bucket[] = [];
  // other에서 섹션 시작 이전 라인은 그대로 other로 남김
  if (cuts[0].start > 0) {
    newBuckets.push({
      id: "other",
      title: "기타",
      lines: lines.slice(0, cuts[0].start),
    });
  }
  for (let i = 0; i < cuts.length; i += 1) {
    const end = i + 1 < cuts.length ? cuts[i + 1].start : lines.length;
    newBuckets.push({
      id: cuts[i].id,
      title: cuts[i].title,
      lines: lines.slice(cuts[i].start, end),
    });
  }

  // 기존 버킷 리스트에서 other를 제거하고 새 섹션 버킷을 정렬된 위치에 삽입
  const out = [
    ...buckets.slice(0, otherIdx),
    ...newBuckets,
    ...buckets.slice(otherIdx + 1),
  ];
  return out;
}

/**
 * In pdfjs text extraction the attendance table is pulled out above its
 * "2. 출결상황" heading. Recover it by scanning the previous bucket for the
 * "학년 수업일수" table marker and shifting the tail into the attendance bucket.
 */
function recoverAttendanceRows(buckets: Bucket[]): Bucket[] {
  const attendanceIdx = buckets.findIndex((b) => b.id === "attendance");
  if (attendanceIdx <= 0) return buckets;
  const prev = buckets[attendanceIdx - 1];
  const marker = /^\s*학년\s+수업일수|^\s*수업일수/;

  const startIdx = prev.lines.findIndex((l) => marker.test(l));
  if (startIdx < 0) return buckets;

  const moved = prev.lines.slice(startIdx);
  prev.lines = prev.lines.slice(0, startIdx);
  buckets[attendanceIdx].lines = [...moved, ...buckets[attendanceIdx].lines];
  return buckets;
}

function parseAttendanceTable(lines: string[]): StructuredTable | null {
  const columns = [
    "학년",
    "수업일수",
    "결석-질병",
    "결석-미인정",
    "결석-기타",
    "지각-질병",
    "지각-미인정",
    "지각-기타",
    "조퇴-질병",
    "조퇴-미인정",
    "조퇴-기타",
    "결과-질병",
    "결과-미인정",
    "결과-기타",
    "특기사항",
  ];
  const rows: Array<Record<string, string>> = [];
  const rowRe = /^\s*(\d+)\s+(\d+)\s+(.+)$/;

  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(rowRe);
    if (!m) continue;
    const trailing = m[3]
      .split(/\s+/)
      .filter((t) => t.length > 0);
    // Expect 12 attendance values; accept rows with ≥12 where the remainder is digits/dots
    if (trailing.length < 12) continue;
    const values = trailing.slice(0, 12);
    if (!values.every((v) => /^[.\d]+$/.test(v))) continue;

    // 특기사항은 같은 줄의 12개 값 뒤에 이어지는 경우(opendataloader, 한 row per line)가
    // 많고, pdfjs처럼 다음 줄로 흘러나오는 경우도 있으므로 두 가지를 모두 결합한다.
    const inlineNote = trailing
      .slice(12)
      .join(" ")
      .replace(/(\d)\s+(\d+일)/g, "$1$2") // "9 8일" → "98일"
      .replace(/\s+/g, " ")
      .trim();
    const followupNote = collectSpecialNote(lines, i + 1);
    const note = [inlineNote, followupNote]
      .filter((s) => s.length > 0)
      .join(" ")
      .trim();
    rows.push({
      학년: m[1],
      수업일수: m[2],
      "결석-질병": values[0],
      "결석-미인정": values[1],
      "결석-기타": values[2],
      "지각-질병": values[3],
      "지각-미인정": values[4],
      "지각-기타": values[5],
      "조퇴-질병": values[6],
      "조퇴-미인정": values[7],
      "조퇴-기타": values[8],
      "결과-질병": values[9],
      "결과-미인정": values[10],
      "결과-기타": values[11],
      특기사항: note,
    });
  }

  if (rows.length === 0) return null;
  return { columns, rows };
}

function collectSpecialNote(lines: string[], start: number): string {
  const note: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*\d+\s+\d+\s+[.\d]/.test(line)) break;
    if (/^\s*\d+\.\s*(출결|수상|자격증|창의적|교과학습|독서|행동)/.test(line)) break;
    if (/^\s*학년\s+수업일수/.test(line)) break;
    note.push(line);
    if (note.join(" ").length > 80) break;
  }
  return note.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * pdfjs wraps narrow table cells across multiple lines, e.g. a single 교과
 * cell "사회(역사/도덕포함)" becomes ["사회(역사/도", "덕포함)"] and
 * "기술·가정/제2외국어/한문/교양" splits into 3+ lines. This joins those
 * fragments back onto the following row line so the regex can parse them.
 *
 * Strategy:
 *   - accumulate fragment lines into a buffer
 *   - each time the buffer + next line forms a valid row regex, flush
 *   - join without a space when the buffer has an unclosed "(" or ends with
 *     a structural separator (/ · ・) — those cases represent a word that
 *     was split mid-token, not two separate tokens
 */
// "<교과+과목> <단위수> <점수/성취도/등급 또는 P P>" 만 판정하는 line 검사기.
// 실제 교과/과목 분리는 whitelist로 수행한다.
const GRADES_ROW_RE =
  /^(.+?)\s+(\d+)\s+(\d{1,3}\/[\d.]+\([\d.]+\))\s+([A-Z])\((\d+)\)(?:\s+(\d+))?\s*$/;
const GRADES_PF_RE = /^(.+?)\s+(\d+)\s+P\s+P\s*$/;
// 진로 선택 과목 행: "<교과+과목> <단위수> <원점수/평균> <성취도(수강자)> <성취도별분포비율...>"
// - 원점수는 편차 괄호가 없는 "점수/평균" 단순 형태
// - 성취도 뒤에 "A(..) B(..) C(..)" 같은 분포비율 토큰들이 이어진다
const GRADES_CAREER_ROW_RE =
  /^(.+?)\s+(\d+)\s+(\d{1,3}\/[\d.]+)\s+([A-Z])\((\d+)\)\s+((?:[A-Z]\([\d.]+\)(?:\s+|$))+)\s*$/;

function joinWrappedGradesLines(lines: string[]): string[] {
  const rowRe = GRADES_ROW_RE;
  const pfRe = GRADES_PF_RE;
  const careerRe = GRADES_CAREER_ROW_RE;
  // 진로 선택 과목 형식도 "완성된 row"로 인정해야 "사회(역사/도"+"덕포함)" 같은
  // wrap 조각이 진로 선택 데이터 라인 앞에 붙어 교과 컨텍스트가 이어진다.
  const isRowLine = (l: string) => rowRe.test(l) || pfRe.test(l) || careerRe.test(l);
  const isFragment = (l: string) => {
    if (l.length === 0 || l.length > 30) return false;
    if (!/[가-힯]/.test(l)) return false;
    if (/\d$/.test(l)) return false;
    return true;
  };
  const smartJoin = (prev: string, next: string): string => {
    const opens = (prev.match(/\(/g) || []).length;
    const closes = (prev.match(/\)/g) || []).length;
    // unclosed "(" — 단어가 괄호 안에서 잘린 경우 (예: "사회(역사/도" + "덕포함)")
    if (opens > closes) return prev + next;
    // 경로형 구분자로 끝나는 경우 (예: "기술・가정/" + "제2외국어/한")
    if (/[/・·]$/.test(prev)) return prev + next;
    // 한글 + 짧은 한글 조각(숫자·공백 없음)이면 같은 단어 연속 — 공백 없이 결합
    // (예: "제2외국어/한" + "문/교양" → "제2외국어/한문/교양")
    if (
      next.length <= 10 &&
      /^[가-힯]/.test(next) &&
      !/[\s\d]/.test(next) &&
      /[가-힯]$/.test(prev)
    ) {
      return prev + next;
    }
    return `${prev} ${next}`;
  };

  const result: string[] = [];
  let buffer = "";
  for (const line of lines) {
    const candidate = buffer ? smartJoin(buffer, line) : line;
    if (isRowLine(candidate)) {
      result.push(candidate);
      buffer = "";
      continue;
    }
    if (isFragment(line) && buffer.length + line.length < 80) {
      buffer = candidate;
      continue;
    }
    if (buffer) {
      result.push(buffer);
      buffer = "";
    }
    result.push(line);
  }
  if (buffer) result.push(buffer);
  return result;
}

/**
 * Grades row shape (1학년 일반 과목 예시):
 *   "국어   국어   4   79/63.1(18.3)   A(290)   3"
 *   subject  course  단위  원점수/평균(편차)   성취도(수강자수)  석차등급
 *
 * Also handles pass/fail rows (원점수 자리에 "P") and
 * "진로 선택 과목" rows where the 5th+ columns shift.
 */
function parseGradesTable(rawLines: string[]): StructuredTable | null {
  const lines = joinWrappedGradesLines(rawLines);

  const tidy = (s: string) =>
    normalizeParenWrapSpaces(
      s
        // Katakana middle dot(・ U+30FB)을 교과 whitelist 기준 interpunct(· U+00B7)로 통일.
        // 두 문자는 시각적으로 같지만 codepoint가 달라 다른 문자열로 취급된다.
        .replace(/\s*[·・]\s*/g, "·")
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, " ")
        .trim()
    );

  // 고등학교 학생부 표준 교과 분류. 복합 교과명은 '/'로 분리되고
  // pdfjs에서 공백으로 깨지므로 tidy() 후 비교한다.
  // 긴 것부터 매칭하려고 정렬된 상태로 유지.
  const CATEGORIES = [
    "기술·가정/제2외국어/한문/교양",
    "제2외국어/한문/교양",
    "사회(역사/도덕포함)",
    "한국사",
    "국어",
    "수학",
    "영어",
    "과학",
    "사회",
    "체육",
    "예술",
    "교양",
    "논술",
    "기술·가정",
  ].sort((a, b) => b.length - a.length);

  const splitCategoryAndSubject = (rawLeft: string): [string, string] => {
    const left = tidy(rawLeft);
    for (const cat of CATEGORIES) {
      if (left === cat) return [cat, ""];
      if (left.startsWith(`${cat} `)) {
        return [cat, left.slice(cat.length + 1).trim()];
      }
    }
    // Fallback: 첫 어절을 교과로
    const m = left.match(/^(\S+)\s+(.+)$/);
    if (m) return [m[1], m[2]];
    return [left, ""];
  };

  const columns = [
    "학년",
    "학기",
    "구분",
    "교과",
    "과목",
    "단위수",
    "원점수/평균(편차)",
    "성취도(수강자)",
    "석차등급",
    "성취도별 분포비율",
  ];
  const rows: Array<Record<string, string>> = [];

  const gradeHeaderRe = /^\[(\d+)학년\]/;
  const semesterRe = /^([12])\s*$/;
  const careerMarkerRe = /<\s*진로\s*선택\s*과목\s*>/;
  const artsMarkerRe = /<\s*체육\s*[ㆍ·]?\s*예술\s*>/;
  let currentYear = "";
  let currentSemester = "";
  let currentCategory: GradesCategory = "일반";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const gm = line.match(gradeHeaderRe);
    if (gm) {
      currentYear = gm[1];
      currentSemester = "";
      currentCategory = "일반";
      continue;
    }
    if (careerMarkerRe.test(line)) {
      currentCategory = "진로 선택";
      continue;
    }
    if (artsMarkerRe.test(line)) {
      currentCategory = "체육·예술";
      continue;
    }
    const semMatch = line.match(semesterRe);
    if (semMatch) {
      currentSemester = semMatch[1];
      continue;
    }

    const graded = line.match(GRADES_ROW_RE);
    if (graded) {
      const [cat, subj] = splitCategoryAndSubject(graded[1]);
      rows.push({
        학년: currentYear,
        학기: currentSemester,
        구분: currentCategory,
        교과: cat,
        과목: subj,
        단위수: graded[2],
        "원점수/평균(편차)": graded[3],
        "성취도(수강자)": `${graded[4]}(${graded[5]})`,
        석차등급: graded[6] ?? "",
        "성취도별 분포비율": "",
      });
      continue;
    }

    const pf = line.match(GRADES_PF_RE);
    if (pf) {
      const [cat, subj] = splitCategoryAndSubject(pf[1]);
      rows.push({
        학년: currentYear,
        학기: currentSemester,
        구분: currentCategory,
        교과: cat,
        과목: subj,
        단위수: pf[2],
        "원점수/평균(편차)": "P",
        "성취도(수강자)": "P",
        석차등급: "",
        "성취도별 분포비율": "",
      });
      continue;
    }

    const career = line.match(GRADES_CAREER_ROW_RE);
    if (career) {
      const [cat, subj] = splitCategoryAndSubject(career[1]);
      rows.push({
        학년: currentYear,
        학기: currentSemester,
        구분: currentCategory === "일반" ? "진로 선택" : currentCategory,
        교과: cat,
        과목: subj,
        단위수: career[2],
        "원점수/평균(편차)": career[3],
        "성취도(수강자)": `${career[4]}(${career[5]})`,
        석차등급: "",
        "성취도별 분포비율": career[6].replace(/\s+/g, " ").trim(),
      });
    }
  }

  if (rows.length === 0) return null;

  // 두 엔진이 같은 (학년/학기/구분/교과/과목/단위수) row를 여러 번 방출할 수 있어
  // dedupe로 행 수가 엔진 간에 안정되도록 한다.
  const deduped = dedupeGradesRows(rows);

  // pdfjs 텍스트 추출 순서는 "학년 단위로 일반(1·2학기) → 진로 선택 → 체육·예술"
  // 이므로 같은 학년·학기가 시각적으로 반복돼 보인다. 같은 (학년, 학기) 묶음이
  // 연속 배치되도록 (학년, 학기, 구분 우선순위, 원순서) stable sort 적용.
  const categoryRank: Record<string, number> = {
    "일반": 0,
    "진로 선택": 1,
    "체육·예술": 2,
  };
  const indexed = deduped.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const ya = Number(a.r["학년"] ?? 0);
    const yb = Number(b.r["학년"] ?? 0);
    if (ya !== yb) return ya - yb;
    const sa = Number(a.r["학기"] ?? 0);
    const sb = Number(b.r["학기"] ?? 0);
    if (sa !== sb) return sa - sb;
    const ca = categoryRank[a.r["구분"] ?? "일반"] ?? 99;
    const cb = categoryRank[b.r["구분"] ?? "일반"] ?? 99;
    if (ca !== cb) return ca - cb;
    return a.i - b.i;
  });
  return { columns, rows: indexed.map((x) => x.r) };
}

/**
 * 교과학습 row 중복 제거. 두 엔진(pdfjs / opendataloader)이 각기 다른 방식으로
 * 데이터를 뽑으면서 동일한 (학년, 학기, 구분, 교과, 과목, 단위수) row를 2번
 * 방출하는 경우가 발생할 수 있다. 같은 키를 가진 row가 여러 개면 먼저 등장한
 * row(가장 많은 값이 채워진 것일 가능성)를 남기고 나머지 제거.
 */
function dedupeGradesRows(
  rows: Array<Record<string, string>>
): Array<Record<string, string>> {
  const seen = new Map<string, number>(); // key → index
  const out: Array<Record<string, string>> = [];
  const score = (r: Record<string, string>) =>
    Object.values(r).filter((v) => (v ?? "").toString().trim().length > 0).length;
  for (const r of rows) {
    const key = [
      r["학년"] ?? "",
      r["학기"] ?? "",
      r["구분"] ?? "",
      r["교과"] ?? "",
      r["과목"] ?? "",
      r["단위수"] ?? "",
    ].join("|");
    const prevIdx = seen.get(key);
    if (prevIdx === undefined) {
      seen.set(key, out.length);
      out.push(r);
    } else if (score(r) > score(out[prevIdx])) {
      // 값이 더 많이 채워진 row로 교체 (빈 필드가 적은 쪽 유지)
      out[prevIdx] = r;
    }
  }
  return out;
}

/**
 * 세부능력 및 특기사항.
 * 입력(원문) 형태:
 *   [N학년]
 *   …일반 과목 표…
 *   과목 세 부 능 력 및 특 기 사 항      ← 섹션 헤더
 *   (1학기)국어 : 작가의 자전적 에세이인 ...
 *   (2학기)국어 : 한 학기 한 권 읽기 …
 *   수학 : 수학에 대한 관심과 흥미를 …
 *   …
 *   <진로 선택 과목>                    ← 다음 sub-section 진입. 세특도 다시 나올 수 있음
 *   과목 세 부 능 력 및 특 기 사 항
 *   …
 *   <체육ㆍ예술>
 *   과목 세 부 능 력 및 특 기 사 항
 *   체육 : …
 *
 * 각 entry: "[(N학기)] 과목명 : 본문" 꼴. 본문은 여러 라인에 걸쳐 이어질 수 있음.
 * 학년은 가장 최근 [N학년] 헤딩을 사용.
 */
/**
 * 한 줄(또는 한 세특 셀의 concat된 내용)에서 "(optional 학기) 과목명 : 내용"
 * 패턴으로 구성된 여러 entry를 모두 추출한다.
 *
 *   - entry 경계: 문장이 끝나는 위치(`.` + 공백) 또는 줄 시작 바로 뒤에
 *     "(N학기)?과목명 : " 패턴이 오는 지점.
 *   - 과목명은 짧은 한글/로마숫자/점/공백 조합 (≤ 20자) — 세특 내용 안의
 *     임의의 "내용 : 부내용" 우연 매칭을 최소화.
 */
function splitSpecialNoteEntries(
  line: string
): Array<{ semester: string; subject: string; content: string }> {
  // 경계 인식: 문장 종결부 바로 뒤 공백.
  // 마침표(`.!?`) 외에 한국어 학생부 문체에서 흔한 종결어미
  // (…함/…임/…음/…됨/…봄) 뒤에 나오는 "과목 : " 도 boundary로 인정한다.
  // 이렇게 하지 않으면 "… 능력이 우수함 통합사회 : …" 같은 연속 문장에서
  // 뒤 entry(통합사회)가 앞 entry 본문에 흡수되는 누락이 발생한다.
  const re =
    /(?:^|(?<=[.!?]|함|음|임|됨|봄)\s+)((?:\(([12])학기\))?\s*[가-힯·ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ0-9][가-힯·ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ0-9 ]{0,18})\s*:\s/g;

  type Mark = { subj: string; sem: string; contentStart: number; matchStart: number };
  const marks: Mark[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const captured = m[1] ?? "";
    const sem = m[2] ?? "";
    const subj = captured
      .replace(/^\([12]학기\)/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!subj) continue;
    marks.push({
      subj,
      sem,
      contentStart: m.index + m[0].length,
      matchStart: m.index + (m[0].length - (captured.length + " : ".length)),
    });
  }

  const entries: Array<{ semester: string; subject: string; content: string }> = [];
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].contentStart;
    const end = i + 1 < marks.length ? marks[i + 1].matchStart : line.length;
    const content = line.slice(start, end).trim();
    if (content) entries.push({ semester: marks[i].sem, subject: marks[i].subj, content });
  }
  return entries;
}

function parseSpecialNotesTable(rawLines: string[]): StructuredTable | null {
  const gradeRe = /^\[([123])학년\]/;
  const sectionHeaderRe = /^과목세부능력및특기사항/;
  const blockMarkerRe = /^<[^>]+>$/;
  const pageHeaderRe = /^반\s*번호\s*성명/;

  const rows: Array<Record<string, string>> = [];
  let currentYear = "";
  let inSection = false;
  let pendingSubject: { 학년: string; 학기: string; 과목: string; 내용: string } | null = null;

  const flushPending = () => {
    if (pendingSubject && pendingSubject.내용.trim()) {
      rows.push({
        학년: pendingSubject.학년,
        학기: pendingSubject.학기,
        과목: pendingSubject.과목,
        내용: pendingSubject.내용.replace(/\s+/g, " ").trim(),
      });
    }
    pendingSubject = null;
  };

  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const compact = line.replace(/\s+/g, "");

    const gm = line.match(gradeRe);
    if (gm) {
      flushPending();
      currentYear = gm[1];
      inSection = false;
      continue;
    }

    if (sectionHeaderRe.test(compact)) {
      flushPending();
      inSection = true;
      continue;
    }

    if (blockMarkerRe.test(line)) {
      flushPending();
      inSection = false;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushPending();
      inSection = false;
      continue;
    }

    if (!inSection) continue;
    if (pageHeaderRe.test(line)) continue;
    if (/^이수단위\s*합계/.test(line)) continue;
    if (/해당\s*사항\s*없음/.test(line)) continue;

    // 한 줄에 여러 세특 entry가 이어져 있는 경우가 많다 (opendataloader 특성).
    // 먼저 이 줄을 entry 단위로 split한 뒤 누적한다.
    const entries = splitSpecialNoteEntries(line);
    if (entries.length === 0) {
      // 앞 entry의 연속 라인으로 간주
      if (pendingSubject) pendingSubject.내용 = `${pendingSubject.내용} ${line}`;
      continue;
    }
    for (const e of entries) {
      flushPending();
      pendingSubject = {
        학년: currentYear,
        학기: e.semester,
        과목: e.subject,
        내용: e.content,
      };
      // 같은 라인 안 다음 entry가 바로 flushPending을 트리거하므로 즉시 push
      flushPending();
    }
  }
  flushPending();

  if (rows.length === 0) return null;
  return {
    columns: ["학년", "학기", "과목", "내용"],
    rows,
  };
}

function buildSections(buckets: Bucket[]): RecordSection[] {
  return buckets.map<RecordSection>((b) => {
    const text = b.lines.join("\n").trim();
    const section: RecordSection = { id: b.id, title: b.title, text };

    if (b.id === "attendance") {
      const table = parseAttendanceTable(b.lines);
      if (table) section.tables = [table];
    }
    if (b.id === "grades") {
      const tables: StructuredTable[] = [];
      const gradesTable = parseGradesTable(b.lines);
      if (gradesTable) tables.push(gradesTable);
      const specialNotes = parseSpecialNotesTable(b.lines);
      if (specialNotes) tables.push(specialNotes);
      if (tables.length > 0) section.tables = tables;
    }
    if (b.id === "awards") {
      const table = parseAwardsTable(b.lines);
      if (table) section.tables = [table];
    }
    if (b.id === "volunteer" || b.id === "activities") {
      const tables: StructuredTable[] = [];
      const creative = parseCreativeActivitiesTable(b.lines);
      if (creative) tables.push(creative);
      const volunteer = parseVolunteerTable(b.lines);
      if (volunteer) tables.push(volunteer);
      if (tables.length > 0) section.tables = tables;
    }
    if (b.id === "reading") {
      const table = parseReadingTable(b.lines);
      if (table) section.tables = [table];
    }
    if (b.id === "behavior") {
      const table = parseBehaviorTable(b.lines);
      if (table) section.tables = [table];
    }
    return section;
  });
}

/**
 * 수상경력: "학년 학기" 표기 다음에 "수상명 [등급] 날짜 수여기관 참가대상" 행이 이어진다.
 * pdfjs가 긴 수상명이나 참가대상을 여러 줄로 쪼개는 경우가 있어, 날짜를 앵커 삼아
 * 완결되지 않은 라인은 다음 라인과 이어 붙인다.
 */
function parseAwardsTable(rawLines: string[]): StructuredTable | null {
  const dateRe = /\d{4}\.\d{1,2}\.\d{1,2}\./;
  const yearSemRe = /^\s*(\d)\s+(\d)\s*$/;
  const isHeader = (l: string) =>
    /^학년$|^\(학기\)$|수\s*상\s*명|등급\s*\(위\)|수상연월일|수여기관|참가대상|\(참가인원\)/.test(
      l.trim()
    );

  const merged: string[] = [];
  let buf = "";
  const pushBuf = () => {
    if (buf) merged.push(buf);
    buf = "";
  };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line || isHeader(line)) {
      pushBuf();
      continue;
    }
    const ys = line.match(yearSemRe);
    if (ys) {
      pushBuf();
      merged.push(line);
      continue;
    }
    const candidate = buf ? `${buf} ${line}` : line;
    const afterDate = candidate.split(dateRe)[1];
    if (dateRe.test(candidate) && afterDate !== undefined) {
      const tokens = afterDate.trim().split(/\s+/).filter((t) => t.length);
      // 기관 + 참가대상 최소 2 token 이상이면 한 행이 완결
      if (tokens.length >= 2) {
        merged.push(candidate);
        buf = "";
        continue;
      }
    }
    buf = candidate;
  }
  pushBuf();

  const rankRe =
    /([가-힯]+상\s*\(\s*\d+\s*위\s*\)|대상\s*\(\s*\d+\s*위\s*\)|\d+\s*위|최우수상|우수상|장려상)$/;

  const rows: Array<Record<string, string>> = [];
  let year = "";
  let sem = "";

  for (const line of merged) {
    const ys = line.match(yearSemRe);
    if (ys) {
      year = ys[1];
      sem = ys[2];
      continue;
    }

    const dm = line.match(dateRe);
    if (!dm) continue;
    const date = dm[0];
    const idx = line.indexOf(date);
    let before = line.slice(0, idx).replace(/\s+/g, " ").trim();
    const after = line.slice(idx + date.length).replace(/\s+/g, " ").trim();

    // opendataloader가 한 row를 cell-join하면서 "학년 학기" 프리픽스가 수상명
    // 앞에 붙는 경우(예: "1 1 표창장(선행부문)") 추출해서 year/sem에 반영.
    const ysPrefix = before.match(/^([123])\s+([12])\s+(.+)$/);
    if (ysPrefix) {
      year = ysPrefix[1];
      sem = ysPrefix[2];
      before = ysPrefix[3];
    }

    let name = before;
    let rank = "";
    const rm = before.match(rankRe);
    if (rm) {
      rank = rm[1].replace(/\s+/g, "");
      name = before.slice(0, before.length - rm[0].length).trim();
    }

    const afterTokens = after.split(/\s+/);
    const org = afterTokens[0] ?? "";
    const target = afterTokens.slice(1).join(" ");

    rows.push({
      학년: year,
      학기: sem,
      수상명: name,
      등급: rank,
      수상연월일: date,
      수여기관: org,
      참가대상: target,
    });
  }

  if (rows.length === 0) return null;
  return {
    columns: ["학년", "학기", "수상명", "등급", "수상연월일", "수여기관", "참가대상"],
    rows,
  };
}

/**
 * 창의적 체험활동 (자율·동아리·진로).
 * 행 포맷:
 *   "학년 영역 시간 특기사항"  (학년이 merged cell이면 생략 — 이전 학년 승계)
 *   "영역 시간 특기사항"
 * 영역: 자율활동 / 동아리활동 / 진로활동 / 봉사활동
 * 진로활동의 경우 "희망분야 X <본문>" 꼴이면 희망분야를 별도 표시한다.
 */
function parseCreativeActivitiesTable(rawLines: string[]): StructuredTable | null {
  const AREAS = "(자율활동|동아리활동|진로활동|봉사활동)";
  const withYear = new RegExp(`^([123])\\s+${AREAS}\\s+(\\d+)(?:\\s+(.+))?$`);
  const contOnly = new RegExp(`^${AREAS}\\s+(\\d+)(?:\\s+(.+))?$`);
  const pageHeaderRe = /^반\s*번호\s*성명/;
  const tableHeaderRe = /^학년\s*창\s*의\s*적|^영역\s*시간\s*특기사항/;

  const rows: Array<Record<string, string>> = [];
  let year = "";

  const pushRow = (y: string, area: string, hours: string, textRaw: string | undefined) => {
    const text = (textRaw ?? "").replace(/\s+/g, " ").trim();
    // 페이지 경계/장문으로 같은 row가 나눠져 들어오는 경우가 있다.
    // 직전 row와 학년/영역/시간이 동일하면 특기사항을 이어붙인다.
    const prev = rows[rows.length - 1];
    if (prev && prev.학년 === y && prev.영역 === area && prev.시간 === hours) {
      prev.특기사항 = [prev.특기사항, text].filter((s) => s.length > 0).join(" ").trim();
      return;
    }
    rows.push({ 학년: y, 영역: area, 시간: hours, 특기사항: text });
  };

  // 봉사활동실적 영역의 라인 패턴. creative activities의 특기사항으로 빨려들어가면 안 된다.
  const volunteerRowRe = /^\d{4}\.\d{1,2}\.\d{1,2}\./;
  const volunteerHeaderRe = /봉\s*사\s*활\s*동\s*실\s*적|일자\s*또는\s*기간|장소\s*또는\s*주관|누계\s*시간/;

  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (pageHeaderRe.test(line) || tableHeaderRe.test(line)) continue;

    const m = line.match(withYear);
    if (m) {
      year = m[1];
      pushRow(m[1], m[2], m[3], m[4]);
      continue;
    }
    const c = line.match(contOnly);
    if (c && year) {
      pushRow(year, c[1], c[2], c[3]);
      continue;
    }

    // 봉사활동실적 섹션 라인은 이 파서의 책임이 아니므로 건너뛴다
    // (parseVolunteerTable이 별도로 처리).
    if (volunteerRowRe.test(line) || volunteerHeaderRe.test(line)) continue;

    // 진로활동처럼 특기사항이 별도의 테이블 row로 emit된 경우 — 직전 영역 행에 이어 붙인다.
    const prev = rows[rows.length - 1];
    if (prev) {
      const addition = line.replace(/\s+/g, " ").trim();
      prev.특기사항 = [prev.특기사항, addition].filter((s) => s.length > 0).join(" ").trim();
    }
  }

  if (rows.length === 0) return null;
  return {
    columns: ["학년", "영역", "시간", "특기사항"],
    rows,
  };
}

/**
 * 봉사활동실적 (창체 하위).
 *
 * opendataloader는 해당 표의 데이터 셀 하나에 해당 학년의 모든 봉사 entry를
 * "<date> <place> <activity> <hours> <acc> <date> <place> ..." 형태로 적층해서
 * 돌려준다. 따라서 섹션 본문을 날짜 앵커로 쪼개 각 entry를 추출한다.
 * pdfjs 경로의 라인별 entry 입력도 동일 로직으로 처리된다.
 */
function parseVolunteerTable(rawLines: string[]): StructuredTable | null {
  const dateRe =
    /\d{4}\.\d{1,2}\.\d{1,2}\.(?:\s*-\s*\d{4}\.\d{1,2}\.\d{1,2}\.)?/g;
  const tailRe = /^(.+?)\s+(\d{1,3})\s+(\d{1,3})\s*$/;
  const schoolRe = /(?:고등학교|중학교|초등학교|기관|학원|회사|단체|기업)/;

  // 봉사활동실적 섹션 경계를 찾아 그 이후의 라인만 본다.
  let inSection = false;
  const sectionLines: string[] = [];
  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/봉\s*사\s*활\s*동\s*실\s*적/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/일자\s*또는\s*기간|장소\s*또는\s*주관|누계\s*시간/.test(line)) continue;
    if (/^반\s*번호\s*성명/.test(line)) continue;
    // 다음 큰 섹션 헤더가 나오면 종료
    if (/^\d+\.\s/.test(line)) break;
    sectionLines.push(line);
  }
  if (sectionLines.length === 0) return null;

  const rows: Array<Record<string, string>> = [];
  let year = "";

  for (const line of sectionLines) {
    // 라인 맨 앞에 학년 단독 토큰("1 ", "2 ", "3 ")이 오면 업데이트
    let body = line;
    const yearLead = body.match(/^([123])\s+(?=\d{4}\.)/);
    if (yearLead) {
      year = yearLead[1];
      body = body.slice(yearLead[0].length);
    } else {
      const justYear = body.match(/^([123])\s*$/);
      if (justYear) {
        year = justYear[1];
        continue;
      }
    }

    const matches = [...body.matchAll(dateRe)];
    if (matches.length === 0) continue;

    for (let i = 0; i < matches.length; i += 1) {
      const date = matches[i][0].replace(/\s+/g, " ");
      const start = (matches[i].index ?? 0) + matches[i][0].length;
      const end =
        i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
      const segment = body.slice(start, end).trim();
      const t = segment.match(tailRe);
      if (!t) continue;
      const rest = t[1].trim();

      // 장소/기관 추출: "(학교)광주고등학교" 또는 "(학교)광 주 고등학교" 형태 우선
      const placeMatch = rest.match(
        new RegExp(`^((?:\\([^)]+\\))?[^\\s]*(?:\\s+[^\\s]+){0,3}?\\s*(?:${schoolRe.source}))\\s+(.+)$`)
      );
      let place: string;
      let activity: string;
      if (placeMatch) {
        place = placeMatch[1].replace(/\s+/g, " ").trim();
        activity = placeMatch[2].trim();
      } else {
        // 앞쪽 1-2 토큰을 장소로 사용 (fallback)
        const tokens = rest.split(" ");
        place = tokens.slice(0, Math.min(2, tokens.length)).join(" ");
        activity = tokens.slice(Math.min(2, tokens.length)).join(" ");
      }

      rows.push({
        학년: year,
        "일자/기간": date,
        "장소/주관기관": place,
        활동내용: activity,
        시간: t[2],
        누계시간: t[3],
      });
    }
  }

  if (rows.length === 0) return null;
  return {
    columns: ["학년", "일자/기간", "장소/주관기관", "활동내용", "시간", "누계시간"],
    rows,
  };
}

/**
 * 독서활동상황. 두 가지 라인 포맷을 모두 지원:
 *   - opendataloader-pdf: "학년? 영역 (N학기) 도서..." 한 줄
 *   - pdfjs fallback:     학년/영역/(N학기) 도서가 별도 라인으로 분해
 */
function parseReadingTable(rawLines: string[]): StructuredTable | null {
  const fullRowRe = /^(?:([123])\s+)?(.+?)\s+\(([12])학기\)\s+(.+)$/;
  const contRe = /^\(([12])학기\)\s+(.+)$/;
  const headerRe = /^학년\s*과목\s*또는\s*영역\s*독서/;
  const pageHeaderRe = /^반\s*번호\s*성명/;

  const hasFullRow = rawLines.some((l) => fullRowRe.test(l.trim()));

  if (hasFullRow) {
    const rows: Array<Record<string, string>> = [];
    let year = "";
    let area = "";
    for (const raw of rawLines) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      if (headerRe.test(line) || pageHeaderRe.test(line)) continue;

      const c = line.match(contRe);
      if (c && year && area) {
        rows.push({
          학년: year,
          영역: area,
          학기: `${c[1]}학기`,
          도서: c[2].trim(),
        });
        continue;
      }

      const m = line.match(fullRowRe);
      if (m) {
        if (m[1]) year = m[1];
        area = m[2].trim();
        rows.push({
          학년: year,
          영역: area,
          학기: `${m[3]}학기`,
          도서: m[4].trim(),
        });
      }
    }
    if (rows.length === 0) return null;
    return { columns: ["학년", "영역", "학기", "도서"], rows };
  }

  // 구 pdfjs 방식 — 라인별로 학년/영역/(N학기) 분리
  const rows: Array<Record<string, string>> = [];
  const yearRe = /^\s*([123])\s*$/;
  const semRe = /^\(([12])학기\)\s*(.*)$/;

  let year = "";
  let area = "";
  let sem = "";
  let bookBuf = "";

  const flush = () => {
    if (year && sem && bookBuf.trim()) {
      rows.push({
        학년: year,
        영역: area || "(공통)",
        학기: `${sem}학기`,
        도서: bookBuf.replace(/\s+/g, " ").trim(),
      });
    }
    bookBuf = "";
  };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    if (headerRe.test(line.replace(/\s+/g, " "))) continue;

    const y = line.match(yearRe);
    if (y) {
      flush();
      year = y[1];
      area = "";
      sem = "";
      continue;
    }
    const s = line.match(semRe);
    if (s) {
      flush();
      sem = s[1];
      bookBuf = s[2];
      continue;
    }
    if (line.length <= 20 && !/[(),]/.test(line)) {
      flush();
      area = line.replace(/\s+/g, " ");
      sem = "";
      continue;
    }
    if (sem) bookBuf += ` ${line}`;
  }
  flush();

  if (rows.length === 0) return null;
  return { columns: ["학년", "영역", "학기", "도서"], rows };
}

/**
 * 행동특성 및 종합의견.
 *   - opendataloader: "N <긴 내용>" 한 줄
 *   - pdfjs:          학년 → 여러 라인 문단
 */
function parseBehaviorTable(rawLines: string[]): StructuredTable | null {
  const rows: Array<Record<string, string>> = [];
  // "1", "1학년" 모두 학년 마커로 인식. content가 뒤에 붙는 경우도 동일 패턴.
  const fullRowRe = /^\s*([123])\s*(?:학년)?\s+(.+)$/;
  const yearOnlyRe = /^\s*([123])\s*(?:학년)?\s*$/;
  const headerRe = /^학년행동특성및종합의견|행동특성및종합/;
  // 학생부 사본 증명 영역의 footer 라인들을 명시적으로 제외. `\b`는 Hangul
  // EOL에서 작동하지 않으므로 사용하지 않고 어휘 조각으로만 매칭.
  const footerRe = /^반\s*번호|^발급번호|^생\s*활\s*기\s*록\s*부|^담당부서|^담\s*당\s*자|^전화번호|^위\s*사람의|고등학교장|^\d{4}년\s*\d+월|^성\s*명|^주민등록번호|^인적\s*사항|^사항\s*$|^사\s*본\s*임|^광\s*주\s*고/;
  // 특정 라인 이후부터는 학생부 본문이 끝난 것으로 간주해 누적 중단.
  const endOfContentRe = /^발급번호|^생\s*활\s*기\s*록\s*부|^위\s*사람의\s*생활기록부/;

  // 입력 라인을 "content가 있는 버전"으로 정제: header/footer는 사전 제거.
  const compact = (s: string) => s.replace(/\s+/g, "");
  const filtered: string[] = [];
  let stopped = false;
  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (stopped) continue;
    if (endOfContentRe.test(line)) {
      stopped = true;
      continue;
    }
    if (headerRe.test(compact(line))) continue;
    if (footerRe.test(line)) continue;
    filtered.push(line);
  }

  const hasFullRow = filtered.some(
    (l) => fullRowRe.test(l) && !yearOnlyRe.test(l)
  );

  if (hasFullRow) {
    for (const line of filtered) {
      if (yearOnlyRe.test(line)) continue;
      const m = line.match(fullRowRe);
      if (m) rows.push({ 학년: m[1], 내용: m[2].trim() });
    }
    if (rows.length === 0) return null;
    return { columns: ["학년", "내용"], rows };
  }

  // pdfjs stateful: 학년 라인 + 이후 본문 라인들을 한 행으로 합침
  let year = "";
  let buf: string[] = [];
  const flush = () => {
    if (year && buf.length > 0) {
      rows.push({ 학년: year, 내용: buf.join(" ").replace(/\s+/g, " ").trim() });
    }
    buf = [];
  };
  for (const line of filtered) {
    const y = line.match(yearOnlyRe);
    if (y) {
      flush();
      year = y[1];
      continue;
    }
    if (year) buf.push(line);
  }
  flush();

  if (rows.length === 0) return null;
  return { columns: ["학년", "내용"], rows };
}

/**
 * opendataloader-pdf의 교과학습 테이블은 "한 데이터 row, 컬럼마다 N개 값 적층" 구조다.
 * 예: 1학년 1학기 → 1 row with cells
 *   [학기="1", 교과="국어 수학 영어 …", 과목="국어 수학 영어 …",
 *    단위="4 4 4 …", 원점수="79/63.1(18.3) 70/46.5(23.1) …",
 *    성취도="A(290) A(290) …", 등급="3 3 4 1 4 3"]
 * 각 컬럼을 공백으로 토큰화 후 길이를 맞춰 zip한다.
 */
function extractOpendataloaderGrades(root: unknown): StructuredTable | null {
  // 트리를 한 번 순회하면서 "[N학년]" 헤딩을 currentGrade로 유지한 채
  // 그 시점에 만난 교과학습 테이블에 학년을 동시에 태깅한다.
  // (사후 "학기 transition"을 근거로 학년을 추론하던 방식은 opendataloader가
  //  같은 학년·학기를 2개 테이블로 쪼갤 때 학년이 밀리는 오정렬을 유발했다.)
  const gradesTables = collectGradesTablesWithYear(root);

  // "과목명 사이에 공백이 들어간 경우" (예: "고전 읽기", "스포츠 생활",
  // "영어 독해와 작문", "진로와 직업")를 안정적으로 segment하기 위해, 같은 문서의
  // 세특 섹션에서 "<과목명> : <본문>" 형식으로 이미 bounded되어 있는 과목명을
  // 추출해 whitelist로 사용한다. 하드코딩된 연속어 리스트에 의존하지 않는다.
  const knownSubjects = collectKnownSubjects(root);
  const knownSubjectsByLength = Array.from(knownSubjects)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);

  const rows: Array<Record<string, string>> = [];

  // 일반 과목은 "점수/평균(편차)" (예: 79/63.1(18.3)) 형식이고, 진로 선택 과목은
  // "점수/평균" (예: 67/68.2)로 편차 괄호가 없다. 두 형식을 모두 수용.
  const scoreRe = /^\d{1,3}\/[\d.]+(?:\([\d.]+\))?$/;
  const achieveRe = /^([A-Z])\((\d+)\)$/;
  const rankOnly = /^\d+$/;

  const splitTokens = (s: string): string[] =>
    s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  for (const { table: t, grade, category } of gradesTables) {
    const dataRows = extractTableRows(t);
    if (dataRows.length <= 1) continue; // header만 있으면 skip

    for (const row of dataRows.slice(1)) {
      // 각 셀을 cell-text로 만들되, 여러 paragraph는 공백으로 이어붙임
      const cellTexts = row.map((cell) =>
        collectParagraphTexts(cell).join(" ").replace(/\s+/g, " ").trim()
      );
      if (cellTexts.length < 7) continue;

      const semester = cellTexts[0].trim();
      if (!/^[12]$/.test(semester)) continue;

      // 단위수 셀을 "진실의 원천"으로 삼는다. 단위수는 항상 단일 숫자 토큰이라
      // 모호함이 없고, paragraph 단위로 묶인 그룹 구조(= 교과 그룹 내 과목 개수)를
      // 그대로 드러낸다. 다른 컬럼은 이 구조에 맞춰 정렬한다.
      //
      // 예) 1학년 2학기 units cell:
      //   paragraphs = ["4 4 4 1", "3 3 1", "1", "1", "1", "2", "1"]
      //   unitsGroups = [["4","4","4","1"], ["3","3","1"], ["1"], ["1"], ["1"], ["2"], ["1"]]
      //   N = 12 (과목 수)
      //
      // 해당 그룹 구조를 기준으로 과목 컬럼을 align하면 "진로와 직업"은 k=1 그룹
      // paragraph로 남아 한 덩어리로 유지되고, "국어 수학 영어 한국사"는 k=4 그룹
      // paragraph라 공백 분해된다.
      const unitsCell = row[3];
      const unitsParas = collectParagraphTexts(unitsCell)
        .map((p) => p.trim())
        .filter(Boolean);
      const unitsGroups = unitsParas.map((p) =>
        p.split(/\s+/).filter((t) => /^\d+$/.test(t))
      );
      const units = unitsGroups.flat();
      const N = units.length;
      if (N === 0) continue;

      /**
       * 셀 값을 units 그룹 구조에 맞춰 N개로 정렬한다.
       *   - paragraph 수가 그룹 수와 일치하면 각 paragraph를 k개로 분해 (k=1은 통째)
       *   - 그렇지 않으면 flatten 후 토큰화
       *   - 특수 토큰 필터(validate)가 주어지면 그것만 남기고 누락된 자리는 ""
       */
      const alignColumn = (
        cellIdx: number,
        validate?: (s: string) => boolean
      ): string[] => {
        const cell = row[cellIdx];
        const paras = collectParagraphTexts(cell)
          .map((p) => p.trim())
          .filter(Boolean);

        let out: string[] = [];
        if (paras.length === unitsGroups.length && unitsGroups.length > 0) {
          for (let i = 0; i < paras.length; i += 1) {
            const k = unitsGroups[i].length;
            if (k === 1) {
              out.push(paras[i]);
            } else {
              const toks = tokenizeRespectingParens(paras[i]);
              // 공백 포함 복합 과목명("고전 읽기" 등) 복원: 토큰이 k보다 많으면
              // "읽기·생활·연주"처럼 단독으로 쓰일 수 없는 연속어를 이전 토큰에 흡수.
              const seg = segmentByContinuation(toks, k);
              for (let j = 0; j < k; j += 1) out.push(seg[j] ?? "");
            }
          }
        } else {
          const flat = mergeSingleHangulWraps(
            tokenizeRespectingParens(paras.join(" "))
          );
          if (flat.length === N) out = flat;
          else if (flat.length > N) out = segmentByContinuation(flat, N);
          else if (validate) out = flat.filter(validate);
          else out = flat;
        }

        if (validate) {
          // 석차등급처럼 값이 N보다 적을 수 있는 경우 → validate로 걸러낸 토큰을
          // 순서대로 앞에서부터 매핑하고 빈 자리는 "" 로 둔다.
          const filtered = out.flatMap((s) =>
            tokenizeRespectingParens(s)
          ).filter(validate);
          const aligned = new Array(N).fill("");
          for (let i = 0; i < Math.min(filtered.length, N); i += 1) {
            aligned[i] = filtered[i];
          }
          // validate 적용 시엔 out 길이가 N이어야 하므로 aligned 반환
          return aligned;
        }
        return out;
      };

      // 교과 컬럼: opendataloader가 "기술·가정/제2외국어/한문/교양"처럼 복합 교과를
      // 한 paragraph에 세로 높이만큼 반복 페인팅한다(과목당 4개 토큰 × N번).
      // 또한 일반 과목과 같은 셀에 섞여 있어 "head(distinct) + tail(repeated)" 구조가
      // 자주 나온다. 끝에서부터 가장 긴 k×m 반복 꼬리를 찾고, head 토큰 수가 head
      // 과목 수와 일치하면 그대로 채택해 broadcast한다.
      // 과목 컬럼: 세특에서 수집한 known subjects whitelist로 longest-match
      // segmentation을 우선 시도한다. 이는 하드코딩된 연속어 리스트에 의존하지 않고,
      // 문서 자체가 제공하는 정답 과목명을 사용하는 근본 해법이다.
      // whitelist로 N개 정렬이 성공하면 그것을 쓰고, 실패하면 기존 alignColumn
      // (paragraph 수 매칭 + continuation-word fallback)을 쓴다.
      const subjectsFromWhitelist: string[] | null = (() => {
        if (knownSubjectsByLength.length === 0) return null;
        const flat = mergeSingleHangulWraps(
          tokenizeRespectingParens(collectParagraphTexts(row[2]).join(" "))
        );
        const seg = segmentByWhitelist(flat, knownSubjectsByLength);
        return seg.length === N ? seg : null;
      })();

      const categories: string[] = (() => {
        const all = tokenizeRespectingParens(
          collectParagraphTexts(row[1]).join(" ")
        );

        // 1순위: 교과 whitelist longest-match. 교과는 교육과정상 닫힌 집합이라
        // "기술・/가정//제2외국어·한/문·교양" 같은 wrap 파편이 섞여도 smart-join
        // 재결합 후 compact 비교로 안정 매칭된다.
        const whitelisted = segmentCategoriesByWhitelist(all);
        if (whitelisted.length === N) return whitelisted;

        if (all.length === N) return all;
        if (all.length > N) {
          let bestM = 0;
          let bestK = 0;
          const maxM = Math.min(10, Math.floor(all.length / 2));
          for (let m = 1; m <= maxM; m += 1) {
            let k = 1;
            while ((k + 1) * m <= all.length) {
              let match = true;
              for (let j = 0; j < m; j += 1) {
                if (
                  all[all.length - (k + 1) * m + j] !==
                  all[all.length - k * m + j]
                ) {
                  match = false;
                  break;
                }
              }
              if (!match) break;
              k += 1;
            }
            if (k >= 2) {
              const headTokens = all.length - k * m;
              const headSubjects = N - k;
              if (headSubjects >= 0 && headTokens === headSubjects) {
                if (k * m > bestK * bestM) {
                  bestM = m;
                  bestK = k;
                }
              }
            }
          }
          if (bestK > 0) {
            const headTokens = all.length - bestK * bestM;
            const head = all.slice(0, headTokens);
            const tailCategory = smartJoinFragments(
              all.slice(headTokens, headTokens + bestM)
            );
            const tail = new Array<string>(bestK).fill(tailCategory);
            return [...head, ...tail];
          }
        }
        return alignColumn(1);
      })();
      const subjects = subjectsFromWhitelist ?? alignColumn(2);
      const achieves = alignColumn(5, (s) => achieveRe.test(s) || s === "P");

      // 원점수도 sparse: P/F 과목은 opendataloader가 점수 셀에서 "P" 토큰을 생략한 채
      // 숫자 점수만 남기는 경우가 있어 단순 left-pack이 오정렬을 유발.
      // 성취도가 "P"인 위치는 점수도 "P"로 강제하고, 나머지 position에만 실제 점수
      // 토큰을 차례로 채운다.
      const rawScores = tokenizeRespectingParens(
        collectParagraphTexts(row[4]).join(" ")
      ).filter((s) => scoreRe.test(s));
      const scores: string[] = new Array(N).fill("");
      let scoreIdx = 0;
      for (let i = 0; i < N; i += 1) {
        const ach = achieves[i] ?? "";
        if (ach === "P") scores[i] = "P";
        else if (ach.length > 0 && scoreIdx < rawScores.length) {
          scores[i] = rawScores[scoreIdx];
          scoreIdx += 1;
        }
      }

      // row[6] 해석은 테이블 카테고리에 따라 다르다:
      //   - 일반          → 석차등급 (단일 숫자)
      //   - 진로 선택      → 성취도별 분포비율 ("A(22.2) B(55.6) C(22.2)" 식으로
      //                    과목당 여러 성취도 레벨의 비율)
      //   - 체육·예술      → 비어 있음 (row[5] 성취도만)
      const ranks: string[] = new Array(N).fill("");
      const distributions: string[] = new Array(N).fill("");

      if (category === "진로 선택") {
        const distribTokens = tokenizeRespectingParens(
          collectParagraphTexts(row[6]).join(" ")
        ).filter((s) => /^[A-Z]\([\d.]+\)$/.test(s));
        if (distribTokens.length > 0 && N > 0) {
          const per = distribTokens.length / N;
          if (Number.isInteger(per) && per > 0) {
            for (let i = 0; i < N; i += 1) {
              distributions[i] = distribTokens
                .slice(i * per, (i + 1) * per)
                .join(" ");
            }
          } else {
            // 비정상적으로 나누어지지 않으면 1과목에 토큰 1개씩 (best effort)
            for (let i = 0; i < N; i += 1) {
              distributions[i] = distribTokens[i] ?? "";
            }
          }
        }
      } else {
        // 석차등급은 sparse: "P/F 과목"과 "실험 과목"에는 등급이 없음.
        const rankTokens = tokenizeRespectingParens(
          collectParagraphTexts(row[6]).join(" ")
        ).filter((s) => rankOnly.test(s));
        let rankIdx = 0;
        for (let i = 0; i < N; i += 1) {
          const ach = achieves[i] ?? "";
          const subj = subjects[i] ?? "";
          const hasRank =
            ach.length > 0 && ach !== "P" && !/실험\s*$/.test(subj);
          if (hasRank && rankIdx < rankTokens.length) {
            ranks[i] = rankTokens[rankIdx];
            rankIdx += 1;
          }
        }
      }

      for (let i = 0; i < N; i += 1) {
        const subj = subjects[i] ?? "";
        const unit = units[i] ?? "";
        const score = scores[i] ?? "";
        const ach = achieves[i] ?? "";
        const cat = normalizeParenWrapSpaces(
          (categories[i] ?? "").replace(/・/g, "·")
        );
        const rank = i < ranks.length && rankOnly.test(ranks[i]) ? ranks[i] : "";
        rows.push({
          학년: grade,
          학기: semester,
          구분: category,
          교과: cat,
          과목: subj,
          단위수: unit,
          "원점수/평균(편차)": score === "P" ? "P" : score,
          "성취도(수강자)": ach === "P" ? "P" : ach,
          석차등급: rank,
          "성취도별 분포비율": distributions[i] ?? "",
        });
      }
    }
  }

  if (rows.length === 0) return null;

  // 두 엔진 간 row 수 안정화를 위해 중복 제거 후 정렬.
  const deduped = dedupeGradesRows(rows);

  // PDF는 학년 단위로 "일반(1·2학기) → 진로 선택(1·2학기) → 체육·예술(1·2학기)"
  // 순서라 같은 학년·학기가 시각적으로 반복돼 보인다. 같은 학년·학기끼리 묶이도록
  // (학년, 학기, 구분 우선순위)로 stable sort 한다.
  const categoryRank: Record<string, number> = {
    "일반": 0,
    "진로 선택": 1,
    "체육·예술": 2,
  };
  const indexed = deduped.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const ya = Number(a.r["학년"] ?? 0);
    const yb = Number(b.r["학년"] ?? 0);
    if (ya !== yb) return ya - yb;
    const sa = Number(a.r["학기"] ?? 0);
    const sb = Number(b.r["학기"] ?? 0);
    if (sa !== sb) return sa - sb;
    const ca = categoryRank[a.r["구분"] ?? "일반"] ?? 99;
    const cb = categoryRank[b.r["구분"] ?? "일반"] ?? 99;
    if (ca !== cb) return ca - cb;
    return a.i - b.i; // stable
  });
  const sorted = indexed.map((x) => x.r);

  return {
    columns: [
      "학년",
      "학기",
      "구분",
      "교과",
      "과목",
      "단위수",
      "원점수/평균(편차)",
      "성취도(수강자)",
      "석차등급",
      "성취도별 분포비율",
    ],
    rows: sorted,
  };
}

function collectTablesOfType(root: unknown, types: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (n: unknown) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.type === "string" && types.includes(o.type)) out.push(o);
    for (const k of ["kids", "children", "list items", "rows", "cells"]) {
      if (o[k]) walk(o[k]);
    }
  };
  walk(root);
  return out;
}

function tableHeaderText(table: Record<string, unknown>): string {
  const rows = Array.isArray(table.rows) ? (table.rows as unknown[]) : [];
  if (rows.length === 0) return "";
  const first = rows[0] as Record<string, unknown>;
  const cells = Array.isArray(first.cells) ? (first.cells as unknown[]) : [];
  return cells.map((c) => collectParagraphTexts(c).join(" ")).join(" ");
}

function extractTableRows(
  table: Record<string, unknown>
): Array<Array<Record<string, unknown>>> {
  const rows = Array.isArray(table.rows) ? (table.rows as unknown[]) : [];
  return rows.map((r) => {
    if (!r || typeof r !== "object") return [];
    const cells = (r as Record<string, unknown>).cells;
    if (!Array.isArray(cells)) return [];
    return cells as Array<Record<string, unknown>>;
  });
}

function collectParagraphTexts(cell: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.content === "string") out.push(o.content);
    for (const k of ["kids", "children", "list items"]) {
      if (o[k]) walk(o[k]);
    }
  };
  walk(cell);
  return out;
}

/**
 * 고등학교 교과 whitelist. 교육과정에서 정의된 닫힌 집합이라 하드코딩이 타당하다.
 * 과목과 달리 새로 추가될 가능성이 거의 없음. 긴 것부터 매칭하기 위해 정렬.
 */
const GRADES_CATEGORIES = [
  "기술·가정/제2외국어/한문/교양",
  "제2외국어/한문/교양",
  "사회(역사/도덕포함)",
  "한국사",
  "기술·가정",
  "국어",
  "수학",
  "영어",
  "과학",
  "사회",
  "체육",
  "예술",
  "교양",
  "논술",
].sort((a, b) => b.length - a.length);

/**
 * 교과 토큰들을 whitelist에 맞춰 longest-match 분할한다.
 *   토큰이 "기술・", "가정/", "제2외국어/한", "문/교양" 처럼 wrap 파편일 때
 *   smartJoin으로 재결합해 whitelist 엔트리와 compact 비교.
 */
function segmentCategoriesByWhitelist(tokens: string[]): string[] {
  const compact = (s: string) =>
    normalizeParenWrapSpaces(s)
      .replace(/\s+/g, "")
      .replace(/・/g, "·");
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    // 가장 긴 매칭을 찾기 위해 각 whitelist 엔트리를 시도
    for (const cat of GRADES_CATEGORIES) {
      const target = compact(cat);
      // smartJoin 후 compact가 target과 같아지는 최소 k를 찾는다 (최대 10 토큰까지)
      for (let k = 1; k <= Math.min(10, tokens.length - i); k += 1) {
        const joined = smartJoinFragments(tokens.slice(i, i + k));
        if (compact(joined) === target) {
          out.push(cat);
          i += k;
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * wrapped 조각들을 PDF 원형으로 smart-join.
 *   - 괄호 미닫힘 → 공백 없이 결합
 *   - 경로형 구분자(`/ · ・`)로 끝남 → 공백 없이 결합
 *   - 한글 끝 + 짧은 한글 조각(공백·숫자 없음) → 단어 연속으로 공백 없이 결합
 */
function smartJoinFragments(frags: string[]): string {
  let out = "";
  for (const f of frags) {
    if (!out) {
      out = f;
      continue;
    }
    const opens = (out.match(/\(/g) || []).length;
    const closes = (out.match(/\)/g) || []).length;
    let noSpace = false;
    if (opens > closes) noSpace = true;
    else if (/[/・·]$/.test(out)) noSpace = true;
    else if (
      f.length <= 10 &&
      /^[가-힯]/.test(f) &&
      !/[\s\d]/.test(f) &&
      /[가-힯]$/.test(out)
    ) {
      noSpace = true;
    }
    out = noSpace ? out + f : `${out} ${f}`;
  }
  return out.trim();
}

/**
 * 진로 선택 과목 이름이 공백을 포함하는 경우 ("고전 읽기", "스포츠 생활",
 * "음악 연주", "영미 문학 읽기" 등) opendataloader는 한 셀 안에 단일 paragraph로
 * 모든 과목을 공백 joined 문자열로 돌려준다. 공백 기준 토큰화만 하면 과목이
 * 더 쪼개져 N을 초과하는데, 이때 "뒷말 단독으로는 과목이 될 수 없는 연속어"를
 * 앞 토큰에 흡수시켜 재결합한다.
 */
const SUBJECT_CONTINUATION_WORDS = new Set<string>([
  "읽기",
  "쓰기",
  "생활",
  "연주",
  "창작",
  "탐구",
  "비평",
  "이해",
  "실험",
  "활용",
  "작문",
  "회화",
  "문법",
  "발음",
  "사상",
  "감상과",
  "독해와",
  "과학",
  "수학",
]);

/**
 * 같은 문서의 세특 섹션에서 "<과목명> : <본문>" 형식으로 emit된 모든 과목명을
 * 수집한다. 한 문자열 안에 여러 entry가 연속 concatenate된 경우도
 * `splitSpecialNoteEntries`로 정확히 분리되므로, 공백 포함 과목명도 단일 단위로
 * whitelist에 들어간다 ("고전 읽기", "스포츠 생활", "영어 독해와 작문" 등).
 */
function collectKnownSubjects(root: unknown): Set<string> {
  const subjects = new Set<string>();
  const walk = (n: unknown) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.content === "string" && o.content.includes(":")) {
      for (const e of splitSpecialNoteEntries(o.content)) {
        const name = (e.subject ?? "").trim();
        if (name && /[가-힯]/.test(name)) subjects.add(name);
      }
    }
    for (const k of ["kids", "children", "list items", "rows", "cells"]) {
      if (o[k]) walk(o[k]);
    }
  };
  walk(root);
  return subjects;
}

/**
 * PDF 줄바꿈이 단어를 1자 단위로 쪼개는 경우를 보정한다.
 * "작"·"문" 같이 단독 1글자 한글 토큰이 앞 토큰에 붙어야 의미가 되는 wrap artifact를
 * 직전 Hangul-ending 토큰에 흡수시켜 한 단어로 복원.
 *   ["영어", "독해와", "작", "문", "교육학"] → ["영어", "독해와", "작문", "교육학"] → …
 *   (그 뒤 단계(segmentByContinuation / whitelist)에서 다시 병합 가능)
 *
 * 주의: 단독 1글자 한글(시, 일, 책 등)은 실제 과목·교과명에서 거의 쓰이지 않아
 *  안전하다. 과목명은 최소 2자 이상이 관행.
 */
function mergeSingleHangulWraps(tokens: string[]): string[] {
  const isSingleHangul = (t: string): boolean =>
    t.length === 1 && /[가-힯]/.test(t);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    // 1-char 한글 런이 2개 이상 연속될 때만 하나의 토큰으로 합친다 ("작" + "문" → "작문").
    // 단독으로 떠 있는 1-char 토큰은 그대로 둬서 "독해와" 같은 의미 있는 앞 토큰에
    // 섞이지 않도록 한다.
    if (
      isSingleHangul(t) &&
      i + 1 < tokens.length &&
      isSingleHangul(tokens[i + 1])
    ) {
      let merged = t;
      i += 1;
      while (i < tokens.length && isSingleHangul(tokens[i])) {
        merged += tokens[i];
        i += 1;
      }
      out.push(merged);
    } else {
      out.push(t);
      i += 1;
    }
  }
  return out;
}

/**
 * tokens 배열을 whitelist(긴 과목명 먼저) 기준으로 greedy longest-match해서
 * segment한다. whitelist에 없는 토큰은 단일 토큰으로 남긴다.
 */
function segmentByWhitelist(
  tokens: string[],
  whitelistSortedByWordCount: string[]
): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (const subj of whitelistSortedByWordCount) {
      const sw = subj.split(/\s+/);
      if (sw.length === 0 || sw.length > tokens.length - i) continue;
      let ok = true;
      for (let j = 0; j < sw.length; j += 1) {
        if (tokens[i + j] !== sw[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        out.push(subj);
        i += sw.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

function segmentByContinuation(tokens: string[], target: number): string[] {
  if (tokens.length <= target) return tokens;
  let excess = tokens.length - target;
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (
      i > 0 &&
      excess > 0 &&
      SUBJECT_CONTINUATION_WORDS.has(tokens[i]) &&
      out.length > 0
    ) {
      out[out.length - 1] = `${out[out.length - 1]} ${tokens[i]}`;
      excess -= 1;
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}

/**
 * 괄호 안의 한글-공백-한글 패턴을 줄바꿈 artifact로 간주하고 공백을 제거한다.
 *   "사회(역사/도 덕포함)" → "사회(역사/도덕포함)"
 * 본문 prose 같은 경우("(사회적 거리유지 지도)") legit한 공백을 지울 위험이 있어
 * 교과명 같은 "복합 고유명사 성격 컬럼"에만 적용한다.
 */
function normalizeParenWrapSpaces(s: string): string {
  return s.replace(/\(([^()]*)\)/g, (_match, inner: string) => {
    let prev = "";
    let curr = inner;
    while (prev !== curr) {
      prev = curr;
      curr = curr.replace(/([가-힯])\s+([가-힯])/g, "$1$2");
    }
    return `(${curr})`;
  });
}

/**
 * 괄호 안의 공백은 토큰 분할에서 제외한다 (예: "사회(역사/도 덕포함)" → 1 토큰).
 */
function tokenizeRespectingParens(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const c of s) {
    if (c === "(") depth += 1;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (c === " " && depth === 0) {
      if (buf) out.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf) out.push(buf);
  return out;
}

type GradesCategory = "일반" | "진로 선택" | "체육·예술";

/**
 * 트리를 한 번 순회하며 "[N학년]" 헤딩과 "<진로 선택 과목>" / "<체육ㆍ예술>"
 * 마커를 컨텍스트로 유지한 채, 교과학습 테이블을 만날 때마다
 * (table, 현재 학년, 현재 구분) 삼중을 수집한다.
 *   - "[N학년]"          → 학년 갱신 + 구분은 "일반"으로 초기화 (새 학년은 항상 일반부터)
 *   - "<진로 선택 과목>"  → 구분 = "진로 선택"
 *   - "<체육ㆍ예술>"     → 구분 = "체육·예술"
 * 이로써 같은 학년·학기가 여러 번 등장해도 구분 값이 달라서 중복 라벨로 보이지 않는다.
 */
function collectGradesTablesWithYear(root: unknown): Array<{
  table: Record<string, unknown>;
  grade: string;
  category: GradesCategory;
}> {
  const out: Array<{
    table: Record<string, unknown>;
    grade: string;
    category: GradesCategory;
  }> = [];
  let currentGrade = "";
  let currentCategory: GradesCategory = "일반";

  const walk = (n: unknown) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;

    if (typeof o.content === "string") {
      const content = o.content;
      const g = content.match(/\[([123])학년\]/);
      if (g) {
        currentGrade = g[1];
        currentCategory = "일반";
      }
      if (/<\s*진로\s*선택\s*과목\s*>/.test(content)) currentCategory = "진로 선택";
      else if (/<\s*체육\s*ㆍ?\s*·?\s*예술\s*>/.test(content))
        currentCategory = "체육·예술";
    }

    const type = typeof o.type === "string" ? o.type : "";
    if (type === "table") {
      const header = tableHeaderText(o).replace(/\s+/g, "");
      if (/학기.*교과.*과목.*단위수/.test(header)) {
        out.push({ table: o, grade: currentGrade, category: currentCategory });
      }
    }

    for (const k of ["kids", "children", "list items", "rows", "cells"]) {
      if (o[k]) walk(o[k]);
    }
  };

  walk(root);
  return out;
}

export function parseStudentRecord(json: unknown): StudentRecord {
  const lines = linesFromJson(json);
  const warnings: string[] = [];
  if (lines.length === 0) warnings.push("본문 텍스트를 추출하지 못했습니다.");

  const pageCount = (() => {
    if (json && typeof json === "object") {
      const p = (json as { pageCount?: unknown }).pageCount;
      if (typeof p === "number") return p;
    }
    return undefined;
  })();

  const meta = extractMeta(lines, pageCount);
  const buckets = recoverAttendanceRows(
    redistributeSections1to3(splitIntoBuckets(lines))
  );
  const sections = buildSections(buckets);

  // opendataloader-pdf 트리에서 교과학습 테이블을 구조 기반으로 추출해 덮어쓰기
  const isOpendataloader =
    json &&
    typeof json === "object" &&
    ("file name" in json || Array.isArray((json as { kids?: unknown }).kids));
  if (isOpendataloader) {
    const gradesTable = extractOpendataloaderGrades(json);
    if (gradesTable) {
      const gradesSection = sections.find((s) => s.id === "grades");
      if (gradesSection) {
        // 교과학습 테이블만 opendataloader 구조 결과로 교체하고,
        // buildSections가 만든 뒤쪽 테이블(세특 등)은 보존한다.
        const existing = gradesSection.tables ?? [];
        gradesSection.tables = [gradesTable, ...existing.slice(1)];
      }
    }
  }

  const recognised = new Set(sections.map((s) => s.id));
  if (!recognised.has("personal")) warnings.push("인적·학적사항 섹션을 찾지 못했습니다.");
  if (!recognised.has("grades")) warnings.push("교과학습발달상황 섹션을 찾지 못했습니다.");

  return { meta, sections, warnings };
}
