"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { confirmAnswer, dismissNewFact, fetchQuestion, findNewFacts, saveNewFact } from "@/lib/api/questions";
import type { Answer, SaveNewFactRequest } from "@/lib/api/question-types";

type Failure = { message: string; action: "read" | "confirm" | "find"; text?: string };
const message = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했어요. 다시 시도해 주세요.";

/** 문항별로 마운트한다. 조회 재시도는 분석을 다시 시작하지 않는다. */
export function useConfirmedAnswer(questionId: number) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [initialText, setInitialText] = useState<string>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  const mounted = useRef(false), pending = useRef(false), initialized = useRef(false);
  const read = useCallback(async () => {
    const question = await fetchQuestion(questionId);
    if (!mounted.current) return;
    const saved = question.answer ?? null;
    setAnswer(saved); setFailure(null); setPollFailures(0);
    if (!initialized.current) {
      setInitialText(saved?.text); setReady(true); initialized.current = true;
    }
  }, [questionId]);
  useEffect(() => {
    mounted.current = true;
    void read().catch(e => { if (mounted.current) setFailure({ message: message(e), action: "read" }); });
    return () => { mounted.current = false; };
  }, [read]);

  useEffect(() => {
    if (answer?.newFacts?.status !== "ANALYZING" || busy || pollFailures >= 3) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const q = await fetchQuestion(questionId);
        if (!disposed) { setAnswer(q.answer ?? null); setFailure(null); setPollFailures(0); }
      } catch (e) {
        if (!disposed) { setFailure({ message: message(e), action: "read" }); setPollFailures(n => n + 1); }
      }
    }, 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [answer, busy, pollFailures, questionId]);

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFailure(null);
    try { await action(); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const find = async () => {
    try {
      const saved = await findNewFacts(questionId);
      if (mounted.current) { setAnswer(saved); setPollFailures(0); }
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.code === "NEW_FACTS_IN_PROGRESS") {
        try { await read(); } catch (error) { if (mounted.current) setFailure({ message: message(error), action: "read" }); }
        return;
      }
      setFailure({ message: e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED"
        ? "답은 확정됐어요 · 오늘 분석 횟수를 다 썼어요."
        : "답은 확정됐어요 · " + message(e), action: "find" });
    }
  };
  const confirm = (text: string) => run(async () => {
    try {
      const saved = await confirmAnswer(questionId, text);
      if (mounted.current) setAnswer(saved);
      // 문항을 떠났어도 확정 한 번의 후보 찾기는 끝까지 시작한다.
      await find();
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
  const decide = (id: number, data?: SaveNewFactRequest) => run(async () => {
    try {
      const experience = data ? await saveNewFact(id, data) : (await dismissNewFact(id), null);
      if (!mounted.current) return;
      setAnswer(prev => prev?.newFacts ? { ...prev, newFacts: { ...prev.newFacts, candidates: prev.newFacts.candidates.map(c => c.id === id
        ? { ...c, status: experience ? "SAVED" : "DISMISSED", experienceId: experience?.id ?? null, activityId: experience?.activityId ?? c.activityId, ...(data ? { content: data.content, actor: data.actor } : {}) } : c) } } : prev);
    } catch (e) {
      // 다른 탭에서 결정했거나 다시 확정해 사라진 후보는 최신 상태를 읽는다.
      if (e instanceof ApiError && ["NEW_FACT_ALREADY_DECIDED", "NEW_FACT_NOT_FOUND"].includes(e.code)) {
        try { await read(); } catch (error) { if (mounted.current) setFailure({ message: message(error), action: "read" }); }
      }
      throw e;
    }
  });
  return { answer, initialText, ready, busy, failure, pollFailures, confirm, refresh, retryFind, decide };
}
