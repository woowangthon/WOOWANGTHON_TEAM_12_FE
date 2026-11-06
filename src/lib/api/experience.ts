// 자료 넣기 · 분석 작업 · 활동 · 경험 — ETC docs/contracts/experience-api.md
// MOCK(timeline-activities): API 주소가 없을 때만 src/lib/mock/activities.ts 로 화면을 확인한다. 실제 API 실패 시 사용하지 않는다.
// MOCK(source-analysis): API 주소가 없는 목 모드에서만 자료 넣기 · 작업 조회 · 재시도를 모의한다.
// MOCK(experience-search): API 주소가 없는 목 모드에서만 경험 찾기를 브라우저에서 흉내 낸다. 실제 API 실패 시 사용하지 않는다.

import { MOCK_ACTIVITIES } from "../mock/activities";
import { mockAddedActivities, mockFetchJob, mockRetryJob, mockSubmitBatch, mockSubmitSource, mockTargetExperiences } from "../mock/analysis";
import { mockSearchExperiences } from "../mock/experience-search";
import { mockSharedIds } from "../mock/share";
import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import { activityNoteError } from "./editing";
import type { ActivityDetail, ActivityLink, ActivitySummary, Job, SourceRequest, Experience, ExperienceSearch, ExperienceSearchResult, Supplement, UpdateActivityRequest, UpdateExperienceRequest, CreateExperienceRequest } from "./types";
import { COMPETENCIES, MAX_TEXT_LENGTH, type SourceSubmitted } from "./types";

export { ApiError, isMockMode };

/** 화면 확인용 — 주소에 `?mock=empty` · `?mock=error` 를 붙이면 빈 타임라인(목 분석으로 더한 활동만) · 불러오기 실패를 본다 */
export type MockMode = "empty" | "error" | null;

/** 화면 확인용 — 주소에 `?analysis=fail` · `?analysis=empty` · `?analysis=miss` 를 붙이면 자료를 넣었을 때 분석 실패 · 활동 0개 · 「자료 더하기」 대상 못 찾음으로 끝난다 */
export type MockAnalysis = "fail" | "empty" | "miss" | null;

// MOCK(timeline-activities): 목 경험 수정·추가는 현재 페이지 실행 중에만 유지한다.
const mockExperiences = new Map<number, Experience[]>();
export const allActivities = () => {
  const shared = mockSharedIds();
  const attached = mockTargetExperiences();
  return [...MOCK_ACTIVITIES, ...mockAddedActivities()].map((activity) => {
    const base = mockExperiences.get(activity.id) ?? activity.experiences;
    const added = (attached[activity.id] ?? []).filter((e) => !base.some((b) => b.id === e.id));
    return { ...activity, experiences: [...base, ...added].map((e) => ({ ...e, shared: shared.has(e.id) })) };
  });
};

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
  if (!isMockMode()) {
    const activity = await request<ActivityDetail>(`/activities/${id}`);
    activity.experiences.forEach(checkCompetencies);
    return activity;
  }
  const found = allActivities().find((a) => a.id === id);
  if (!found) throw new ApiError("ACTIVITY_NOT_FOUND", `활동 ${id} 이 없습니다`);
  return structuredClone(found);
}

/** POST /api/sources — 원본을 저장하고 분석 작업을 만든다(202) */
export async function submitSource(
  req: SourceRequest,
  mock: MockAnalysis = null,
): Promise<SourceSubmitted> {
  if (!req.text.trim()) throw new ApiError("EMPTY_TEXT", "내용이 비어 있어요.");
  if (req.text.length > MAX_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "한 번에 50,000자까지 넣을 수 있어요.");
  if (!isMockMode()) return request("/sources", req, "POST");
  return mockSubmitSource(req, mock ?? "ok");
}

/** POST /api/sources/batch — 파일마다 원본 · 작업을 만들고 차례로 돌린다(202). 결과는 요청 순서 그대로 (S-59) */
export async function submitSources(sources: SourceRequest[], mock: MockAnalysis = null): Promise<SourceSubmitted[]> {
  if (!isMockMode()) return (await request<{ items: SourceSubmitted[] }>("/sources/batch", { sources }, "POST")).items;
  return mockSubmitBatch(sources, mock ?? "ok");
}

/** GET /api/jobs/{jobId} */
export async function fetchJob(jobId: number): Promise<Job> {
  if (!isMockMode()) return request(`/jobs/${jobId}`);
  return mockFetchJob(jobId);
}

/** POST /api/jobs/{jobId}/retry — 같은 원본으로 같은 작업을 다시 돌린다(202) */
export async function retryJob(jobId: number): Promise<Job> {
  if (!isMockMode()) return request(`/jobs/${jobId}/retry`, undefined, "POST");
  return mockRetryJob(jobId);
}


export async function updateActivity(id: number, data: UpdateActivityRequest): Promise<ActivitySummary> {
  if (data.note !== undefined) {
    const invalid = data.note === null ? null : activityNoteError(data.note);
    if (invalid) throw new ApiError("INVALID_REQUEST", invalid);
    data = { ...data, note: data.note?.trim() || null };
  }
  const activity = await request<ActivitySummary>(`/activities/${id}`, data);
  if (data.note !== undefined && activity.note !== null && typeof activity.note !== "string") {
    throw new ApiError("INVALID_RESPONSE", "저장 응답에 계기가 없어요. 서버 버전을 확인하고 다시 시도해 주세요.");
  }
  return activity;
}

export function checkCompetencies<T extends Pick<Experience, "competencies">>(experience: T): T {
  const values = experience.competencies;
  if (!Array.isArray(values) || values.length > 3 || new Set(values).size !== values.length || values.some((value) => !Object.hasOwn(COMPETENCIES, value))) {
    throw new ApiError("INVALID_RESPONSE", "서버의 경험 역량 응답이 최신 API 계약과 달라요. BE 버전을 확인해 주세요.");
  }
  return experience;
}

/** GET /api/experiences — 낱말 · 거르기(S-58). AI 를 부르지 않는다. 맞은 게 없어도 오류가 아니다(total 0) */
export async function searchExperiences(search: ExperienceSearch, mock: MockMode = null): Promise<ExperienceSearchResult> {
  if (isMockMode()) {
    if (mock === "error") throw new ApiError("MOCK_ERROR", "불러오기 실패 화면 확인용");
    return mockSearchExperiences(allActivities(), search);
  }
  const { query, competencies, year, sourceStatus, category } = search;
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (competencies?.length) params.set("competencies", competencies.join(","));
  if (year) params.set("year", String(year));
  if (sourceStatus) params.set("sourceStatus", sourceStatus);
  if (category) params.set("category", category);
  const qs = params.toString();
  const found = await request<ExperienceSearchResult>(`/experiences${qs ? `?${qs}` : ""}`);
  found.experiences.forEach(checkCompetencies);
  return found;
}

export async function updateExperience(id: number, data: UpdateExperienceRequest): Promise<Experience> {
  if (isMockMode()) {
    const activity = allActivities().find((a) => a.experiences.some((e) => e.id === id));
    const previous = activity?.experiences.find((e) => e.id === id);
    if (!activity || !previous) throw new ApiError("EXPERIENCE_NOT_FOUND", `경험 ${id} 이 없습니다`);
    const competenciesChanged = data.competencies !== undefined
      && JSON.stringify(data.competencies) !== JSON.stringify(previous.competencies);
    const changed = competenciesChanged
      || (data.content !== undefined && data.content !== previous.content)
      || (data.actor !== undefined && data.actor !== previous.actor);
    const updated: Experience = {
      ...previous, ...data,
      competenciesBy: competenciesChanged ? "USER" : previous.competenciesBy,
      sourceStatus: changed ? "USER_ENTERED" : previous.sourceStatus,
    };
    checkCompetencies(updated);
    mockExperiences.set(activity.id, activity.experiences.map((e) => e.id === id ? updated : e));
    return structuredClone(updated);
  }
  return checkCompetencies<Experience>(await request(`/experiences/${id}`, data));
}

export async function createExperience(activityId: number, data: CreateExperienceRequest): Promise<Experience> {
  if (isMockMode()) {
    const activity = allActivities().find((a) => a.id === activityId);
    if (!activity) throw new ApiError("ACTIVITY_NOT_FOUND", `활동 ${activityId} 이 없습니다`);
    const created: Experience = {
      id: Math.max(0, ...allActivities().flatMap((a) => a.experiences.map((e) => e.id))) + 1,
      activityId, ...data, competencies: data.competencies ?? [],
      competenciesBy: "USER", sourceStatus: "USER_ENTERED", citations: [], shared: false,
    };
    checkCompetencies(created);
    mockExperiences.set(activityId, [...activity.experiences, created]);
    return structuredClone(created);
  }
  return checkCompetencies<Experience>(await request(`/activities/${activityId}/experiences`, data, "POST"));
}

export function deleteExperience(id: number): Promise<void> {
  return request(`/experiences/${id}`, undefined, "DELETE");
}

/** POST /api/experiences/{id}/move — 묶음만 바뀐다. 내용 · 근거 · 출처 상태는 그대로 (S-12) */
export async function moveExperience(id: number, toActivityId: number): Promise<Experience> {
  return checkCompetencies<Experience>(await request(`/experiences/${id}/move`, { toActivityId }, "POST"));
}

/** POST /api/activities/{keepId}/merge — fromId 의 경험을 keepId 로 옮기고 fromId 를 지운다. 응답은 남은 활동의 세부 (S-13) */
export async function mergeActivities(keepId: number, fromId: number): Promise<ActivityDetail> {
  const activity = await request<ActivityDetail>(`/activities/${keepId}/merge`, { fromActivityId: fromId }, "POST");
  activity.experiences.forEach(checkCompetencies);
  return activity;
}

/** S-44 — 제안만 지우며 두 활동은 그대로 둔다. */
export function dismissMergeSuggestion(id: number): Promise<void> {
  return request(`/activities/${id}/merge-suggestion`, undefined, "DELETE");
}

/** POST /api/activities/{id}/link-suggestions — 새로 생긴 SUGGESTED 이어짐 0 ~ 3개(S-35). 동기 · 최대 60초 */
export async function suggestLinks(id: number): Promise<ActivityLink[]> {
  return (await request<{ links: ActivityLink[] }>(`/activities/${id}/link-suggestions`, undefined, "POST")).links;
}

/** PATCH /api/activity-links/{id} — 맞아요(CONFIRMED) · 아니에요(REJECTED). 정한 뒤엔 바꿀 수 없다 */
export function decideLink(id: number, status: "CONFIRMED" | "REJECTED"): Promise<ActivityLink> {
  return request(`/activity-links/${id}`, { status });
}

/** PATCH /api/supplements/{id} — 답만 고친다. 경험의 출처 상태는 그대로 (S-24) */
export function updateSupplement(id: number, answer: string): Promise<Supplement> {
  return request(`/supplements/${id}`, { answer });
}

/** DELETE /api/supplements/{id} — 그 보완을 만든 되묻기는 다시 답할 수 있게 된다 (S-24) */
export function deleteSupplement(id: number): Promise<void> {
  return request(`/supplements/${id}`, undefined, "DELETE");
}
