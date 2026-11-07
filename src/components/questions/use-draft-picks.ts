"use client";

import { useCallback, useState } from "react";
import type { QuestionDetail } from "@/lib/api/question-types";

/** 만든 초안이 있으면 그 경험, 없으면 추천 앞의 셋 */
const defaultPicks = (question: QuestionDetail) =>
  question.draft ? question.draft.experienceIds : question.recommendations.slice(0, 3).map(r => r.experience.id);

/** 초안에 쓸 경험(S-27) — 참고 카드에서 고르고 패널에서 만든다. 문항마다 따로 둔다 */
export function useDraftPicks(question: QuestionDetail | null) {
  const [chosen, setChosen] = useState<ReadonlyMap<number, number[]>>(new Map());
  const toggle = (experienceId: number, on: boolean) => {
    if (!question) return;
    setChosen(previous => {
      const ids = (previous.get(question.id) ?? defaultPicks(question)).filter(id => question.recommendations.some(r => r.experience.id === id));
      return new Map(previous).set(question.id, on ? [...ids, experienceId] : ids.filter(id => id !== experienceId));
    });
  };
  /** 초안을 요청한 뒤엔 그 초안의 경험을 따른다 */
  const reset = useCallback((questionId: number) => setChosen(previous => {
    const next = new Map(previous);
    next.delete(questionId);
    return next;
  }), []);
  return { ids: question ? chosen.get(question.id) ?? defaultPicks(question) : [], toggle, reset };
}
