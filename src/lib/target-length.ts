// 목표 글자 수(S-77) — 문항 글의 「500자」를 코드로 읽는다(LLM 을 부르지 않는다). 범위는 question-api PATCH 와 같다
export const MIN_TARGET_LENGTH = 100;
export const MAX_TARGET_LENGTH = 5000;

// 「500자」 「1,000자 이내」 「최대 700 자」 「(공백 포함 500자)」 — 「3자리」 같은 말은 뺀다
const LENGTH = /(\d{1,2},\d{3}|\d{2,5})\s*자(?!리)/g;

// 두 「N자」 사이가 이것뿐이면 한 범위다 — 「최소 500자, 최대 1,500자」 「500자 이상 1,500자 이내」 「500자~1,500자」(FE#617)
const RANGE_GAP = /^\s*(?:이상|부터|에서)?\s*[,~\-–]?\s*(?:최대)?\s*$/;
const valueOf = (raw: string) => Number(raw.replace(",", ""));

/** 문항 글에서 처음 나오는 100 ~ 5000 사이의 「N자」. 바로 뒤에 범위로 이어진 「N자」가 있으면 큰 쪽(최대 — FE#617). 없으면 null */
export function targetLengthFromText(text: string): number | null {
  const matches = [...text.matchAll(LENGTH)];
  for (const [i, match] of matches.entries()) {
    const value = valueOf(match[1]);
    if (!isTargetLength(value)) continue;
    const next = matches[i + 1];
    const upper = next && RANGE_GAP.test(text.slice(match.index + match[0].length, next.index)) ? valueOf(next[1]) : null;
    return upper !== null && isTargetLength(upper) ? Math.max(value, upper) : value;
  }
  return null;
}

// 문항 글 끝의 글자 수 표기 — 「(1000자)」 「(공백 포함 500자 이내)」 「[700자]」 「500자 이내」 「최대 1,000자.」
const NUM = String.raw`(\d{1,2},\d{3}|\d{2,5})`;
// 괄호 안 글은 통째로 잡아 targetLengthFromText 로 읽는다 — 「(최소 500자, 최대 1,500자)」의 처음 숫자만 잡지 않게(FE#617)
const TAIL_BRACKET = new RegExp(String.raw`\s*[(\[（［]([^()\[\]（）［］]*?${NUM}\s*자(?!리)[^()\[\]（）［］]*)[)\]）］]\s*[.。]?\s*$`);
const TAIL_PLAIN = new RegExp(String.raw`\s*[-–—·,:]?\s*(?:최대\s*)?${NUM}\s*자\s*(?:이내|내외|이하|미만|까지|정도)?\s*[.。]?\s*$`);

/** 문항 글 끝의 글자 수 표기를 떼어 목표 글자 수로(FE#508). 끝에 없으면 글은 그대로 두고, 글 안에 「N자」가 있으면 그 값을 목표로 */
export function splitTargetLength(text: string): { text: string; target: number | null } {
  for (const tail of [TAIL_BRACKET, TAIL_PLAIN]) {
    const match = text.match(tail);
    if (!match || match.index === undefined) continue;
    const value = tail === TAIL_BRACKET ? targetLengthFromText(match[1]) : valueOf(match[1]);
    const rest = text.slice(0, match.index).trimEnd();
    if (value !== null && isTargetLength(value) && rest) return { text: rest, target: value };
  }
  return { text, target: targetLengthFromText(text) };
}

/** 같은 문항인지 견주는 열쇠 — 공백 · 글자 수 표기를 뺀 글(FE#508) */
export const questionKey = (text: string) => splitTargetLength(text).text.replace(/\s+/g, "");

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
