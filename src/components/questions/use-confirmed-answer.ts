"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { confirmAnswer, dismissNewFact, fetchQuestion, findNewFacts, saveNewFact } from "@/lib/api/questions";
import type { Answer, SaveNewFactRequest } from "@/lib/api/question-types";

/** limit — 오늘 한도를 다 써서 실패했다. 다시 찾기를 보이지 않는다(FE#391) */
type Failure = { message: string; action: "read" | "confirm" | "find"; text?: string; limit?: boolean };
const message = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했어요. 다시 시도해 주세요.";

/** 문항별로 마운트한다. 조회 재시도는 분석을 다시 시작하지 않는다.
 *  saved 는 화면이 받아 둔 문항의 답이다 — 탭 전환에 요청을 더 보내지 않는다(FE#60). 바뀐 답은 onChange 로 돌려준다.
 *  답칸(확정)과 차곡이 패널(후보 찾기 · 고르기 — FE#270)이 따로 마운트하므로 답은 늘 saved 를 따른다. 진행 중 확인(poll)은 답칸 한 곳만 한다 */
export function useConfirmedAnswer(questionId: number, saved: Answer | null, onChange: (id: number, answer: Answer | null) => void, { poll = true } = {}) {
  const answer = saved;
  const [initialText] = useState(saved?.text);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  const mounted = useRef(false), pending = useRef(false), latest = useRef(saved);
  useEffect(() => { latest.current = saved; }, [saved]);
  const keep = useCallback((next: Answer | null) => {
    latest.current = next;
    onChange(questionId, next);
  }, [onChange, questionId]);
  const read = useCallback(async () => {
    const question = await fetchQuestion(questionId);
    keep(question.answer ?? null);
    if (mounted.current) { setFailure(null); setPollFailures(0); }
  }, [questionId, keep]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!poll || answer?.newFacts?.status !== "ANALYZING" || busy || pollFailures >= 3) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const q = await fetchQuestion(questionId);
        if (!disposed) { keep(q.answer ?? null); setFailure(null); setPollFailures(0); }
      } catch (e) {
        if (!disposed) { setFailure({ message: message(e), action: "read" }); setPollFailures(n => n + 1); }
      }
    }, 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [poll, answer, busy, pollFailures, questionId, keep]);

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFailure(null);
    try { await action(); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const find = async () => {
    try {
      keep(await findNewFacts(questionId));
      if (mounted.current) setPollFailures(0);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.code === "NEW_FACTS_IN_PROGRESS") {
        try { await read(); } catch (error) { if (mounted.current) setFailure({ message: message(error), action: "read" }); }
        return;
      }
      setFailure({ message: e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED"
        ? "답은 저장했어요 · 오늘 분석 횟수를 다 썼어요."
        : "답은 저장했어요 · " + message(e), action: "find", limit: e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED" });
    }
  };
  /** 「다 썼어요」는 저장만 한다 — 후보 찾기는 사용자가 따로 누른다(ETC#250 · 분석 횟수를 쓰지 않는다).
   *  onConfirmed — 확정이 서버에 들어간 뒤(그 문항의 임시 글은 서버가 지웠다 · S-72) */
  const confirm = (text: string, onConfirmed?: () => void) => run(async () => {
    try {
      keep(await confirmAnswer(questionId, text));
      onConfirmed?.();
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.code === "NEW_FACTS_IN_PROGRESS") {
        try { await read(); } catch (error) { if (mounted.current) setFailure({ message: message(error), action: "read" }); }
      } else setFailure({ message: message(e), action: "confirm", text });
    }
  });
  const refresh = () => run(async () => {
    try { await read(); } catch (e) { if (mounted.current) setFailure({ message: message(e), action: "read" }); }
  });
  const retryFind = () => run(async () => {
    try { await find(); } catch (e) { if (mounted.current) setFailure({ message: message(e), action: "read" }); }
  });
  /** activityName — 저장한 활동 이름. 새 활동이면 그 이름(응답엔 이름이 없다 — 계약) */
  const decide = (id: number, data?: SaveNewFactRequest, activityName?: string) => run(async () => {
    try {
      const experience = data ? await saveNewFact(id, data) : (await dismissNewFact(id), null);
      const prev = latest.current;
      if (prev?.newFacts) keep({ ...prev, newFacts: { ...prev.newFacts, candidates: prev.newFacts.candidates.map(c => c.id === id
        ? { ...c, status: experience ? "SAVED" : "DISMISSED", experienceId: experience?.id ?? null, activityId: experience?.activityId ?? c.activityId, activityName: experience ? activityName ?? c.activityName : c.activityName, ...(data ? { content: data.content, actor: data.actor } : {}) } : c) } });
    } catch (e) {
      // 다른 탭에서 결정했거나 다시 확정해 사라진 후보는 최신 상태를 읽는다.
      if (e instanceof ApiError && ["NEW_FACT_ALREADY_DECIDED", "NEW_FACT_NOT_FOUND"].includes(e.code)) {
        try { await read(); } catch (error) { if (mounted.current) setFailure({ message: message(error), action: "read" }); }
      }
      throw e;
    }
  });
  return { answer, initialText, busy, failure, pollFailures, confirm, refresh, retryFind, decide };
}
