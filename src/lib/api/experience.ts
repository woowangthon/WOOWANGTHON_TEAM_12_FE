// 활동 · 경험 조회 — ETC docs/contracts/experience-api.md
// MOCK(timeline-activities): 지금은 BE 대신 src/lib/mock/activities.ts 를 돌려준다. FE#7 에서 fetch 로 바꾸고 이 마커를 뺀다

import { MOCK_ACTIVITIES } from "@/lib/mock/activities";
import type { ActivityDetail, ActivitySummary } from "./types";

/** 화면 확인용 — 주소에 `?mock=empty` · `?mock=error` 를 붙이면 빈 타임라인 · 불러오기 실패를 본다 */
export type MockMode = "empty" | "error" | null;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** GET /api/activities — period.start 오름차순, start 가 null 이면 맨 뒤 */
export async function fetchActivities(mock: MockMode = null): Promise<ActivitySummary[]> {
  if (mock === "error") throw new ApiError("MOCK_ERROR", "불러오기 실패 화면 확인용");
  if (mock === "empty") return [];
  return MOCK_ACTIVITIES.map(({ experiences, ...a }) => ({ ...a, experienceCount: experiences.length })).sort(
    (a, b) => {
      if (a.period.start == null) return b.period.start == null ? 0 : 1;
      if (b.period.start == null) return -1;
      return a.period.start.localeCompare(b.period.start);
    },
  );
}

/** GET /api/activities/{activityId} */
export async function fetchActivity(id: number): Promise<ActivityDetail> {
  const found = MOCK_ACTIVITIES.find((a) => a.id === id);
  if (!found) throw new ApiError("ACTIVITY_NOT_FOUND", `활동 ${id} 이 없습니다`);
  return structuredClone(found);
}
