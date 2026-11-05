"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { createGroundingCheck, fetchGroundingCheck } from "@/lib/api/questions";
import type { GroundingCheck } from "@/lib/api/question-types";

type Failure = { message: string; retryText?: string };
function message(e: unknown) {
  const labels: Record<string, string> = {
    DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 기존 점검은 그대로예요.",
    GROUNDING_CHECK_IN_PROGRESS: "이미 근거를 점검하고 있어요. 서버의 상태를 다시 확인해 주세요.",
    QUESTION_NOT_FOUND: "이 문항을 찾을 수 없어요. 지원 목록에서 다시 확인해 주세요.",
  };
  return e instanceof ApiError ? labels[e.code] ?? e.message : e instanceof Error ? e.message : "근거 점검을 처리하지 못했어요.";
}

/** S-45: 추천 작업과 별도로 조회한다. 재시도는 글을 보존하고, 상태 조회 실패는 POST로 바꾸지 않는다. */
export function useGroundingCheck(questionId: number, initialText?: string) {
  const restoredText = useRef(initialText);
  const [text, setText] = useState("");
  const [check, setCheck] = useState<GroundingCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const version = useRef(0);

  const read = useCallback(async () => {
    const ticket = ++version.current;
    const saved = await fetchGroundingCheck(questionId);
    if (!mounted.current || ticket !== version.current) return;
    setCheck(saved);
    if (!initialized.current) {
      setText(restoredText.current ?? saved?.text ?? "");
      initialized.current = true; setReady(true);
    }
    setLoading(false);
    setFailure(null);
    setPollFailures(0);
  }, [questionId]);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    void read().catch(e => {
      if (!disposed && mounted.current) { setLoading(false); setFailure({ message: message(e) }); }
    });
    return () => { disposed = true; mounted.current = false; };
  }, [read]);

  useEffect(() => {
    if (check?.status !== "ANALYZING" || pollFailures >= 3 || busy) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const saved = await fetchGroundingCheck(questionId);
        if (disposed) return;
        setCheck(saved); setFailure(null); setPollFailures(0);
      } catch (e) {
        if (disposed) return;
        setFailure({ message: message(e) });
        setPollFailures(n => n + 1);
      }
    }, 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [check, pollFailures, busy, questionId]);

  const refresh = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await read(); }
    catch (e) { if (mounted.current) setFailure({ message: message(e) }); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = async (submittedText: string) => {
    if (pending.current || loading || !initialized.current || check?.status === "ANALYZING") return;
    pending.current = true; ++version.current; setBusy(true); setFailure(null);
    try {
      const saved = await createGroundingCheck(questionId, { text: submittedText });
      if (mounted.current) { setCheck(saved); setPollFailures(0); }
    } catch (e) {
      if (!mounted.current) return;
      // 409는 다른 탭에서 시작한 작업이다. GET만 재시도해 중복 분석을 막는다.
      if (e instanceof ApiError && e.code === "GROUNDING_CHECK_IN_PROGRESS") {
        try { await read(); }
        catch (readError) { if (mounted.current) setFailure({ message: message(readError) }); }
      } else setFailure({ message: message(e), retryText: submittedText });
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return { text, setText, check, loading, busy, failure, pollFailures, initialized: ready, submit, refresh };
}
