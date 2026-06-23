import seed from "./data/subjectCodeSeed.json";
import { normalizeSubjectName } from "./subjectCodeNorm";

/**
 * 앱 내장 기본 과목코드 시드. 설치 직후 매핑표가 비어 있지 않도록 최초 1회 주입한다.
 * 데이터는 [과목명, 과목코드] 쌍 배열(미사용 제외)이며, 매칭 키(normName)는 현재
 * 정규화 규칙으로 런타임에 계산해 PDF 과목명 매칭과 항상 일치시킨다.
 *
 * 재생성: node scripts/gen-subject-seed.mjs
 */
const pairs = seed as Array<[string, string]>;

export const DEFAULT_SUBJECT_CODE_COUNT = pairs.length;

export function defaultSubjectCodeEntries(): Array<{
  normName: string;
  subjectName: string;
  subjectCode: string;
}> {
  return pairs.map(([subjectName, subjectCode]) => ({
    normName: normalizeSubjectName(subjectName),
    subjectName,
    subjectCode,
  }));
}
