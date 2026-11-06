"use client";

import { useEffect, useState } from "react";
import { fetchSimilarAnswers } from "@/lib/api/questions";
import type { SimilarAnswer } from "@/lib/api/question-types";

/** 문항을 열 때와 basis(유형 · 직무 · 종류 · 확정 시각)가 바뀔 때 다시 부른다. 늦게 온 옛 응답은 버린다 */
export function useSimilarAnswers(questionId: number, basis: string) {
  const [result, setResult] = useState<{ answers: SimilarAnswer[]; error: null } | { answers: null; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let stale = false;
    fetchSimilarAnswers(questionId).then(
      answers => { if (!stale) { setResult({ answers, error: null }); setRetrying(false); } },
      (e: unknown) => { if (!stale) { setResult({ answers: null, error: e instanceof Error ? e.message : "잠시 뒤 다시 시도해 주세요." }); setRetrying(false); } },
    );
    return () => { stale = true; };
  }, [questionId, basis, attempt]);
  return { answers: result?.answers ?? [], error: result?.error ?? null, retrying, retry: () => { setRetrying(true); setAttempt(n => n + 1); } };
}
