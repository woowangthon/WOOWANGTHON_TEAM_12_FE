// 목표 글자 수(S-77) — 문항 글의 「500자」를 코드로 읽는다(LLM 을 부르지 않는다). 범위는 question-api PATCH 와 같다
export const MIN_TARGET_LENGTH = 100;
export const MAX_TARGET_LENGTH = 5000;

// 「500자」 「1,000자 이내」 「최대 700 자」 「(공백 포함 500자)」 — 「3자리」 같은 말은 뺀다
const LENGTH = /(\d{1,2},\d{3}|\d{2,5})\s*자(?!리)/g;

/** 문항 글에서 처음 나오는 100 ~ 5000 사이의 「N자」. 없으면 null */
export function targetLengthFromText(text: string): number | null {
  for (const match of text.matchAll(LENGTH)) {
    const value = Number(match[1].replace(",", ""));
    if (value >= MIN_TARGET_LENGTH && value <= MAX_TARGET_LENGTH) return value;
  }
  return null;
}

export function isTargetLength(value: number) {
  return Number.isInteger(value) && value >= MIN_TARGET_LENGTH && value <= MAX_TARGET_LENGTH;
}

// 한 번 미리 채운 문항은 다시 채우지 않는다 — 사용자가 지운 칸을 되살리지 않게(이 브라우저에만 남는다)
const PREFILLED = "target-length-prefilled";

export function wasPrefilled(questionId: number) {
  try {
    return (localStorage.getItem(PREFILLED) ?? "").split(",").includes(String(questionId));
  } catch {
    return false;
  }
}

export function markPrefilled(questionId: number) {
  try {
    const ids = (localStorage.getItem(PREFILLED) ?? "").split(",").filter(Boolean);
    if (!ids.includes(String(questionId))) localStorage.setItem(PREFILLED, [...ids, String(questionId)].slice(-500).join(","));
  } catch {
    // 저장소를 못 쓰면 다음에 또 채울 수 있다 — 사용자가 지운 칸이 다시 채워질 뿐 잘못된 값은 아니다
  }
}
