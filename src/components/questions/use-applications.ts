"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addApplicationQuestion, answerClarification, createQuestionDraft, deleteApplication, deleteQuestion, fetchApplications, fetchQuestion, retryQuestion, submitApplication, updateApplication, updateQuestionTargetLength, updateQuestionText, updateQuestionType } from "@/lib/api/questions";
import { ApiError } from "@/lib/api/errors";
import type { DraftFrame } from "@/lib/draft-frames";
import type { Answer, AnswerDraft, Application, CreateApplicationRequest, QuestionDetail, QuestionSummary, QuestionType, UpdateApplicationRequest } from "@/lib/api/question-types";

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
  /** 문항 0개 지원(공고만, S-18)을 열었을 때 그 지원 — 문항을 고르면 questionId 가 먼저다 */
  applicationId: number | null;
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
/** 변경 기록의 「지원으로 가기」처럼 문항을 모르고 지원만 알 때 `?application=` — `?question=` 이 있으면 그쪽이 먼저 */
function applicationInUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get("application"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function keepInUrl(id: number) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("question") === String(id)) return;
  url.searchParams.set("question", String(id)); url.searchParams.delete("application");
  window.history.replaceState(window.history.state, "", url);
}
/** 문항 0개 지원(S-18)은 `?application=` 으로 둔다 — 새로고침해도 그 지원 */
function keepApplicationInUrl(id: number) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("application") === String(id) && !url.searchParams.has("question")) return;
  url.searchParams.set("application", String(id)); url.searchParams.delete("question");
  window.history.replaceState(window.history.state, "", url);
}
/** 지운 지원 · 문항을 가리키는 주소를 바로잡는다(S-89) — 남은 문항이 없으면 `?question=` · `?application=` 을 지워 새로고침이 「문항을 불러오지 못했어요」가 되지 않게 */
function moveUrlTo(id: number | null) {
  if (id !== null) { keepInUrl(id); return; }
  const url = new URL(window.location.href);
  url.searchParams.delete("question"); url.searchParams.delete("application");
  window.history.replaceState(window.history.state, "", url);
}

const summaryOf = ({ id, applicationId, organization, text, questionType, questionTypeBy, targetLength, status, createdAt }: QuestionDetail): QuestionSummary =>
  ({ id, applicationId, organization, text, questionType, questionTypeBy, targetLength, status, createdAt });
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
 *  - 되묻기 답 · 문항 더하기 · 넣기 · 다시 시도 뒤에 다시 받는다. 그보다 먼저 출발한 폴링 응답은 번호표(generation)로 버린다
 *  - `composingAtStart` — 새 지원서 작성으로 들어왔는가(첫 값만 본다). 이때는 처음 받은 뒤에도 주소의 `?question=` 을 건드리지 않는다 */
export function useApplications(composingAtStart = false) {
  const composingAtStartRef = useRef(composingAtStart);
  const [state, setState] = useState<State>({ loading: true, applications: [], details: {}, detailErrors: {}, pollFailures: {}, questionId: null, applicationId: null, error: null });
  const generation = useRef(0);
  const pending = useRef(false);
  const fetching = useRef(new Set<number>());
  const drafting = useRef(new Set<number>());
  const answering = useRef(new Set<number>());
  const [draftingIds, setDraftingIds] = useState<number[]>([]);
  const [answeringIds, setAnsweringIds] = useState<number[]>([]);
  const mounted = useRef(false);

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

  /** 답 칸이 바꾼 확정 답을 받아 둔 문항에 옮긴다 — 탭을 돌아와도 요청 없이 맞게. 먼저 출발한 폴링 응답(옛 답)은 번호표로 버린다 */
  const keepAnswer = useCallback((id: number, answer: Answer | null) => {
    ++generation.current;
    setState(prev => {
      const kept = prev.details[id];
      return kept ? { ...prev, details: { ...prev.details, [id]: { ...kept, answer } } } : prev;
    });
  }, []);

  /** 답칸이 자동 저장한 임시 글(S-72)을 받아 둔 문항에 옮긴다 — 탭을 돌아와도 요청 없이 새 글로 시작하게. 확정하면 null */
  const keepAnswerDraft = useCallback((id: number, answerDraft: AnswerDraft | null) => {
    setState(prev => {
      const kept = prev.details[id];
      return kept ? { ...prev, details: { ...prev.details, [id]: { ...kept, answerDraft } } } : prev;
    });
  }, []);

  /** 처음 들어올 때 · 「다시 불러오기」 — 지원 목록과 주소의 문항을 동시에 받는다. 같은 지원의 나머지 문항은 아래 효과가 이어 받는다 */
  const loading = useRef(false);
  const load = useCallback(async () => {
    const version = ++generation.current;
    loading.current = true;
    try {
      const wanted = questionInUrl();
      const [applications, first] = await Promise.all([fetchApplications(), wanted ? fetchQuestion(wanted).catch(() => null) : null]);
      if (version !== generation.current) return;
      const composingStart = composingAtStartRef.current;
      composingAtStartRef.current = false;
      const wantedApplication = applicationInUrl();
      const application = ownerOf(applications, wanted) ?? applications.find(a => a.id === wantedApplication) ?? applications[0] ?? null;
      if (wanted && !first && !ownerOf(applications, wanted)) throw new ApiError("QUESTION_NOT_FOUND", "알림의 문항을 불러오지 못했어요. 다시 불러와 주세요.");
      const questionId = (application?.questions.find(q => q.id === wanted) ?? application?.questions[0])?.id ?? null;
      const applicationId = questionId === null && application ? application.id : null;
      // 「새 지원서」로 들어왔으면(`?new=1`, FE#147) 작성 중이다 — 첫 지원서를 골라 주소를 `?question=` 으로 덮지 않는다(FE#374)
      if (questionId !== null && !composingStart) keepInUrl(questionId);
      if (applicationId !== null && !composingStart) keepApplicationInUrl(applicationId);
      const details = first && first.id === questionId ? { [first.id]: first } : {};
      setState({ loading: false, applications: patch(applications, Object.values(details)), details, detailErrors: {}, pollFailures: {}, questionId, applicationId, error: null });
    } catch (e) {
      if (version === generation.current) setState(prev => ({ ...prev, loading: false, error: message(e, "지원을 불러오지 못했어요.") }));
    } finally {
      if (version === generation.current) loading.current = false;
    }
  }, []);
  /** 「새 지원서」(`?new=1`)를 받았다 — 숨겨 둔 화면이 다시 보이며 목록을 다시 받는 중이어도 그 결과로 주소를 `?question=` 으로 덮지 않는다(FE#412).
   *  받는 중이 아니면 표시하지 않는다 — 다음 「다시 불러오기」가 주소를 못 고치는 일이 없게 */
  const keepComposing = useCallback(() => { if (loading.current) composingAtStartRef.current = true; }, []);

  /** 화면을 떠나면 오가던 응답을 버린다 */
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; invalidate(); };
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

  const open = ownerOf(state.applications, state.questionId)
    ?? (state.questionId === null ? state.applications.find(a => a.id === state.applicationId) ?? null : null);
  const missing = open?.questions.filter(q => !state.details[q.id] && !state.detailErrors[q.id]).map(q => q.id).join(",") ?? "";
  useEffect(() => {
    if (missing) void fetchMissing(missing.split(",").map(Number));
  }, [missing, fetchMissing]);

  /** 분석 중인 문항만 2초마다 — 한 문항의 실패가 다른 문항의 성공을 버리지 않는다.
   *  연속 3회 실패한 문항만 멈춘다. 탭 전환으로 횟수를 초기화하지 않는다 */
  const analyzing = state.applications.flatMap(a => a.questions)
    .filter(q => (q.status === "ANALYZING" || state.details[q.id]?.draft?.status === "ANALYZING")
      && (state.pollFailures[q.id] ?? 0) < MAX_POLL_FAILURES).map(q => q.id).join(",");
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
    keepComposing,
    loading: state.loading,
    savingAnswer: state.questionId !== null && answeringIds.includes(state.questionId),
    requestingDraft: state.questionId !== null && draftingIds.includes(state.questionId),
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
    keepAnswer,
    keepAnswerDraft,
    selectQuestion,
    /** S-47: work.applicationId가 null이어도 questionId로 문항을 찾는다. */
    openLinkedQuestion: async (id: number) => {
      if (state.applications.some(a => a.questions.some(q => q.id === id))) { selectQuestion(id); return; }
      await load();
    },
    selectApplication: (application: Application) => {
      if (application.questions[0]) { selectQuestion(application.questions[0].id); return; }
      keepApplicationInUrl(application.id);
      setState(prev => ({ ...prev, questionId: null, applicationId: application.id }));
    },
    /** 문항 응답만 다시 읽는다. 초안 전용 GET/재시도 API나 별도 저장소는 없다. */
    refreshDraft: async (id: number) => {
      const version = ++generation.current;
      const fresh = await fetchQuestion(id);
      if (mounted.current) commit(version, [fresh]);
    },
    createDraft: async (question: QuestionDetail, experienceIds: number[], frame?: DraftFrame, useContext?: boolean) => {
      if (drafting.current.has(question.id)) throw new ApiError("DRAFT_IN_PROGRESS", "이미 초안을 만들고 있어요.", 409);
      if (answering.current.has(question.id)) throw new ApiError("ANSWER_IN_PROGRESS", "보완을 쌓는 중이에요. 답 저장이 끝나면 다시 만들어 주세요.");
      drafting.current.add(question.id);
      setDraftingIds([...drafting.current]);
      try {
        const draft = await createQuestionDraft(question, { experienceIds, frame, useContext });
        if (!mounted.current) return;
        // 먼저 출발한 GET은 버리고, POST 응답의 draft만 옮겨 기존 추천·보완은 보존한다.
        ++generation.current;
        setState(prev => {
          const previous = prev.details[question.id];
          if (!previous) return prev;
          const pollFailures = { ...prev.pollFailures }; delete pollFailures[question.id];
          return { ...prev, pollFailures, details: { ...prev.details, [question.id]: { ...previous, draft } } };
        });
      } catch (e) {
        if (e instanceof ApiError && e.code === "DRAFT_IN_PROGRESS" && mounted.current) {
          const version = ++generation.current;
          const fresh = await fetchQuestion(question.id);
          if (mounted.current) commit(version, [fresh]);
        }
        throw e;
      } finally { drafting.current.delete(question.id); setDraftingIds([...drafting.current]); }
    },
    submit: (req: CreateApplicationRequest) => once(async () => {
      const { applicationId, questionIds } = await submitApplication(req);
      await reloadAfter(async version => {
        const [applications, fresh] = await Promise.all([fetchApplications(), Promise.all(questionIds.map(fetchQuestion))]);
        if (questionIds.length) { commit(version, fresh, { applications, questionId: questionIds[0] }); return; }
        // 문항 0개(공고만) — 그 지원을 연다. 공고 탭은 지원 화면이 그린다(FE#496)
        commit(version, [], { applications });
        if (version !== generation.current) return;
        keepApplicationInUrl(applicationId);
        setState(prev => ({ ...prev, questionId: null, applicationId }));
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
      if (answering.current.has(questionId)) throw new ApiError("ANSWER_IN_PROGRESS", "보완을 쌓는 중이에요. 잠시만 기다려 주세요.");
      if (drafting.current.has(questionId)) throw new ApiError("DRAFT_IN_PROGRESS", "초안을 만드는 중이에요. 완료한 뒤에 답해 주세요.");
      answering.current.add(questionId); setAnsweringIds([...answering.current]);
      try {
        await answerClarification(clarificationId, { answer });
        const ids = (ownerOf(state.applications, questionId)?.questions ?? [{ id: questionId }]).map(q => q.id);
        await reloadAfter(async version => commit(version, await Promise.all(ids.map(fetchQuestion)), { keep: new Set(ids) }));
      } finally { answering.current.delete(questionId); setAnsweringIds([...answering.current]); }
    },
    /** 지원처 이름(S-73) · 종류 · 직무(S-42) · 상태(S-36) · 낸 달(S-37) 바꾸기 — 추천은 다시 돌지 않아 지원 칸만 바꾼다.
     *  낸 달은 BE 가 상태에 맞춰 정할 수 있어 응답 값을 그대로 옮긴다. 실패는 부르는 쪽(칸)에 던진다 */
    updateApplication: async (applicationId: number, req: UpdateApplicationRequest) => {
      const saved = await updateApplication(applicationId, req);
      setState(prev => ({ ...prev, applications: prev.applications.map(a => a.id === applicationId
        ? { ...a, organization: saved.organization, organizationType: saved.organizationType ?? null, jobRole: saved.jobRole ?? null, applicationStatus: saved.applicationStatus, submittedMonth: saved.submittedMonth } : a) }));
    },
    /** 문항 유형 고치기(S-41) — 분석 중 · 실패여도 된다. 먼저 출발한 폴링 응답(옛 유형)은 번호표로 버린다. 실패는 부르는 쪽에 던진다 */
    updateQuestionType: async (questionId: number, questionType: QuestionType) => {
      ++generation.current;
      const saved = await updateQuestionType(questionId, questionType);
      setState(prev => {
        const kept = prev.details[questionId];
        // 응답은 문항 전체지만 유형만 바뀐 것 — 받아 둔 추천이 있으면 그대로 두고 유형만 옮긴다
        const detail = kept ? { ...kept, questionType: saved.questionType, questionTypeBy: saved.questionTypeBy } : saved;
        return { ...prev, details: { ...prev.details, [questionId]: detail }, applications: patch(prev.applications, [detail]) };
      });
    },
    /** 목표 글자 수(S-77) — 유형과 같이 칸만 옮긴다. 실패는 부르는 쪽에 던진다 */
    updateTargetLength: async (questionId: number, targetLength: number | null) => {
      ++generation.current;
      const saved = await updateQuestionTargetLength(questionId, targetLength);
      setState(prev => {
        const kept = prev.details[questionId];
        const detail = kept ? { ...kept, targetLength: saved.targetLength ?? null } : saved;
        return { ...prev, details: { ...prev.details, [questionId]: detail }, applications: patch(prev.applications, [detail]) };
      });
    },
    /** 문항 글 고치기(S-89) — 202 ANALYZING 응답을 그대로 옮긴다(초안 · 근거 점검은 null). 분석 중이면 위 폴링이 잇는다. 실패는 부르는 쪽(창)에 던진다 */
    updateQuestionText: async (questionId: number, text: string) => {
      ++generation.current;
      const saved = await updateQuestionText(questionId, text);
      commit(++generation.current, [saved]);
    },
    /** 지원 지우기(S-89) — 지운 지원과 그 문항을 목록 · 받아 둔 문항에서 뺀다. 연 지원이었으면 남은 첫 지원을 연다. 실패는 부르는 쪽에 던진다 */
    deleteApplication: async (applicationId: number) => {
      await deleteApplication(applicationId);
      ++generation.current;
      const gone = state.applications.find(a => a.id === applicationId);
      const rest = state.applications.filter(a => a.id !== applicationId);
      const wasOpen = !!gone?.questions.some(q => q.id === state.questionId) || (state.questionId === null && state.applicationId === applicationId);
      const next = wasOpen ? rest[0]?.questions[0]?.id ?? null : state.questionId;
      if (wasOpen) moveUrlTo(next);
      setState(prev => {
        const details = { ...prev.details };
        gone?.questions.forEach(q => { delete details[q.id]; });
        return { ...prev, applications: prev.applications.filter(a => a.id !== applicationId), details, questionId: wasOpen ? next : prev.questionId, applicationId: wasOpen ? null : prev.applicationId };
      });
    },
    /** 문항 지우기(S-89) — 그 지원에서 문항을 빼고, 고른 문항이었으면 바로 앞(첫 문항이면 다음) 문항을 고른다. 실패는 부르는 쪽에 던진다 */
    deleteQuestion: async (questionId: number) => {
      await deleteQuestion(questionId);
      ++generation.current;
      const owner = ownerOf(state.applications, questionId);
      const index = owner?.questions.findIndex(q => q.id === questionId) ?? -1;
      const left = owner?.questions.filter(q => q.id !== questionId) ?? [];
      const next = state.questionId === questionId ? left[Math.max(0, index - 1)]?.id ?? null : state.questionId;
      if (state.questionId === questionId) moveUrlTo(next);
      setState(prev => {
        const details = { ...prev.details }; delete details[questionId];
        const applications = prev.applications.map(a => a.id === owner?.id ? { ...a, questions: a.questions.filter(q => q.id !== questionId) } : a);
        return { ...prev, applications, details, questionId: next };
      });
    },
    retry: (questionId: number) => once(async () => {
      const detail = await retryQuestion(questionId);
      commit(++generation.current, [detail]);
      return true;
    }),
  };
}
