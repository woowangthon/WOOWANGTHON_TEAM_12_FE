import type { QuestionDetail, Recommendation } from "@/lib/api/question-types";

/** 한 지원 안에서 같은 활동이 2개 이상 문항에 추천된 것 — 문항마다 어떤 경험 · 강조점으로 쓰였나(S-21).
 *  막거나 경고하지 않는다. 대표 경험을 문항마다 다른 각도로 쓰는 게 자연스럽다(SPEC 미결정 15) */
export type OverlapUse = { questionId: number; index: number; recommendation: Recommendation };
export type Overlap = { activity: Recommendation["activity"]; uses: OverlapUse[] };

/** details 는 지원의 문항 순서 그대로 — 아직 못 받은 문항(null)은 건너뛰고 번호는 자리대로 */
export function overlapsOf(details: (QuestionDetail | null)[]): Overlap[] {
  const byActivity = new Map<number, Overlap>();
  details.forEach((question, index) => {
    if (question?.status !== "COMPLETED") return;
    for (const recommendation of question.recommendations) {
      const group = byActivity.get(recommendation.activity.id) ?? { activity: recommendation.activity, uses: [] };
      group.uses.push({ questionId: question.id, index, recommendation });
      byActivity.set(recommendation.activity.id, group);
    }
  });
  return [...byActivity.values()].filter(g => new Set(g.uses.map(u => u.questionId)).size >= 2);
}
