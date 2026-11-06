// 경험 찾기(S-58)를 조건과 함께 여는 주소 — 빠른 찾기 창(S-61)의 「검색에서 더 보기」. 낱말은 비어도 q 를 남겨 찾기 화면으로 연다
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityCategory, type Competency, type ExperienceSearch } from "@/lib/api/types";

export function experienceSearchHref({ query, competencies, year, sourceStatus, category, saved }: ExperienceSearch) {
  const params = new URLSearchParams({ q: query ?? "" });
  if (competencies?.length) params.set("competencies", competencies.join(","));
  if (year != null) params.set("year", String(year));
  if (sourceStatus === "NEEDS_REVIEW") params.set("review", "1");
  if (category) params.set("category", category);
  if (saved) params.set("saved", "1");
  return `/experience?${params}`;
}

/** 주소는 손으로 고칠 수 있어 목록 밖 값은 버린다 */
export function experienceSearchFromParams(params: Pick<URLSearchParams, "get">): ExperienceSearch {
  const competencies = (params.get("competencies") ?? "").split(",").filter((c): c is Competency => c in COMPETENCIES);
  const year = Number(params.get("year"));
  const category = params.get("category");
  return {
    query: params.get("q") ?? undefined,
    competencies: competencies.length ? competencies : undefined,
    year: Number.isInteger(year) && year > 0 ? year : undefined,
    sourceStatus: params.get("review") === "1" ? "NEEDS_REVIEW" : undefined,
    category: category && category in ACTIVITY_CATEGORIES ? category as ActivityCategory : undefined,
    saved: params.get("saved") === "1" ? true : undefined,
  };
}
