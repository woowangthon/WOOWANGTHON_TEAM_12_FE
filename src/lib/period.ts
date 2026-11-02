// 기간(period) → 타임라인 위치 · 글자. 월을 `연 * 12 + (월 - 1)` 하나의 정수(월 번호)로 바꿔 계산한다
// 계약: start · end 는 "YYYY" · "YYYY-MM" · "YYYY-MM-DD", 원본에 있는 만큼만 온다

import type { Period } from "@/lib/api/types";

export type Span = { start: number; end: number };

export function monthNumber(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/** 연도만 있으면 시작은 1월, 끝은 12월로 본다 */
function toMonth(value: string, asEnd: boolean): number {
  const [y, m] = value.split("-").map(Number);
  return y * 12 + (m ? m - 1 : asEnd ? 11 : 0);
}

/** 타임라인에 놓을 범위. 시작을 모르면 null — 「기간을 모르는 활동」으로 따로 둔다 */
export function spanOf(period: Period, now: number): Span | null {
  if (!period.start) return null;
  const start = toMonth(period.start, false);
  const end = period.end
    ? toMonth(period.end, true)
    : period.ongoing
      ? now
      : toMonth(period.start, true);
  return { start, end: Math.max(start, end) };
}

const dotted = (value: string) => value.replaceAll("-", ".");

export function periodText(period: Period): string {
  const { start, end, ongoing } = period;
  if (!start) return ongoing ? "진행 중 · 시작 모름" : "기간 모름";
  if (ongoing) return `${dotted(start)} – 진행 중`;
  if (!end || end === start) return dotted(start);
  return `${dotted(start)} – ${dotted(end)}`;
}

/** 「4개월」 · 「1년 2개월째」 */
export function durationText(period: Period, now: number): string {
  const span = spanOf(period, now);
  if (!span) return "";
  const months = span.end - span.start + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const text = years ? `${years}년${rest ? ` ${rest}개월` : ""}` : `${months}개월`;
  return period.ongoing ? `${text}째` : text;
}

/** 최근 연도부터 */
export function yearsOf(spans: Span[]): number[] {
  if (!spans.length) return [];
  const last = Math.max(...spans.map((s) => Math.floor(s.end / 12)));
  const first = Math.min(...spans.map((s) => Math.floor(s.start / 12)));
  const years: number[] = [];
  for (let y = last; y >= first; y--) years.push(y);
  return years;
}

/** 한 해에 걸친 활동 — 그해 시작한 것(시간 순)과 앞 해에서 이어진 것 */
export function groupYear<T>(year: number, items: { item: T; span: Span }[]) {
  const first = year * 12;
  const last = first + 11;
  const inYear = items
    .filter(({ span }) => span.start <= last && span.end >= first)
    .sort((a, b) => a.span.start - b.span.start);
  return {
    starts: inYear.filter(({ span }) => span.start >= first),
    continuing: inYear.filter(({ span }) => span.start < first),
  };
}
