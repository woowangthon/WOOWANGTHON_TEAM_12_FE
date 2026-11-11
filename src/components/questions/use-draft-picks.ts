"use client";

import { useCallback, useState } from "react";
import type { QuestionDetail, Recommendation } from "@/lib/api/question-types";

/** 활동 카드 하나 — 활동과 그 활동에 묶인 추천(경험 줄) */
export type ActivityGroup = { activity: Recommendation["activity"]; recommendations: Recommendation[] };

/** 추천을 activity.id 로 묶는다. 활동 순서는 그 활동의 첫 추천 순서, 줄 순서는 추천 순서(S-84 · question-api.md 「추천」) */
export function groupByActivity(recommendations: Recommendation[]): ActivityGroup[] {
  const groups = new Map<number, ActivityGroup>();
  for (const r of recommendations) {
    const group = groups.get(r.activity.id);
    if (group) group.recommendations.push(r);
    else groups.set(r.activity.id, { activity: r.activity, recommendations: [r] });
  }
  return [...groups.values()];
}

/** 만든 초안이 있으면 그 경험이 속한 활동, 없으면 첫째 활동만 */
const defaultActivities = (question: QuestionDetail) => {
  const groups = groupByActivity(question.recommendations);
  if (!question.draft) return groups.slice(0, 1).map(g => g.activity.id);
  const used = question.draft.experienceIds;
  return groups.filter(g => g.recommendations.some(r => used.includes(r.experience.id))).map(g => g.activity.id);
};

/** 체크한 활동의 추천 경험을 활동 순서대로 */
const experienceIdsOf = (question: QuestionDetail, activityIds: number[]) =>
  groupByActivity(question.recommendations).filter(g => activityIds.includes(g.activity.id)).flatMap(g => g.recommendations.map(r => r.experience.id));

/** 초안에 쓸 활동(S-84) — 참고 카드에서 활동을 체크하고 패널에서 만든다. 문항마다 따로 둔다.
 *  줄은 넣고 빼지 않는다 — ids 는 체크한 활동의 추천 경험(초안 요청의 experienceIds) */
export function useDraftPicks(question: QuestionDetail | null) {
  const [chosen, setChosen] = useState<ReadonlyMap<number, number[]>>(new Map());
  const toggle = (activityId: number, on: boolean) => {
    if (!question) return;
    setChosen(previous => {
      const ids = (previous.get(question.id) ?? defaultActivities(question)).filter(id => id !== activityId);
      return new Map(previous).set(question.id, on ? [...ids, activityId] : ids);
    });
  };
  /** 초안을 요청한 뒤엔 그 초안의 경험을 따른다 */
  const reset = useCallback((questionId: number) => setChosen(previous => {
    const next = new Map(previous);
    next.delete(questionId);
    return next;
  }), []);
  return { ids: question ? experienceIdsOf(question, chosen.get(question.id) ?? defaultActivities(question)) : [], toggle, reset };
}
