"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchQuestion, fetchQuestions, retryQuestion, submitQuestion } from "@/lib/api/questions";
import type { CreateQuestionRequest, QuestionDetail, QuestionSummary } from "@/lib/api/question-types";
import { selectedMockQuestion, selectMockQuestion, type MockQuestionScenario } from "@/lib/mock/questions";

type State = { loading: boolean; questions: QuestionSummary[]; selected: QuestionDetail | null; error: string | null };
const POLL_MS = 2000;

/** 자료 분석과 같은 2초 폴링. 문항 자체가 작업이므로 별도 job을 만들지 않는다. */
export function useQuestionMatching() {
  const [state, setState] = useState<State>({ loading: true, questions: [], selected: null, error: null });
  const selectedId = useRef<number | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  const refresh = useCallback(async (id?: number) => {
    const version = ++generation.current;
    try {
      const questions = await fetchQuestions();
      const wanted = id ?? selectedId.current ?? selectedMockQuestion();
      const nextId = questions.find(q => q.id === wanted)?.id ?? questions[0]?.id ?? null;
      const selected = nextId === null ? null : await fetchQuestion(nextId);
      if (version !== generation.current) return;
      selectedId.current = nextId;
      if (nextId !== null) selectMockQuestion(nextId);
      setState({ loading: false, questions, selected, error: null });
    } catch (e) {
      if (version === generation.current) setState(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : "문항을 불러오지 못했어요." }));
    }
  }, []);

  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);

  const analyzing = state.questions.some(q => q.status === "ANALYZING");
  useEffect(() => {
    if (!analyzing || state.error) return;
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, state.error, refresh]);

  return {
    ...state,
    refresh,
    select(id: number) { selectedId.current = id; return refresh(id); },
    async submit(req: CreateQuestionRequest, scenario: MockQuestionScenario) {
      if (pending.current) return false;
      pending.current = true;
      try {
        const result = await submitQuestion(req, scenario);
        selectedId.current = result.questionId;
        await refresh(result.questionId);
        return true;
      } finally { pending.current = false; }
    },
    async retry() {
      if (pending.current || selectedId.current === null) return;
      pending.current = true;
      try { await retryQuestion(selectedId.current); await refresh(selectedId.current); }
      finally { pending.current = false; }
    },
  };
}
