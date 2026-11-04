"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addApplicationQuestion, answerClarification, fetchApplications, fetchQuestion, retryQuestion, submitApplication } from "@/lib/api/questions";
import type { Application, CreateApplicationRequest, QuestionDetail, QuestionSummary } from "@/lib/api/question-types";

/** 고른 지원 하나 — 문항마다 추천 결과(넣은 순서, `application.questions` 와 같은 자리). 아직 못 받은 문항은 null(FE#60).
 *  같은 경험이 여러 문항에 추천됐는지는 details 로 계산한다(S-21) */
export type OpenApplication = { application: Application; details: (QuestionDetail | null)[] };
type State = {
  loading: boolean;
  applications: Application[];
  /** 받아 둔 문항 — 문항 ID 로. 탭을 바꿔도 다시 받지 않는다(끝난 추천은 계약상 추천했을 때 그대로) */
  details: Record<number, QuestionDetail>;
  /** 문항 하나를 못 받았을 때의 오류 — 그 문항 자리에 보이고, 지우면 다시 받는다 */
  detailErrors: Record<number, string>;
  /** 상태 확인의 연속 실패 횟수 — 이미 받은 문항 · 추천은 그대로 둔다 */
  pollFailures: Record<number, number>;
  questionId: number | null;
  error: string | null;
};
const POLL_MS = 2000;
const MAX_POLL_FAILURES = 3;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** 고른 문항은 주소 `?question=` 에 둔다 — 새로고침 · 타임라인에서 돌아오기 뒤에도 같은 문항 */
function questionInUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get("question"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function keepInUrl(id: number) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("question") === String(id)) return;
  url.searchParams.set("question", String(id));
  window.history.replaceState(window.history.state, "", url);
}

const summaryOf = ({ id, applicationId, organization, text, status, createdAt }: QuestionDetail): QuestionSummary =>
  ({ id, applicationId, organization, text, status, createdAt });
/** 새로 받은 문항의 상태를 지원 목록에도 — 목록을 다시 받지 않고 「분석 중 N」 · 점 색을 맞춘다. 더한 문항은 끝에 붙인다 */
function patch(applications: Application[], fresh: QuestionDetail[]): Application[] {
  if (!fresh.length) return applications;
  return applications.map(a => {
    const mine = fresh.filter(d => d.applicationId === a.id);
    if (!mine.length) return a;
    const questions = a.questions.map(q => { const d = mine.find(x => x.id === q.id); return d ? summaryOf(d) : q; });
    for (const d of mine) if (!questions.some(q => q.id === d.id)) questions.push(summaryOf(d));
    return { ...a, questions };
  });
}
const ownerOf = (applications: Application[], questionId: number | null) =>
  applications.find(a => a.questions.some(q => q.id === questionId)) ?? null;

/** 지원 목록 + 받아 둔 문항들(FE#60).
 *  - 지원 목록(`GET /api/applications`)은 처음 들어올 때 · 지원을 넣었을 때만 받는다
 *  - 탭 · 지원 고르기는 받아 둔 문항으로 바로 바꾼다. 처음 보는 문항만 그것만 받는다
 *  - 분석 중인 문항은 2초마다 그 문항만 다시 읽는다 — 고른 탭과 상관없이
 *  - 되묻기 답 · 문항 더하기 · 넣기 · 다시 시도 뒤에 다시 받는다. 그보다 먼저 출발한 폴링 응답은 번호표(generation)로 버린다 */
export function useApplications() {
  const [state, setState] = useState<State>({ loading: true, applications: [], details: {}, detailErrors: {}, pollFailures: {}, questionId: null, error: null });
  const generation = useRef(0);
  const pending = useRef(false);
  const fetching = useRef(new Set<number>());

  /** 받은 문항을 넣는다. 그새 넣기 · 답하기가 있었으면(번호표가 지났으면) 버린다.
   *  keep 이 있으면 그 밖의 받아 둔 문항은 지운다 — 보완이 생겨 다른 지원의 추천 경험도 바뀌었을 수 있어 다음에 열 때 다시 받는다 */
  const commit = useCallback((version: number, fresh: QuestionDetail[], next: { applications?: Application[]; questionId?: number; keep?: Set<number> } = {}) => {
    if (version !== generation.current) return;
    if (next.questionId !== undefined) keepInUrl(next.questionId);
    setState(prev => {
      const details: Record<number, QuestionDetail> = {};
      for (const [id, d] of Object.entries(prev.details)) if (!next.keep || next.keep.has(+id)) details[+id] = d;
      const detailErrors = { ...prev.detailErrors };
      const pollFailures = { ...prev.pollFailures };
      for (const d of fresh) { details[d.id] = d; delete detailErrors[d.id]; delete pollFailures[d.id]; }
      return { ...prev, details, detailErrors, pollFailures, applications: patch(next.applications ?? prev.applications, fresh), questionId: next.questionId ?? prev.questionId };
    });
  }, []);

  /** 처음 들어올 때 · 「다시 불러오기」 — 지원 목록과 주소의 문항을 동시에 받는다. 같은 지원의 나머지 문항은 아래 효과가 이어 받는다 */
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const wanted = questionInUrl();
      const [applications, first] = await Promise.all([fetchApplications(), wanted ? fetchQuestion(wanted).catch(() => null) : null]);
      if (version !== generation.current) return;
      const application = ownerOf(applications, wanted) ?? applications[0] ?? null;
      const questionId = application ? (application.questions.find(q => q.id === wanted) ?? application.questions[0]).id : null;
      if (questionId !== null) keepInUrl(questionId);
      const details = first && first.id === questionId ? { [first.id]: first } : {};
      setState({ loading: false, applications: patch(applications, Object.values(details)), details, detailErrors: {}, pollFailures: {}, questionId, error: null });
    } catch (e) {
      if (version === generation.current) setState(prev => ({ ...prev, loading: false, error: message(e, "지원을 불러오지 못했어요.") }));
    }
  }, []);

  /** 화면을 떠나면 오가던 응답을 버린다 */
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);

  /** 고른 지원에서 아직 못 받은 문항만 동시에 받는다. 받는 사이 넣기 · 답하기가 먼저 새것을 넣었으면 덮지 않는다 */
  const fetchMissing = useCallback(async (ids: number[]) => {
    const wanted = ids.filter(id => !fetching.current.has(id));
    if (!wanted.length) return;
    wanted.forEach(id => fetching.current.add(id));
    const results = await Promise.allSettled(wanted.map(fetchQuestion));
    wanted.forEach(id => fetching.current.delete(id));
    setState(prev => {
      const details = { ...prev.details };
      const detailErrors = { ...prev.detailErrors };
      const got: QuestionDetail[] = [];
      results.forEach((r, i) => {
        if (r.status === "rejected") detailErrors[wanted[i]] = message(r.reason, "문항을 불러오지 못했어요.");
        else if (!details[r.value.id]) { details[r.value.id] = r.value; got.push(r.value); }
      });
      return { ...prev, details, detailErrors, applications: patch(prev.applications, got) };
    });
  }, []);

  const open = ownerOf(state.applications, state.questionId);
  const missing = open?.questions.filter(q => !state.details[q.id] && !state.detailErrors[q.id]).map(q => q.id).join(",") ?? "";
  useEffect(() => {
    if (missing) void fetchMissing(missing.split(",").map(Number));
  }, [missing, fetchMissing]);

  /** 분석 중인 문항만 2초마다 — 한 문항의 실패가 다른 문항의 성공을 버리지 않는다.
   *  연속 3회 실패한 문항만 멈춘다. 탭 전환으로 횟수를 초기화하지 않는다 */
  const analyzing = state.applications.flatMap(a => a.questions)
    .filter(q => q.status === "ANALYZING" && (state.pollFailures[q.id] ?? 0) < MAX_POLL_FAILURES).map(q => q.id).join(",");
  useEffect(() => {
    if (!analyzing || state.error) return;
    const ids = analyzing.split(",").map(Number);
    let busy = false;
    let disposed = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      const version = generation.current;
      const results = await Promise.allSettled(ids.map(fetchQuestion));
      busy = false;
      if (disposed || version !== generation.current) return;
      commit(version, results.flatMap(r => r.status === "fulfilled" ? [r.value] : []));
      setState(prev => {
        const pollFailures = { ...prev.pollFailures };
        results.forEach((r, i) => {
          if (r.status === "rejected") pollFailures[ids[i]] = (pollFailures[ids[i]] ?? 0) + 1;
        });
        return { ...prev, pollFailures };
      });
    }, POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [analyzing, state.error, commit]);

  /** 넣기 · 더하기 · 다시 시도는 하나씩만 */
  const once = async <T,>(run: () => Promise<T>) => {
    if (pending.current) return null;
    pending.current = true;
    try { return await run(); } finally { pending.current = false; }
  };

  /** 저장한 뒤 다시 받기 — 번호표를 새로 뽑아 그보다 먼저 출발한 폴링 응답을 버린다.
   *  저장은 됐으니 다시 받기 실패는 입력 칸이 아니라 화면 오류(「다시 불러오기」)로 보인다 — 같은 것을 또 넣지 않게 */
  const reloadAfter = async (run: (version: number) => Promise<void>) => {
    const version = ++generation.current;
    try { await run(version); }
    catch (e) { if (version === generation.current) setState(prev => ({ ...prev, error: message(e, "지원을 불러오지 못했어요.") })); }
  };

  /** 탭 고르기 — 요청 없이 바로. 같은 탭이면 아무 일도 없다 */
  const selectQuestion = (id: number) => {
    if (id === state.questionId) return;
    keepInUrl(id);
    setState(prev => ({ ...prev, questionId: id }));
  };
  return {
    loading: state.loading,
    error: state.error,
    applications: state.applications,
    pollWarnings: state.applications.flatMap(a => a.questions.flatMap((q, index) => state.pollFailures[q.id]
      ? [{ id: q.id, label: `${a.organization || "지원처 이름 없음"} · 문항 ${index + 1}`, stopped: state.pollFailures[q.id] >= MAX_POLL_FAILURES }]
      : [])),
    /** 상태 확인만 다시 시작한다 — 서버의 분석을 다시 돌리거나 추천을 지우지 않는다 */
    resumePolling: (id: number) => setState(prev => { const pollFailures = { ...prev.pollFailures }; delete pollFailures[id]; return { ...prev, pollFailures }; }),
    questionId: state.questionId,
    open: open && { application: open, details: open.questions.map(q => state.details[q.id] ?? null) },
    /** 고른 문항을 못 받았을 때의 오류 */
    detailError: state.questionId !== null ? state.detailErrors[state.questionId] ?? null : null,
    /** 처음부터 다시 — 지원 목록부터 */
    refresh: () => { setState(prev => ({ ...prev, loading: true, error: null })); return load(); },
    /** 못 받은 문항 하나 다시 받기 — 오류를 지우면 위 효과가 다시 받는다 */
    reloadQuestion: (id: number) => setState(prev => { const detailErrors = { ...prev.detailErrors }; delete detailErrors[id]; return { ...prev, detailErrors }; }),
    selectQuestion,
    selectApplication: (application: Application) => selectQuestion(application.questions[0].id),
    submit: (req: CreateApplicationRequest) => once(async () => {
      const { questionIds } = await submitApplication(req);
      await reloadAfter(async version => {
        const [applications, fresh] = await Promise.all([fetchApplications(), Promise.all(questionIds.map(fetchQuestion))]);
        commit(version, fresh, { applications, questionId: questionIds[0] });
      });
      return true;
    }),
    addQuestion: (applicationId: number, text: string) => once(async () => {
      const { questionId } = await addApplicationQuestion(applicationId, { text });
      await reloadAfter(async version => commit(version, [await fetchQuestion(questionId)], { questionId }));
      return true;
    }),
    /** 되묻기에 답하기 — 저장한 뒤 이 지원의 문항을 다시 읽어 보완을 보인다(같은 경험이 다른 문항에도 추천됐을 수 있다).
     *  저장 실패는 부르는 쪽(입력 칸)에 그대로 던진다 */
    answer: async (questionId: number, clarificationId: number, answer: string) => {
      await answerClarification(clarificationId, { answer });
      const ids = (ownerOf(state.applications, questionId)?.questions ?? [{ id: questionId }]).map(q => q.id);
      await reloadAfter(async version => commit(version, await Promise.all(ids.map(fetchQuestion)), { keep: new Set(ids) }));
    },
    retry: (questionId: number) => once(async () => {
      const detail = await retryQuestion(questionId);
      commit(++generation.current, [detail]);
      return true;
    }),
  };
}
