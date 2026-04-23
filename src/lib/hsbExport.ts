import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { parseStudentRecord } from "./studentRecord";
import type { RecordSection, StructuredTable, StudentRecord } from "./studentRecord";
import { paths } from "./paths";

// -------------------------------------------------------------------------
// hsb.db3 schema (14 tables) — 컬럼 순서/타입은 원본 hsb.db3와 동일.
// MVP: PDF에서 추출 가능한 8개 테이블만 row를 채우고 나머지 6개는 빈 테이블.
// -------------------------------------------------------------------------

export const HSB_CREATE_STATEMENTS = [
  `CREATE TABLE PersonalInfo (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    CourseCode VARCHAR(5),
    SchoolClass VARCHAR(30),
    SchoolNumber INTEGER,
    Name VARCHAR(60),
    Specials TEXT,
    Term1_1 VARCHAR(180),
    Term1_2 VARCHAR(180),
    Term2_1 VARCHAR(180),
    Term2_2 VARCHAR(180),
    Term3_1 VARCHAR(180),
    Term3_2 VARCHAR(180),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber)
  )`,
  `CREATE TABLE StudentBaseInfo (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    CollegeAdmissionYear VARCHAR(4),
    SeleScCode VARCHAR(1),
    ApplicantScCode VARCHAR(1),
    GraduateYear VARCHAR(4),
    GraduateGrade VARCHAR(1),
    MasterSchoolYN VARCHAR(1),
    SpecializedSchoolYN VARCHAR(1),
    CorrectionRegisterYN VARCHAR(1),
    ExamNumber VARCHAR(30),
    UniqueFileName VARCHAR(100),
    PictureFileName VARCHAR(100),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber)
  )`,
  `CREATE TABLE AttendingSchool (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    StudyDayCount INTEGER,
    Absence_Disease INTEGER,
    Absence_Accident INTEGER,
    Absence_Etc INTEGER,
    Lateness_Disease INTEGER,
    Lateness_Accident INTEGER,
    Lateness_Etc INTEGER,
    EarlyLeaving_Disease INTEGER,
    EarlyLeaving_Accident INTEGER,
    EarlyLeaving_Etc INTEGER,
    Result_Disease INTEGER,
    Result_Accident INTEGER,
    Result_Etc INTEGER,
    Specials TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE CreativeExperActivity (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Subject VARCHAR(150),
    strDate VARCHAR(50),
    Specials TEXT,
    Specials2 TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE DetailAbility (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Content TEXT,
    Content2 TEXT,
    Content3 TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE ServiceActivity (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Season VARCHAR(60),
    Place VARCHAR(90),
    strTime VARCHAR(3),
    Content TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE SubjectScore (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    OrganizationCode VARCHAR(30),
    OrganizationName VARCHAR(90),
    CourceCode VARCHAR(3),
    CourceName VARCHAR(60),
    SubjectCode VARCHAR(30),
    SubjectName VARCHAR(150),
    Term INTEGER,
    Unit VARCHAR(10),
    Assessment VARCHAR(20),
    Rank VARCHAR(4),
    SameRank VARCHAR(4),
    StudentCount VARCHAR(4),
    OriginalScore VARCHAR(4),
    AvgScore VARCHAR(5),
    StandardDeviation VARCHAR(4),
    RankingGrade VARCHAR(20),
    RankingGradeCode VARCHAR(20),
    Achievement VARCHAR(20),
    AchievementCode VARCHAR(20),
    AchievementRatio VARCHAR(600),
    SubjectSeparationCode VARCHAR(2),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE TeacherComment (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Content TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  // 이하 6개는 PDF에서 추출하지 않으나 스키마 호환을 위해 빈 테이블로 생성.
  `CREATE TABLE CorrectionList (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    ChangeYear VARCHAR(4),
    ChangeDate VARCHAR(8),
    StudentInfo VARCHAR(150),
    Name VARCHAR(100),
    ChangeItemDescription TEXT,
    MistakeDescription TEXT,
    ChangeDescription TEXT,
    ChangeReason TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE LastYearScore (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Term INTEGER,
    TotalScore VARCHAR(4),
    AvgScore VARCHAR(6),
    ClassGrade VARCHAR(4),
    ClassStudentNum VARCHAR(4),
    TotalGrade VARCHAR(4),
    TotalStudentNum VARCHAR(4),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE NCSComptSittn (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Grade INTEGER,
    Term INTEGER,
    DclsfNm VARCHAR(150),
    AbltyUnitCode VARCHAR(50),
    AbltyUnitNm VARCHAR(150),
    WklvlSbjtCode VARCHAR(50),
    WklvlSbjtNm VARCHAR(150),
    strDate VARCHAR(50),
    OriginalScore VARCHAR(4),
    Achievement VARCHAR(20),
    AchievementCode VARCHAR(20),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE OrganizationList (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    Year VARCHAR(4),
    Term INTEGER,
    DayNightCode VARCHAR(1),
    DayNightName VARCHAR(100),
    TrackCode VARCHAR(2),
    TrackName VARCHAR(200),
    Grade INTEGER,
    CourseCode VARCHAR(5),
    CourseName VARCHAR(200),
    OrganizationCode VARCHAR(30),
    OrganizationName VARCHAR(90),
    SubjectCode VARCHAR(30),
    SubjectName VARCHAR(150),
    LessonTime INTEGER,
    Unit VARCHAR(10),
    CooperationCourseInfo VARCHAR(100),
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
  `CREATE TABLE SchoolViolence (
    IpsiYear TEXT NOT NULL,
    IpsiGubun TEXT NOT NULL,
    SocialNumber_Enc TEXT NOT NULL,
    SocialNumber_Hash TEXT NOT NULL,
    SchoolCode TEXT NOT NULL,
    SeqNumber INTEGER NOT NULL,
    Year TEXT,
    Grade TEXT,
    strDate INTEGER,
    Content TEXT,
    RegID TEXT,
    RegIP TEXT,
    RegTime REAL
  )`,
  `CREATE TABLE StudyHistory (
    Mogib1 VARCHAR(10),
    Mogib2 VARCHAR(60),
    IdentifyNumber VARCHAR(10),
    SeqNumber INTEGER,
    SocialNumber VARCHAR(13),
    SchoolCode VARCHAR(10),
    StudyCode VARCHAR(2),
    StudyCodeName VARCHAR(200),
    strDate VARCHAR(8),
    Description TEXT,
    PRIMARY KEY (Mogib1, Mogib2, IdentifyNumber, SeqNumber)
  )`,
];

export const HSB_TABLE_NAMES = [
  "PersonalInfo",
  "StudentBaseInfo",
  "AttendingSchool",
  "CreativeExperActivity",
  "DetailAbility",
  "ServiceActivity",
  "SubjectScore",
  "TeacherComment",
  "CorrectionList",
  "LastYearScore",
  "NCSComptSittn",
  "OrganizationList",
  "SchoolViolence",
  "StudyHistory",
] as const;
export type HsbTableName = (typeof HSB_TABLE_NAMES)[number];

// -------------------------------------------------------------------------
// 학생 단위 매핑 (StudentRecord → 테이블 row 배열)
// -------------------------------------------------------------------------

export interface StudentExportInput {
  /** compass DB job ID — 참조용 */
  jobId: string;
  /** PDF 원본 파일명 — SocialNumber 에 확장자 제거 후 저장 */
  originalName: string;
  /** 파싱된 학생부 JSON (opendataloader-pdf 또는 pdfjs fallback) */
  recordJson: unknown;
}

export interface ExportOptions {
  mogib1: string;
  mogib2: string;
}

interface StudentContext {
  mogib1: string;
  mogib2: string;
  identifyNumber: string;
  socialNumber: string;
  record: StudentRecord;
  input: StudentExportInput;
}

function sectionById(
  sections: RecordSection[],
  id: RecordSection["id"]
): RecordSection | undefined {
  return sections.find((s) => s.id === id);
}

function tableByPrimarySection(
  sections: RecordSection[],
  id: RecordSection["id"],
  index = 0
): StructuredTable | undefined {
  const s = sectionById(sections, id);
  return s?.tables?.[index];
}

function intOrNull(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/**
 * 인적·학적사항 섹션의 원문에서 "주민등록번호" 13자리를 추출.
 * - 완전한 13자리가 확인될 때만 반환 (하이픈/공백 허용, 결과는 하이픈 제거).
 * - 뒷자리가 별표(*)나 블라인드 문자로 가려졌으면 null 반환해 파일명으로 폴백.
 */
function extractSocialNumber(record: StudentRecord): string | null {
  const personal = record.sections.find((s) => s.id === "personal");
  if (!personal) return null;
  const haystack = personal.text;
  // 앞 6자리 + (하이픈 또는 공백) + 뒤 7자리 패턴을 탐색.
  const re =
    /주민(?:등록)?번호[\s:：]*([0-9]{6})\s*[-‑ㅡ\s]?\s*([0-9]{7})/;
  const m = haystack.match(re);
  if (!m) return null;
  const joined = `${m[1]}${m[2]}`;
  if (joined.length !== 13) return null;
  return joined;
}

/**
 * "79/63.1(18.3)" → { original: "79", avg: "63.1", stdDev: "18.3" }
 * "67/68.2"       → { original: "67", avg: "68.2", stdDev: "" }
 * "P"             → { original: "P", avg: "P", stdDev: "" }
 */
function parseScoreAvg(v: string): {
  original: string;
  avg: string;
  stdDev: string;
} {
  if (!v) return { original: "", avg: "", stdDev: "" };
  if (v === "P") return { original: "P", avg: "P", stdDev: "" };
  const m = v.match(/^([^/]+)\/([^(]+)(?:\(([^)]+)\))?$/);
  if (!m) return { original: v, avg: "", stdDev: "" };
  return {
    original: m[1].trim(),
    avg: m[2].trim(),
    stdDev: (m[3] ?? "").trim(),
  };
}

/**
 * "A(290)" → { achievement: "A", studentCount: "290" }
 */
function parseAchievement(v: string): { achievement: string; studentCount: string } {
  if (!v) return { achievement: "", studentCount: "" };
  if (v === "P") return { achievement: "P", studentCount: "" };
  const m = v.match(/^([A-Z])\((\d+)\)$/);
  if (!m) return { achievement: v, studentCount: "" };
  return { achievement: m[1], studentCount: m[2] };
}

// -------------------------------------------------------------------------
// 각 테이블 row builder
// -------------------------------------------------------------------------

interface PersonalInfoRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SocialNumber: string;
  SchoolCode: string;
  CourseCode: string;
  SchoolClass: string;
  SchoolNumber: number | null;
  Name: string;
  Specials: string;
  Term1_1: string;
  Term1_2: string;
  Term2_1: string;
  Term2_2: string;
  Term3_1: string;
  Term3_2: string;
}

function buildPersonalInfo(ctx: StudentContext): PersonalInfoRow {
  const meta = ctx.record.meta;
  return {
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    CourseCode: "",
    SchoolClass: meta.classNo ?? "",
    SchoolNumber: intOrNull(meta.studentNo),
    Name: meta.name ?? "",
    Specials: sectionById(ctx.record.sections, "personal")?.text.slice(0, 2000) ?? "",
    Term1_1: "",
    Term1_2: "",
    Term2_1: "",
    Term2_2: "",
    Term3_1: "",
    Term3_2: "",
  };
}

interface StudentBaseInfoRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SocialNumber: string;
  SchoolCode: string;
  CollegeAdmissionYear: string;
  SeleScCode: string;
  ApplicantScCode: string;
  GraduateYear: string;
  GraduateGrade: string;
  MasterSchoolYN: string;
  SpecializedSchoolYN: string;
  CorrectionRegisterYN: string;
  ExamNumber: string;
  UniqueFileName: string;
  PictureFileName: string;
}

function buildStudentBaseInfo(ctx: StudentContext): StudentBaseInfoRow {
  return {
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    CollegeAdmissionYear: "",
    SeleScCode: "",
    ApplicantScCode: "",
    GraduateYear: "",
    GraduateGrade: "",
    MasterSchoolYN: "",
    SpecializedSchoolYN: "",
    CorrectionRegisterYN: "",
    ExamNumber: ctx.socialNumber,
    UniqueFileName: ctx.input.originalName,
    PictureFileName: "",
  };
}

interface AttendingSchoolRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  StudyDayCount: number | null;
  Absence_Disease: number | null;
  Absence_Accident: number | null;
  Absence_Etc: number | null;
  Lateness_Disease: number | null;
  Lateness_Accident: number | null;
  Lateness_Etc: number | null;
  EarlyLeaving_Disease: number | null;
  EarlyLeaving_Accident: number | null;
  EarlyLeaving_Etc: number | null;
  Result_Disease: number | null;
  Result_Accident: number | null;
  Result_Etc: number | null;
  Specials: string;
}

function buildAttendingSchool(ctx: StudentContext): AttendingSchoolRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "attendance");
  if (!t) return [];
  return t.rows.map((r, i) => ({
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SeqNumber: i + 1,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    Year: "",
    Grade: intOrNull(r["학년"]),
    StudyDayCount: intOrNull(r["수업일수"]),
    Absence_Disease: intOrNull(r["결석-질병"]),
    Absence_Accident: intOrNull(r["결석-미인정"]),
    Absence_Etc: intOrNull(r["결석-기타"]),
    Lateness_Disease: intOrNull(r["지각-질병"]),
    Lateness_Accident: intOrNull(r["지각-미인정"]),
    Lateness_Etc: intOrNull(r["지각-기타"]),
    EarlyLeaving_Disease: intOrNull(r["조퇴-질병"]),
    EarlyLeaving_Accident: intOrNull(r["조퇴-미인정"]),
    EarlyLeaving_Etc: intOrNull(r["조퇴-기타"]),
    Result_Disease: intOrNull(r["결과-질병"]),
    Result_Accident: intOrNull(r["결과-미인정"]),
    Result_Etc: intOrNull(r["결과-기타"]),
    Specials: r["특기사항"] ?? "",
  }));
}

interface CreativeExperActivityRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  Subject: string;
  strDate: string;
  Specials: string;
  Specials2: string;
}

function buildCreativeExperActivity(ctx: StudentContext): CreativeExperActivityRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "activities", 0);
  if (!t) return [];
  return t.rows.map((r, i) => ({
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SeqNumber: i + 1,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    Year: "",
    Grade: intOrNull(r["학년"]),
    Subject: r["영역"] ?? "",
    strDate: r["시간"] ?? "",
    Specials: r["특기사항"] ?? "",
    Specials2: "",
  }));
}

interface ServiceActivityRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  Season: string;
  Place: string;
  strTime: string;
  Content: string;
}

function buildServiceActivity(ctx: StudentContext): ServiceActivityRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "activities", 1);
  if (!t) return [];
  return t.rows.map((r, i) => ({
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SeqNumber: i + 1,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    Year: "",
    Grade: intOrNull(r["학년"]),
    Season: r["일자/기간"] ?? "",
    Place: r["장소/주관기관"] ?? "",
    strTime: r["시간"] ?? "",
    Content: r["활동내용"] ?? "",
  }));
}

interface SubjectScoreRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  OrganizationCode: string;
  OrganizationName: string;
  CourceCode: string;
  CourceName: string;
  SubjectCode: string;
  SubjectName: string;
  Term: number | null;
  Unit: string;
  Assessment: string;
  Rank: string;
  SameRank: string;
  StudentCount: string;
  OriginalScore: string;
  AvgScore: string;
  StandardDeviation: string;
  RankingGrade: string;
  RankingGradeCode: string;
  Achievement: string;
  AchievementCode: string;
  AchievementRatio: string;
  SubjectSeparationCode: string;
}

function buildSubjectScore(ctx: StudentContext): SubjectScoreRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "grades", 0);
  if (!t) return [];
  return t.rows.map((r, i) => {
    const sa = parseScoreAvg(r["원점수/평균(편차)"] ?? "");
    const ach = parseAchievement(r["성취도(수강자)"] ?? "");
    return {
      Mogib1: ctx.mogib1,
      Mogib2: ctx.mogib2,
      IdentifyNumber: ctx.identifyNumber,
      SeqNumber: i + 1,
      SocialNumber: ctx.socialNumber,
      SchoolCode: "",
      Year: "",
      Grade: intOrNull(r["학년"]),
      OrganizationCode: "",
      OrganizationName: r["교과"] ?? "",
      CourceCode: "",
      CourceName: "",
      SubjectCode: "",
      SubjectName: r["과목"] ?? "",
      Term: intOrNull(r["학기"]),
      Unit: r["단위수"] ?? "",
      Assessment: r["성취도(수강자)"] ?? "",
      Rank: "",
      SameRank: "",
      StudentCount: ach.studentCount,
      OriginalScore: sa.original,
      AvgScore: sa.avg,
      StandardDeviation: sa.stdDev,
      RankingGrade: r["석차등급"] ?? "",
      RankingGradeCode: "",
      Achievement: ach.achievement,
      AchievementCode: "",
      AchievementRatio: r["성취도별 분포비율"] ?? "",
      SubjectSeparationCode: r["구분"] === "진로 선택" ? "Q" : r["구분"] === "체육·예술" ? "A" : "",
    };
  });
}

interface DetailAbilityRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  Content: string;
  Content2: string;
  Content3: string;
}

/**
 * 세특(세부능력및특기사항) — parseSpecialNotesTable는 (학년, 학기, 과목, 내용) row를 돌려준다.
 * 학년별로 묶어 한 row로 만들고 Content에 "과목: 내용\n\n..." 형식으로 결합한다.
 */
function buildDetailAbility(ctx: StudentContext): DetailAbilityRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "grades", 1);
  if (!t) return [];
  const byGrade = new Map<string, string[]>();
  for (const r of t.rows) {
    const grade = r["학년"] ?? "";
    const subject = r["과목"] ?? "";
    const content = r["내용"] ?? "";
    const line = subject ? `${subject}: ${content}` : content;
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade)!.push(line);
  }
  const grades = Array.from(byGrade.keys()).sort();
  return grades.map((grade, i) => ({
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SeqNumber: i + 1,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    Year: "",
    Grade: intOrNull(grade),
    Content: byGrade.get(grade)!.join("\n\n"),
    Content2: "",
    Content3: "",
  }));
}

interface TeacherCommentRow {
  Mogib1: string;
  Mogib2: string;
  IdentifyNumber: string;
  SeqNumber: number;
  SocialNumber: string;
  SchoolCode: string;
  Year: string;
  Grade: number | null;
  Content: string;
}

function buildTeacherComment(ctx: StudentContext): TeacherCommentRow[] {
  const t = tableByPrimarySection(ctx.record.sections, "behavior");
  if (!t) return [];
  return t.rows.map((r, i) => ({
    Mogib1: ctx.mogib1,
    Mogib2: ctx.mogib2,
    IdentifyNumber: ctx.identifyNumber,
    SeqNumber: i + 1,
    SocialNumber: ctx.socialNumber,
    SchoolCode: "",
    Year: "",
    Grade: intOrNull(r["학년"]),
    Content: r["내용"] ?? "",
  }));
}

// -------------------------------------------------------------------------
// 파일 단위 빌더
// -------------------------------------------------------------------------

export interface StudentExportResult {
  jobId: string;
  originalName: string;
  identifyNumber: string;
  socialNumber: string;
  studentName: string;
  tables: {
    [K in HsbTableName]?: number;
  };
}

export interface ExportBuildResult {
  filePath: string;
  fileName: string;
  totalStudents: number;
  tableCounts: Record<HsbTableName, number>;
  students: StudentExportResult[];
  warnings: string[];
}

/**
 * 고유 파일명 생성 — 중복 방지: 초 단위 timestamp + 필요 시 접미사.
 * 예: hsb_2026-04-23_153045.db3
 */
export function generateExportFileName(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `hsb_${y}-${m}-${d}_${hh}${mm}${ss}.db3`;
}

export function ensureExportsDir(): string {
  const dir = path.join(paths.dataDir, "exports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function exportFilePath(fileName: string): string {
  return path.join(ensureExportsDir(), fileName);
}

const BUILDERS: {
  [K in HsbTableName]?: (ctx: StudentContext) => unknown | unknown[];
} = {
  PersonalInfo: (c) => buildPersonalInfo(c),
  StudentBaseInfo: (c) => buildStudentBaseInfo(c),
  AttendingSchool: (c) => buildAttendingSchool(c),
  CreativeExperActivity: (c) => buildCreativeExperActivity(c),
  DetailAbility: (c) => buildDetailAbility(c),
  ServiceActivity: (c) => buildServiceActivity(c),
  SubjectScore: (c) => buildSubjectScore(c),
  TeacherComment: (c) => buildTeacherComment(c),
};

/**
 * 여러 학생의 StudentRecord → 새 SQLite db3 파일로 저장. 파일을 실제로 디스크에 만든다.
 */
export function buildHsbDb(
  inputs: StudentExportInput[],
  options: ExportOptions,
  fileName: string
): ExportBuildResult {
  const filePath = exportFilePath(fileName);
  if (fs.existsSync(filePath)) {
    // generateExportFileName이 중복을 만들 가능성은 낮지만 방어적으로 덮어쓰기 방지.
    throw new Error(`Export file already exists: ${fileName}`);
  }
  const db = new Database(filePath);
  db.pragma("journal_mode = DELETE");
  for (const stmt of HSB_CREATE_STATEMENTS) db.exec(stmt);

  const warnings: string[] = [];
  const studentsResult: StudentExportResult[] = [];
  const tableCounts: Record<HsbTableName, number> = Object.fromEntries(
    HSB_TABLE_NAMES.map((t) => [t, 0])
  ) as Record<HsbTableName, number>;

  const insertStmtCache = new Map<HsbTableName, Database.Statement>();
  const getInsertStmt = (table: HsbTableName, sample: Record<string, unknown>) => {
    if (insertStmtCache.has(table)) return insertStmtCache.get(table)!;
    const cols = Object.keys(sample);
    const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols
      .map((c) => `@${c}`)
      .join(",")})`;
    const stmt = db.prepare(sql);
    insertStmtCache.set(table, stmt);
    return stmt;
  };

  const coerce = (v: unknown): unknown => {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  };

  const insertRow = (table: HsbTableName, row: Record<string, unknown>) => {
    const stmt = getInsertStmt(table, row);
    const coerced: Record<string, unknown> = {};
    for (const k of Object.keys(row)) coerced[k] = coerce(row[k]);
    stmt.run(coerced);
    tableCounts[table] += 1;
  };

  const tx = db.transaction((items: StudentExportInput[]) => {
    for (let idx = 0; idx < items.length; idx += 1) {
      const input = items[idx];
      const baseName = stripPdfExt(input.originalName);
      // IdentifyNumber는 수험번호 기반 식별이므로 파일명(확장자 제외)로 통일.
      const identifyNumber = baseName;
      let record: StudentRecord;
      try {
        record = parseStudentRecord(input.recordJson);
      } catch (err) {
        warnings.push(
          `${input.originalName}: 파싱 실패 — ${(err as Error).message ?? String(err)}`
        );
        continue;
      }
      // SocialNumber: PDF에서 주민등록번호 13자리를 추출했으면 그대로, 블라인드
      // 처리되어 추출 불가하면 파일명으로 폴백.
      const socialNumber = extractSocialNumber(record) ?? baseName;
      const ctx: StudentContext = {
        mogib1: options.mogib1,
        mogib2: options.mogib2,
        identifyNumber,
        socialNumber,
        record,
        input,
      };

      const before: Record<HsbTableName, number> = Object.fromEntries(
        HSB_TABLE_NAMES.map((t) => [t, tableCounts[t]])
      ) as Record<HsbTableName, number>;

      for (const [tableName, builder] of Object.entries(BUILDERS) as Array<
        [HsbTableName, (c: StudentContext) => unknown | unknown[]]
      >) {
        const built = builder(ctx);
        if (Array.isArray(built)) {
          for (const r of built)
            insertRow(tableName, r as Record<string, unknown>);
        } else if (built && typeof built === "object") {
          insertRow(tableName, built as Record<string, unknown>);
        }
      }

      const perStudentCounts = Object.fromEntries(
        HSB_TABLE_NAMES.map((t) => [t, tableCounts[t] - before[t]])
      ) as Record<HsbTableName, number>;

      studentsResult.push({
        jobId: input.jobId,
        originalName: input.originalName,
        identifyNumber,
        socialNumber,
        studentName: record.meta.name ?? "",
        tables: perStudentCounts,
      });

      for (const w of record.warnings)
        warnings.push(`${input.originalName}: ${w}`);
    }
  });

  try {
    tx(inputs);
  } finally {
    db.close();
  }

  return {
    filePath,
    fileName,
    totalStudents: inputs.length,
    tableCounts,
    students: studentsResult,
    warnings,
  };
}

// -------------------------------------------------------------------------
// 읽기 전용 조회 — 미리보기/상세 뷰용
// -------------------------------------------------------------------------

export interface TablePreview {
  name: HsbTableName;
  rowCount: number;
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
}

export function previewHsbDb(filePath: string, sampleLimit = 5): TablePreview[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Export file not found: ${filePath}`);
  }
  const db = new Database(filePath, { readonly: true });
  const out: TablePreview[] = [];
  try {
    for (const name of HSB_TABLE_NAMES) {
      const countRow = db
        .prepare(`SELECT COUNT(*) as c FROM ${name}`)
        .get() as { c: number };
      const cols = (db
        .prepare(`PRAGMA table_info(${name})`)
        .all() as Array<{ name: string }>).map((c) => c.name);
      const rows = db
        .prepare(`SELECT * FROM ${name} LIMIT ?`)
        .all(sampleLimit) as Array<Record<string, unknown>>;
      out.push({ name, rowCount: countRow.c, columns: cols, sampleRows: rows });
    }
  } finally {
    db.close();
  }
  return out;
}

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function readTableInfo(db: Database.Database, table: HsbTableName): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

export function queryHsbTable(
  filePath: string,
  table: HsbTableName,
  limit = 100,
  offset = 0
): {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
  primaryKey: string[];
  columnTypes: Record<string, string>;
} {
  if (!HSB_TABLE_NAMES.includes(table)) {
    throw new Error(`Unknown table: ${table}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Export file not found: ${filePath}`);
  }
  const db = new Database(filePath, { readonly: true });
  try {
    const info = readTableInfo(db, table);
    const cols = info.map((c) => c.name);
    const total = (db
      .prepare(`SELECT COUNT(*) as c FROM ${table}`)
      .get() as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`)
      .all(limit, offset) as Array<Record<string, unknown>>;
    const primaryKey = info
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    const columnTypes: Record<string, string> = {};
    for (const c of info) columnTypes[c.name] = c.type;
    return { columns: cols, rows, total, primaryKey, columnTypes };
  } finally {
    db.close();
  }
}

/**
 * 단일 셀 UPDATE. pkValues 는 행을 식별할 모든 PK 컬럼 값 묶음이어야 한다.
 * PK 컬럼 자체는 수정 불가 (WHERE 가 깨질 수 있어 위험).
 */
export function updateHsbCell(
  filePath: string,
  table: HsbTableName,
  pkValues: Record<string, unknown>,
  column: string,
  newValue: unknown
): { ok: true; updatedRow: Record<string, unknown> } {
  if (!HSB_TABLE_NAMES.includes(table)) {
    throw new Error(`Unknown table: ${table}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Export file not found: ${filePath}`);
  }

  const db = new Database(filePath);
  try {
    const info = readTableInfo(db, table);
    const colNames = new Set(info.map((c) => c.name));
    if (!colNames.has(column)) {
      throw new Error(`Unknown column: ${column}`);
    }

    const pkCols = info
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);

    if (pkCols.length === 0) {
      throw new Error(`Table ${table} has no primary key — cannot safely update`);
    }
    if (pkCols.includes(column)) {
      throw new Error(`Cannot edit primary key column: ${column}`);
    }
    for (const pk of pkCols) {
      if (!(pk in pkValues)) {
        throw new Error(`Missing primary key value: ${pk}`);
      }
    }

    // 컬럼 타입에 따라 값 정규화 — 빈 문자열은 INTEGER 컬럼에서 NULL 로.
    const colInfo = info.find((c) => c.name === column)!;
    const coerced = coerceValueForColumn(newValue, colInfo);

    const setClause = `"${column}" = ?`;
    const whereClause = pkCols.map((c) => `"${c}" = ?`).join(" AND ");
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`
    );
    const result = stmt.run(coerced, ...pkCols.map((c) => pkValues[c] as never));
    if (result.changes !== 1) {
      throw new Error(
        `UPDATE affected ${result.changes} rows (expected 1) — primary key may not match`
      );
    }

    const selectCols = info.map((c) => `"${c.name}"`).join(", ");
    const updatedRow = db
      .prepare(
        `SELECT ${selectCols} FROM ${table} WHERE ${whereClause} LIMIT 1`
      )
      .get(...pkCols.map((c) => pkValues[c] as never)) as Record<string, unknown>;

    return { ok: true, updatedRow };
  } finally {
    db.close();
  }
}

function coerceValueForColumn(value: unknown, col: ColumnInfo): unknown {
  if (value === null || value === undefined) {
    return col.notnull ? "" : null;
  }
  const t = col.type.toUpperCase();
  if (typeof value === "string") {
    if (value === "" && !col.notnull) return null;
    if (/INT/.test(t)) {
      if (value === "") return col.notnull ? 0 : null;
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`'${value}' is not a valid integer for ${col.name}`);
      }
      return Math.trunc(n);
    }
    if (/REAL|FLOA|DOUB|NUM/.test(t)) {
      if (value === "") return col.notnull ? 0 : null;
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`'${value}' is not a valid number for ${col.name}`);
      }
      return n;
    }
    return value;
  }
  return value;
}
