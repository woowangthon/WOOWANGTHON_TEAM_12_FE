// MOCK(experience-search): API 주소가 없는 목 모드에서만 경험 찾기(S-58)를 브라우저에서 흉내 낸다. 실제 API 실패 대체용이 아니다.
// 규칙은 계약(experience-api 「GET /api/experiences」)과 같게 두었지만 진짜 검색은 BE 의 ExperienceSearch 다.
import type { ActivityCategory, ActivityDetail, ExperienceSearch, ExperienceSearchResult } from "@/lib/api/types";
import { monthNumber, spanOf } from "@/lib/period";

// MOCK(experience-search): 목 활동의 분류 — 표시 · 거르기 확인용으로 지어 붙였다. AI 판단이 아니다. 17 은 미분류 확인용으로 뺐다.
export const MOCK_CATEGORY: Record<number, ActivityCategory> = {
  7: "PROJECT", 18: "PROJECT", 9: "PROJECT", 11: "PROJECT", 13: "PROJECT", 14: "PROJECT",
  8: "STUDY", 15: "STUDY",
  10: "CLUB", 12: "CLUB", 16: "CLUB",
};
const LIMIT = 100;

export function mockSearchExperiences(activities: ActivityDetail[], search: ExperienceSearch): ExperienceSearchResult {
  const words = (search.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const now = monthNumber(new Date());
  const inYear = (activity: ActivityDetail) => {
    if (!search.year) return true;
    const span = spanOf(activity.period, now);
    return !!span && Math.floor(span.start / 12) <= search.year && search.year <= Math.floor(span.end / 12);
  };
  const found = activities.filter(inYear).flatMap((activity) => {
    const category = activity.category ?? null;
    if (search.category && category !== search.category) return [];
    const { id: activityId, name, period } = activity;
    return activity.experiences.flatMap((experience) => {
      if (search.competencies?.length && !experience.competencies.some((c) => search.competencies?.includes(c))) return [];
      if (search.sourceStatus && experience.sourceStatus !== search.sourceStatus) return [];
      if (search.saved && !experience.saved) return [];
      const text = [
        experience.content, name,
        ...experience.citations.map((c) => c.quote),
        ...(experience.supplements ?? []).flatMap((s) => [s.question, s.answer]),
      ].join("\n").toLowerCase();
      const hits = words.filter((word) => text.includes(word)).length;
      if (words.length && !hits) return [];
      return [{ hits, result: { ...experience, activity: { id: activityId, name, period, category } } }];
    });
  }).sort((a, b) => b.hits - a.hits
    || (b.result.activity.period.start ?? "").localeCompare(a.result.activity.period.start ?? "")
    || a.result.id - b.result.id);
  return { total: found.length, experiences: found.slice(0, LIMIT).map((f) => structuredClone(f.result)) };
}
