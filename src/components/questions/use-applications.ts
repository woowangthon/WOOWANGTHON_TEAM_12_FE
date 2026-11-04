"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addApplicationQuestion, fetchApplications, fetchQuestion, retryQuestion, submitApplication } from "@/lib/api/questions";
import type { Application, CreateApplicationRequest, QuestionDetail } from "@/lib/api/question-types";
import { selectedMockQuestion, selectMockQuestion, type MockQuestionScenario } from "@/lib/mock/questions";

/** 고른 지원 하나 — 문항마다 추천 결과(넣은 순서). 같은 경험이 여러 문항에 추천됐는지는 details 로 계산한다(S-21) */
export type OpenApplication = { application: Application; details: QuestionDetail[] };
type State = { loading: boolean; applications: Application[]; open: OpenApplication | null; questionId: number | null; error: string | null };
const POLL_MS = 2000;

/** 지원 목록 + 고른 지원의 문항들. 문항 하나가 추천 작업 하나라 분석 중인 문항이 있으면 2초마다 다시 읽는다 */
export function useApplications() {
  const [state, setState] = useState<State>({ loading: true, applications: [], open: null, questionId: null, error: null });
  const selectedId = useRef<number | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  const refresh = useCallback(async (questionId?: number) => {
    const version = ++generation.current;
    try {
      const applications = await fetchApplications();
      const wanted = questionId ?? selectedId.current ?? selectedMockQuestion();
      const application = applications.find(a => a.questions.some(q => q.id === wanted)) ?? applications[0] ?? null;
      const nextId = application ? (application.questions.find(q => q.id === wanted) ?? application.questions[0]).id : null;
      const details = application ? await Promise.all(application.questions.map(q => fetchQuestion(q.id))) : [];
      if (version !== generation.current) return;
      selectedId.current = nextId;
      if (nextId !== null) selectMockQuestion(nextId);
      setState({ loading: false, applications, open: application && { application, details }, questionId: nextId, error: null });
    } catch (e) {
      if (version === generation.current) setState(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : "지원을 불러오지 못했어요." }));
    }
  }, []);

  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);

  const analyzing = state.applications.some(a => a.questions.some(q => q.status === "ANALYZING"));
  useEffect(() => {
    if (!analyzing || state.error) return;
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, state.error, refresh]);

  /** 넣기 · 더하기 · 다시 시도는 하나씩만 */
  const once = async <T,>(run: () => Promise<T>) => {
    if (pending.current) return null;
    pending.current = true;
    try { return await run(); } finally { pending.current = false; }
  };

  const selectQuestion = (id: number) => { selectedId.current = id; return refresh(id); };
  return {
    ...state,
    refresh,
    selectQuestion,
    selectApplication: (application: Application) => selectQuestion(application.questions[0].id),
    submit: (req: CreateApplicationRequest, scenario: MockQuestionScenario) => once(async () => {
      const { questionIds } = await submitApplication(req, scenario);
      selectedId.current = questionIds[0];
      await refresh(questionIds[0]);
      return true;
    }),
    addQuestion: (applicationId: number, text: string, scenario: MockQuestionScenario) => once(async () => {
      const { questionId } = await addApplicationQuestion(applicationId, { text }, scenario);
      selectedId.current = questionId;
      await refresh(questionId);
      return true;
    }),
    retry: (questionId: number) => once(async () => {
      await retryQuestion(questionId);
      await refresh(questionId);
      return true;
    }),
  };
}
