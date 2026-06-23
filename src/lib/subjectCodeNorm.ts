/**
 * 가운데점(interpunct)·불릿·점 변형들. 눈에는 같은 "·" 처럼 보여도 코드포인트가
 * 달라 매칭이 깨지므로 하나(U+00B7)로 통일한다.
 *   U+00B7 middle dot      U+0387 greek ano teleia   U+16EB runic
 *   U+2022 bullet          U+2023 triangular         U+2024 one dot leader
 *   U+2027 hyphenation pt  U+2219 bullet operator    U+22C5 dot operator
 *   U+30FB katakana mid    U+FF65 halfwidth katakana  U+318D hangul araea
 */
const DOT_VARIANTS =
  /[··᛫•‣․‧∙⋅・･ㆍ]/g;

/** 보이지 않는 문자(zero-width / word-joiner / BOM / soft hyphen) — 매칭을 깨므로 제거 */
const ZERO_WIDTH = /[​‌‍⁠﻿­]/g;

/**
 * 과목명 정규화 — 과목코드 매칭 키 생성. xlsx 등 무거운 의존성 없이 독립적으로
 * 쓸 수 있도록 분리한다(db 시드/내보내기 경로에서 import).
 *   - 유니코드 정규화(NFC)
 *   - 보이지 않는 문자 제거
 *   - 모든 가운데점 변형을 "·"(U+00B7)로 통일
 *   - 모든 공백 제거 (NBSP 등 포함, 예: "확률과 통계" ↔ "확률과통계")
 */
export function normalizeSubjectName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(DOT_VARIANTS, "·")
    .replace(/\s+/g, "")
    .trim();
}
