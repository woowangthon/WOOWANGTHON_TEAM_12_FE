// 예전 경험 찾기 주소(/experience?q=…)를 읽는다 — 이제 그 조건으로 빠른 찾기 창(S-61) 찾기 탭을 연다(S-58 · FE#274)
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityCategory, type Competency, type ExperienceSearch } from "@/lib/api/types";

/** 찾기 조건을 담는 주소 칸 — 창을 연 뒤 주소에서 지운다 */
export const EXPERIENCE_SEARCH_PARAMS = ["q", "competencies", "year", "review", "category", "saved"] as const;

/** 주소는 손으로 고칠 수 있어 목록 밖 값은 버린다 */
export function experienceSearchFromParams(params: Pick<URLSearchParams, "get">): ExperienceSearch {
  const competencies = (params.get("competencies") ?? "").split(",").filter((c): c is Competency => c in COMPETENCIES);
  const year = Number(params.get("year"));
  const category = params.get("category");
  return {
    query: params.get("q") || undefined,
    competencies: competencies.length ? competencies : undefined,
    year: Number.isInteger(year) && year > 0 ? year : undefined,
    sourceStatus: params.get("review") === "1" ? "NEEDS_REVIEW" : undefined,
    category: category && category in ACTIVITY_CATEGORIES ? category as ActivityCategory : undefined,
    saved: params.get("saved") === "1" ? true : undefined,
  };
}
