"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { createGroundingCheck, fetchGroundingCheck } from "@/lib/api/questions";
import type { GroundingCheck } from "@/lib/api/question-types";

/** limit — 오늘 한도를 다 써서 실패했다. 다시 시도를 보이지 않는다(FE#391) */
type Failure = { message: string; retryText?: string; limit?: boolean };
function message(e: unknown) {
  const labels: Record<string, string> = {
    DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워져요.",
    GROUNDING_CHECK_IN_PROGRESS: "이미 근거를 점검하고 있어요. 서버의 상태를 다시 확인해 주세요.",
    QUESTION_NOT_FOUND: "이 문항을 찾을 수 없어요. 지원 목록에서 다시 확인해 주세요.",
  };
  return e instanceof ApiError ? labels[e.code] ?? e.message : e instanceof Error ? e.message : "근거 점검을 처리하지 못했어요.";
}

/** 지원 화면이 살아 있는 동안 끝난 점검을 문항별로 들고 있는다(FE#150). 점검 전(null)도 읽은 결과다.
 *  분석 중은 담지 않는다 — 돌아오면 다시 읽어 폴링을 잇는다. 화면을 떠나면 사라져 근거가 바뀐 경험은 새로 읽는다 */
export function createGroundingChecks() {
  const kept = new Map<number, GroundingCheck | null>();
  return {
    has: (id: number) => kept.has(id),
    get: (id: number) => kept.get(id) ?? null,
    keep(id: number, check: GroundingCheck | null) {
      if (check?.status === "ANALYZING") kept.delete(id); else kept.set(id, check);
    },
    forget: (id: number) => { kept.delete(id); },
  };
}
export type GroundingChecks = ReturnType<typeof createGroundingChecks>;

/** S-45: 추천 작업과 별도로 조회한다. 재시도는 글을 보존하고, 상태 조회 실패는 POST로 바꾸지 않는다.
 *  이미 읽은 문항은 checks 로 바로 시작해 탭 전환에 요청을 보내지 않는다(FE#150) */
export function useGroundingCheck(questionId: number, checks: GroundingChecks, initialText?: string) {
  const restoredText = useRef(initialText);
  const [cached] = useState(() => checks.has(questionId));
  const [text, setText] = useState(() => cached ? initialText ?? checks.get(questionId)?.text ?? "" : "");
  const [check, setCheck] = useState<GroundingCheck | null>(() => checks.get(questionId));
  const [loading, setLoading] = useState(!cached);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const initialized = useRef(cached);
  const [ready, setReady] = useState(cached);
  const version = useRef(0);

  const read = useCallback(async () => {
    const ticket = ++version.current;
    const saved = await fetchGroundingCheck(questionId);
    if (ticket !== version.current) return;
    checks.keep(questionId, saved);
    if (!mounted.current) return;
    setCheck(saved);
    if (!initialized.current) {
      setText(restoredText.current ?? saved?.text ?? "");
      initialized.current = true; setReady(true);
    }
    setLoading(false);
    setFailure(null);
    setPollFailures(0);
  }, [questionId, checks]);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    if (!cached) void read().catch(e => {
      if (!disposed && mounted.current) { setLoading(false); setFailure({ message: message(e) }); }
    });
    return () => { disposed = true; mounted.current = false; };
  }, [read, cached]);

  useEffect(() => {
    if (check?.status !== "ANALYZING" || pollFailures >= 3 || busy) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const saved = await fetchGroundingCheck(questionId);
        if (disposed) return;
        checks.keep(questionId, saved);
        setCheck(saved); setFailure(null); setPollFailures(0);
      } catch (e) {
        if (disposed) return;
        setFailure({ message: message(e) });
        setPollFailures(n => n + 1);
      }
    }, 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [check, pollFailures, busy, questionId, checks]);

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
    // 응답 전에 떠났다 돌아와도 낡은 결과로 시작하지 않게 먼저 지운다. 실패하면 다시 읽어 맞춘다
    checks.forget(questionId);
    try {
      const saved = await createGroundingCheck(questionId, { text: submittedText });
      checks.keep(questionId, saved);
      if (mounted.current) { setCheck(saved); setPollFailures(0); }
    } catch (e) {
      if (!mounted.current) return;
      // 409는 다른 탭에서 시작한 작업이다. GET만 재시도해 중복 분석을 막는다.
      if (e instanceof ApiError && e.code === "GROUNDING_CHECK_IN_PROGRESS") {
        try { await read(); }
        catch (readError) { if (mounted.current) setFailure({ message: message(readError) }); }
      } else setFailure({ message: message(e), retryText: submittedText, limit: e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED" });
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return { text, setText, check, loading, busy, failure, pollFailures, initialized: ready, submit, refresh };
}
