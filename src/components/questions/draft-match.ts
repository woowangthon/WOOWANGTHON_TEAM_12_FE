// 답칸 한 화면 편집(S-79 · FE#283) — 표시 위치는 저장하지 않는다. 지금 글을 문장으로 나누고 초안 문장과 짝을 찾는다.
// 짝은 원래 쪽 · 지금 쪽 양쪽 닮음(2×공통 글자 순서 ÷ 두 길이 합)이 절반 이상인 것 — 가장 닮은 쌍부터 짓고 한 문장은 한 번만 짝이 된다

/** 지금 글의 한 문장 — [start, end) 는 앞뒤 공백을 뺀 자리 */
export type Piece = { start: number; end: number; text: string };

/** 초안 문장 하나의 짝 — 지금 글에서 [start, end) 자리. edited 는 원래 글과 다른가 */
export type Match = { index: number; start: number; end: number; text: string; edited: boolean };

export const MATCH_THRESHOLD = 0.5;

// 문장 끝 — . ! ? 뒤가 공백 · 글 끝이면(3.5 · example.com 은 끝이 아니다), 줄바꿈은 늘 끝
const END = /[.!?。…]+["'”’」』)]*(?=\s|$)|\n/g;

export function splitSentences(text: string): Piece[] {
  const pieces: Piece[] = [];
  let from = 0;
  const push = (to: number) => {
    let start = from, end = to;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) pieces.push({ start, end, text: text.slice(start, end) });
  };
  for (const m of text.matchAll(END)) {
    const to = m.index + m[0].length;
    push(to);
    from = to;
  }
  push(text.length);
  return pieces;
}

/** 공통 글자 순서 길이 — 공백은 빼고 센다 */
function lcs(a: string, b: string) {
  if (!a.length || !b.length) return 0;
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]);
      diag = up;
    }
  }
  return row[b.length];
}

const squash = (s: string) => s.replace(/\s+/g, "");

export function similarity(a: string, b: string) {
  const x = squash(a), y = squash(b);
  if (!x.length && !y.length) return 1;
  // 길이가 세 배 넘게 차이 나면 절반을 넘을 수 없다 — 계산을 건너뛴다
  if (Math.min(x.length, y.length) * 3 < Math.max(x.length, y.length)) return 0;
  return (2 * lcs(x, y)) / (x.length + y.length);
}

/**
 * originals 는 초안 문장 글(답한 빈칸은 답으로 채운 글) — null 이면 짝을 찾지 않는다(뺀 문장).
 * 초안 문장 하나가 마침표 여럿으로 쪼개지면 이어진 조각을 묶어 비교한다
 */
export function matchSentences(text: string, originals: (string | null)[]): Match[] {
  const pieces = splitSentences(text);
  type Pair = { index: number; from: number; to: number; score: number };
  const pairs: Pair[] = [];
  originals.forEach((original, index) => {
    if (original === null || !original.trim()) return;
    const span = Math.max(1, splitSentences(original).length);
    for (let from = 0; from + span <= pieces.length; from++) {
      const to = from + span - 1;
      const score = similarity(original, text.slice(pieces[from].start, pieces[to].end));
      if (score >= MATCH_THRESHOLD) pairs.push({ index, from, to, score });
    }
  });
  // 가장 닮은 쌍부터 — 같으면 앞쪽(같은 문장을 두 번 쓰면 앞이 짝)
  pairs.sort((a, b) => b.score - a.score || a.from - b.from || a.index - b.index);
  const usedIndex = new Set<number>();
  const usedPiece = new Set<number>();
  const matches: Match[] = [];
  for (const p of pairs) {
    if (usedIndex.has(p.index)) continue;
    let free = true;
    for (let k = p.from; k <= p.to; k++) if (usedPiece.has(k)) free = false;
    if (!free) continue;
    usedIndex.add(p.index);
    for (let k = p.from; k <= p.to; k++) usedPiece.add(k);
    const start = pieces[p.from].start, end = pieces[p.to].end;
    const now = text.slice(start, end);
    matches.push({ index: p.index, start, end, text: now, edited: squash(now) !== squash(originals[p.index]!) });
  }
  return matches.sort((a, b) => a.start - b.start);
}

/** 문장 속 숫자 — 순서와 상관없이 같은 숫자들인가(쉼표 자리 구분은 걷는다) */
export function sameNumbers(a: string, b: string) {
  const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map(n => n.replace(/,/g, "")).sort();
  const x = numbers(a), y = numbers(b);
  return x.length === y.length && x.every((n, i) => n === y[i]);
}

/** 바뀐 곳 — 앞 · 뒤 같은 부분을 걷어 낸 [start, end)(바뀌기 전 글 기준)와 들어간 글 */
export function diff(before: string, after: string) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < max - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start, end: before.length - tail, inserted: after.slice(start, after.length - tail) };
}
