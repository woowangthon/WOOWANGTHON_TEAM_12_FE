import { ApiError } from "@/lib/api/errors";
import type { PublicProfile, PublicProfileSettings } from "@/lib/api/share";
import type { ActivityDetail, Experience } from "@/lib/api/types";

// MOCK(public-profile): API 주소가 없는 목 모드에서만 공개 프로필을 이 브라우저 저장소로 모의한다. 실제 API 실패 대체용이 아니다.
// 새 탭에서 공개 페이지를 여는 걸 보려고 localStorage 에 둔다. 다른 기기 · 브라우저에서는 「없는 페이지예요」다.
const KEY = "mock:public-profile";
type State = { title: string | null; token: string | null; shared: number[] };

function read(): State {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (value && Array.isArray(value.shared)) return value;
  } catch { /* 저장소를 막은 브라우저 · 깨진 값이면 처음 상태로 본다 */ }
  return { title: null, token: null, shared: [] };
}
function write(state: State) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 목 모드 — 저장을 막았으면 이번 동작만 남지 않는다 */ }
}

export const mockSharedIds = () => new Set(read().shared);

const visible = (e: Experience) => e.shared === true && e.sourceStatus !== "NEEDS_REVIEW";

function settings(activities: ActivityDetail[]): PublicProfileSettings {
  const { title, token } = read();
  const experiences = activities.flatMap((a) => a.experiences);
  return { title, linkEnabled: token !== null, token, sharedCount: experiences.filter((e) => e.shared).length, visibleCount: experiences.filter(visible).length };
}

export async function mockFetchSettings(activities: ActivityDetail[]) { return settings(activities); }

export async function mockSetTitle(activities: ActivityDetail[], title: string | null) {
  write({ ...read(), title });
  return settings(activities);
}

export async function mockCreateLink(activities: ActivityDetail[]) {
  if (settings(activities).visibleCount === 0) throw new ApiError("NO_SHARED_EXPERIENCES", "공개할 경험이 없어요.", 409);
  write({ ...read(), token: `mock-${Date.now().toString(36)}` });
  return settings(activities);
}

export async function mockDeleteLink() { write({ ...read(), token: null }); }

export async function mockSetShared(activities: ActivityDetail[], id: number, shared: boolean): Promise<Experience> {
  const found = activities.flatMap((a) => a.experiences).find((e) => e.id === id);
  if (!found) throw new ApiError("EXPERIENCE_NOT_FOUND", `경험 ${id} 이 없습니다`, 404);
  if (shared && found.sourceStatus === "NEEDS_REVIEW") throw new ApiError("EXPERIENCE_NEEDS_REVIEW", "먼저 확인해 주세요.", 409);
  const state = read();
  write({ ...state, shared: shared ? [...new Set([...state.shared, id])] : state.shared.filter((x) => x !== id) });
  return { ...found, shared };
}

/** share-api 「허용 목록」과 같은 필드만 만든다 — 목 분류의 「AI」는 표시 확인용이고 AI 판단이 아니다 */
export async function mockFetchPublicProfile(activities: ActivityDetail[], token: string): Promise<PublicProfile> {
  const state = read();
  if (state.token === null || state.token !== token) throw new ApiError("PUBLIC_PROFILE_NOT_FOUND", "없는 페이지예요.", 404);
  return {
    title: state.title,
    activities: activities.flatMap((a) => {
      const experiences = a.experiences.filter(visible);
      if (experiences.length === 0) return [];
      return [{
        name: a.name, period: a.period, category: a.category ?? null, categoryBy: a.categoryBy ?? null,
        experiences: experiences.map((e) => ({
          content: e.content,
          sourceStatus: e.sourceStatus as "SOURCE_CONFIRMED" | "USER_ENTERED",
          competencies: e.competencies, competenciesBy: e.competenciesBy,
          sourceNames: [...new Set(e.citations.filter((c) => c.matched === true).map((c) => c.sourceName.split("/").pop() ?? c.sourceName))],
        })),
      }];
    }),
  };
}
