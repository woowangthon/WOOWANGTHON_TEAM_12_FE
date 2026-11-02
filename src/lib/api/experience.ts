// 자료 넣기 · 분석 작업 · 활동 · 경험 — ETC docs/contracts/experience-api.md
// MOCK(timeline-activities): 활동 조회는 지금 BE 대신 src/lib/mock/activities.ts 를 돌려준다. FE#7 에서 fetch 로 바꾸고 이 마커를 뺀다
// MOCK(source-analysis): 자료 넣기 · 작업 조회 · 다시 시도는 지금 src/lib/mock/analysis.ts 로 돈다. FE#7 에서 fetch 로 바꾸고 이 마커를 뺀다

import { MOCK_ACTIVITIES } from "@/lib/mock/activities";
import { mockAddedActivities, mockFetchJob, mockRetryJob, mockSubmitSource } from "@/lib/mock/analysis";
import { ApiError } from "./errors";
import type { ActivityDetail, ActivitySummary, Job, SourceRequest } from "./types";

export { ApiError };

/** 화면 확인용 — 주소에 `?mock=empty` · `?mock=error` 를 붙이면 빈 타임라인(목 분석으로 더한 활동만) · 불러오기 실패를 본다 */
export type MockMode = "empty" | "error" | null;

/** 화면 확인용 — 주소에 `?analysis=fail` · `?analysis=empty` 를 붙이면 자료를 넣었을 때 분석 실패 · 활동 0개로 끝난다 */
export type MockAnalysis = "fail" | "empty" | null;

const allActivities = () => [...MOCK_ACTIVITIES, ...mockAddedActivities()];

/** GET /api/activities — period.start 오름차순, start 가 null 이면 맨 뒤 */
export async function fetchActivities(mock: MockMode = null): Promise<ActivitySummary[]> {
  if (mock === "error") throw new ApiError("MOCK_ERROR", "불러오기 실패 화면 확인용");
  const source = mock === "empty" ? mockAddedActivities() : allActivities();
  return source
    .map(({ experiences, ...a }) => ({ ...a, experienceCount: experiences.length }))
    .sort((a, b) => {
      if (a.period.start == null) return b.period.start == null ? 0 : 1;
      if (b.period.start == null) return -1;
      return a.period.start.localeCompare(b.period.start);
    });
}

/** GET /api/activities/{activityId} */
export async function fetchActivity(id: number): Promise<ActivityDetail> {
  const found = allActivities().find((a) => a.id === id);
  if (!found) throw new ApiError("ACTIVITY_NOT_FOUND", `활동 ${id} 이 없습니다`);
  return structuredClone(found);
}

/** POST /api/sources — 원본을 저장하고 분석 작업을 만든다(202) */
export async function submitSource(
  req: SourceRequest,
  mock: MockAnalysis = null,
): Promise<{ sourceId: number; jobId: number; status: "ANALYZING" }> {
  return mockSubmitSource(req, mock ?? "ok");
}

/** GET /api/jobs/{jobId} */
export async function fetchJob(jobId: number): Promise<Job> {
  return mockFetchJob(jobId);
}

/** POST /api/jobs/{jobId}/retry — 같은 원본으로 같은 작업을 다시 돌린다(202) */
export async function retryJob(jobId: number): Promise<Job> {
  return mockRetryJob(jobId);
}
