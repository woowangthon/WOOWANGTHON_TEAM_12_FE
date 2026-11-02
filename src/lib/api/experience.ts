// 자료 넣기 · 분석 작업 · 활동 · 경험 — ETC docs/contracts/experience-api.md
// MOCK(timeline-activities): 활동 조회는 지금 BE 대신 src/lib/mock/activities.ts 를 돌려준다. FE#7 에서 fetch 로 바꾸고 이 마커를 뺀다
// MOCK(source-analysis): 자료 넣기 · 작업 조회 · 다시 시도는 지금 src/lib/mock/analysis.ts 로 돈다. FE#7 에서 fetch 로 바꾸고 이 마커를 뺀다

import { MOCK_ACTIVITIES } from "../mock/activities";
import { mockAddedActivities, mockFetchJob, mockRetryJob, mockSubmitSource } from "../mock/analysis";
import { ApiError } from "./errors";
import type { ActivityDetail, ActivitySummary, Job, SourceRequest, Experience, UpdateActivityRequest, UpdateExperienceRequest } from "./types";

export { ApiError };

/** 화면 확인용 — 주소에 `?mock=empty` · `?mock=error` 를 붙이면 빈 타임라인(목 분석으로 더한 활동만) · 불러오기 실패를 본다 */
export type MockMode = "empty" | "error" | null;

/** 화면 확인용 — 주소에 `?analysis=fail` · `?analysis=empty` 를 붙이면 자료를 넣었을 때 분석 실패 · 활동 0개로 끝난다 */
export type MockAnalysis = "fail" | "empty" | null;

const allActivities = () => [...MOCK_ACTIVITIES, ...mockAddedActivities()];

/** GET /api/activities — period.start 오름차순, start 가 null 이면 맨 뒤 */
export async function fetchActivities(mock: MockMode = null): Promise<ActivitySummary[]> {
  if (!isMockMode()) return (await request<{ activities: ActivitySummary[] }>("/activities")).activities;
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
  if (!isMockMode()) return request<ActivityDetail>(`/activities/${id}`);
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

/** 주소가 없으면 목 조회. 실제 API 실패 시 목으로 대체하지 않는다. */
export function isMockMode() {
  return !process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
}

async function request<T>(path: string, data?: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("API_NOT_CONFIGURED", "목 모드에서는 서버에 저장할 수 없어요. API 주소 설정이 필요해요.");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: data === undefined ? "GET" : "PATCH",
      cache: "no-store",
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
  }
  let body;
  try { body = await response.json(); } catch {
    throw new ApiError(response.ok ? "INVALID_RESPONSE" : `HTTP_${response.status}`, "서버 응답을 읽지 못했어요.", response.status);
  }
  if (!response.ok) throw new ApiError(body?.error?.code ?? `HTTP_${response.status}`, body?.error?.message ?? "요청을 처리하지 못했어요.", response.status);
  return body as T;
}

export function updateActivity(id: number, data: UpdateActivityRequest): Promise<ActivitySummary> {
  return request(`/activities/${id}`, data);
}

export function updateExperience(id: number, data: UpdateExperienceRequest): Promise<Experience> {
  return request(`/experiences/${id}`, data);
}
