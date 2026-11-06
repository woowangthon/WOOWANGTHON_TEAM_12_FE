// 공개 프로필 링크 — ETC docs/contracts/share-api.md (S-65 · S-66)
// MOCK(public-profile): API 주소가 없을 때만 src/lib/mock/share.ts 로 화면을 확인한다. 실제 API 실패 시 사용하지 않는다.
import { mockCreateLink, mockDeleteLink, mockFetchPublicProfile, mockFetchSettings, mockSetShared, mockSetTitle } from "@/lib/mock/share";
import { ApiError } from "./errors";
import { allActivities, checkCompetencies } from "./experience";
import { isMockMode, request } from "./http";
import { ACTIVITY_CATEGORIES, type ActivityCategory, type Competency, type Experience, type Period } from "./types";

/** 제목 한도 — 앞뒤 공백을 걷은 뒤(share-api 「PATCH /api/public-profile」) */
export const PUBLIC_TITLE_MAX = 100;

export type PublicProfileSettings = {
  title: string | null;
  linkEnabled: boolean;
  /** 켜져 있으면 주소 토큰, 꺼져 있으면 null */
  token: string | null;
  /** 고른 경험 수 */
  sharedCount: number;
  /** 그중 공개 조건을 채워 실제로 실리는 수 — 0 이면 켜기를 막는다 */
  visibleCount: number;
};

export type PublicExperience = {
  content: string;
  sourceStatus: "SOURCE_CONFIRMED" | "USER_ENTERED";
  competencies: Competency[];
  competenciesBy: "AI" | "USER";
  sourceNames: string[];
};
export type PublicActivity = {
  name: string;
  period: Period;
  category: ActivityCategory | null;
  categoryBy: "AI" | "USER" | null;
  experiences: PublicExperience[];
};
export type PublicProfile = { title: string | null; activities: PublicActivity[] };

/** 공개 주소는 FE 가 만든다. BE 는 token 만 준다 */
export const publicProfileUrl = (token: string) => `${window.location.origin}/p/${encodeURIComponent(token)}`;

const invalid = () => new ApiError("INVALID_RESPONSE", "공개 프로필 응답을 확인하지 못했어요.");
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function parseSettings(value: PublicProfileSettings): PublicProfileSettings {
  if (!value || typeof value.linkEnabled !== "boolean" || !count(value.sharedCount) || !count(value.visibleCount)) throw invalid();
  if (value.title !== null && typeof value.title !== "string") throw invalid();
  if (value.linkEnabled ? typeof value.token !== "string" || !value.token : value.token !== null) throw invalid();
  return value;
}

function parseProfile(value: PublicProfile): PublicProfile {
  if (!value || (value.title !== null && typeof value.title !== "string") || !Array.isArray(value.activities)) throw invalid();
  for (const activity of value.activities) {
    if (typeof activity?.name !== "string" || !activity.period || !Array.isArray(activity.experiences)) throw invalid();
    if (activity.category !== null && !Object.hasOwn(ACTIVITY_CATEGORIES, activity.category)) throw invalid();
    for (const experience of activity.experiences) {
      if (typeof experience?.content !== "string" || !Array.isArray(experience.sourceNames)) throw invalid();
      if (experience.sourceStatus !== "SOURCE_CONFIRMED" && experience.sourceStatus !== "USER_ENTERED") throw invalid();
      checkCompetencies(experience);
    }
  }
  return value;
}

/** PUT /api/experiences/{id}/shared — 내용을 고친 게 아니라 출처 상태는 그대로다 */
export async function setExperienceShared(id: number, shared: boolean): Promise<Experience> {
  if (isMockMode()) return mockSetShared(allActivities(), id, shared);
  return request<Experience>(`/experiences/${id}/shared`, { shared }, "PUT");
}

export async function fetchPublicProfileSettings(): Promise<PublicProfileSettings> {
  return parseSettings(isMockMode() ? await mockFetchSettings(allActivities()) : await request<PublicProfileSettings>("/public-profile"));
}

/** PATCH /api/public-profile — 비우면 제목을 지운다. 주소는 바뀌지 않는다 */
export async function updatePublicProfileTitle(title: string): Promise<PublicProfileSettings> {
  const value = title.trim() || null;
  return parseSettings(isMockMode() ? await mockSetTitle(allActivities(), value) : await request<PublicProfileSettings>("/public-profile", { title: value }, "PATCH"));
}

/** POST /api/public-profile/link — 언제나 새 token. 옛 주소는 바로 막힌다 */
export async function createPublicProfileLink(): Promise<PublicProfileSettings> {
  return parseSettings(isMockMode() ? await mockCreateLink(allActivities()) : await request<PublicProfileSettings>("/public-profile/link", undefined, "POST"));
}

export async function deletePublicProfileLink(): Promise<void> {
  if (isMockMode()) return mockDeleteLink();
  return request<void>("/public-profile/link", undefined, "DELETE");
}

/** GET /api/public/profiles/{token} — 로그인 없음. 쿠키를 싣지 않는다. mock 은 불러오기 실패 화면 확인용(`?mock=error`) */
export async function fetchPublicProfile(token: string, mock: "error" | null = null): Promise<PublicProfile> {
  if (isMockMode()) {
    if (mock === "error") throw new ApiError("MOCK_ERROR", "불러오기 실패 화면 확인용");
    return parseProfile(await mockFetchPublicProfile(allActivities(), token));
  }
  return parseProfile(await request<PublicProfile>(`/public/profiles/${encodeURIComponent(token)}`, undefined, "GET", "omit"));
}
