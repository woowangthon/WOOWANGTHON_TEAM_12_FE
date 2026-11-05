import type { ActivityDetail } from "./api/types";
import { monthNumber, spanOf } from "./period";

const historyKey = (userId?: number) => `chagok:last-activity:${process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "mock"}:${userId ?? "mock"}`;

export function rememberActivity(id: number, userId?: number) {
  try { sessionStorage.setItem(historyKey(userId), String(id)); } catch { /* 저장소가 막혀도 활동 열기는 계속한다. */ }
}
export function lastActivityId(userId?: number): number | null {
  try { const id = Number(sessionStorage.getItem(historyKey(userId))); return Number.isSafeInteger(id) && id > 0 ? id : null; }
  catch { return null; }
}

/** 지난 해 같은 달과 겹치는 활동. 월을 모르는 기간은 특정 달에 있었다고 추측하지 않는다. */
export function thisTimeLastYear(activities: ActivityDetail[], now: Date): ActivityDetail | null {
  const month = monthNumber(now) - 12;
  return activities.filter(a => a.experiences.length && a.period.start && a.period.start.length >= 7
    && (a.period.ongoing || !a.period.end || a.period.end.length >= 7))
    .filter(a => { const span = spanOf(a.period, monthNumber(now)); return span && span.start <= month && span.end >= month; })
    .sort((a, b) => b.period.start!.localeCompare(a.period.start!) || a.id - b.id)[0] ?? null;
}
