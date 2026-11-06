"use client";

import { useEffect, useRef, useState } from "react";
import { cancelChagokRun, confirmChagokRun, fetchChagokRun, findRunningChagokRun, startChagokRun, type ChagokRun } from "@/lib/api/chagok";
import { ApiError } from "@/lib/api/errors";

const POLL_MS = 1000;
const MAX_POLL_FAILURES = 5;

type Ask = { text: string; questionId: number | null };
type Failure = { code: string; message: string };
const WHY: Record<string, string> = {
  AI_UNAVAILABLE: "AI 서버에 연결하지 못했어요.",
  AI_TIMEOUT: "일이 너무 오래 걸려서 멈췄어요.",
  LLM_TIMEOUT: "AI 응답이 너무 오래 걸렸어요.",
  LLM_ERROR: "AI 가 답하지 못했어요.",
  MCP_UNAVAILABLE: "쌓인 경험을 읽지 못했어요.",
  INTERNAL_ERROR: "서버에서 일을 마치지 못했어요.",
  TOO_MANY_STEPS: "단계가 너무 많아 멈췄어요. 부탁을 좁혀 보세요.",
  INVALID_AGENT_OUTPUT: "AI 가 올바른 결과를 돌려주지 않았어요.",
  DAILY_LIMIT_EXCEEDED: "오늘 쓸 수 있는 분석을 다 썼어요.",
  QUESTION_NOT_FOUND: "이 문항을 찾지 못했어요.",
};
export const whyFailed = (error: Failure | null) => (error && WHY[error.code]) ?? error?.message ?? "일을 마치지 못했어요.";
const errorOf = (e: unknown): Failure => e instanceof ApiError ? { code: e.code, message: e.message } : { code: "UNKNOWN", message: "요청을 처리하지 못했어요." };

/** 차곡이 일 하나(S-31) — 시트를 닫아도 이어지게 패널 밖(지원 화면)에 둔다. 쓴 글도 여기 있어 패널을 닫았다 열어도 남는다 */
export function useChagokRun(questionId: number | null, restoreId: number | null = null) {
  const [run, setRun] = useState<ChagokRun | null>(null);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  /** 부탁을 보내지 못했다(429 등) — 쓴 글은 입력칸에 남는다 */
  const [failure, setFailure] = useState<{ ask: Ask; error: Failure } | null>(null);
  /** 409 RUN_IN_PROGRESS — 그만두고 새로 시작 / 기다리기를 묻는 중(S-47) */
  const [conflict, setConflict] = useState<Ask | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [acting, setActing] = useState<"confirm" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [poll, setPoll] = useState<{ state: "ok" | "retrying" | "stopped"; round: number }>({ state: "ok", round: 0 });
  const pending = useRef(false);
  const [restoreFailure, setRestoreFailure] = useState<{ id: number; message: string } | null>(null);
  const [restoredFor, setRestoredFor] = useState<number | null>(null);
  const restoreError = restoreFailure?.id === restoreId ? restoreFailure.message : null;
  const [restoreRound, setRestoreRound] = useState(0);
  useEffect(() => {
    if (restoreId === null) return;
    let alive = true;
    // S-47: ID로 읽기만 한다. WAITING_CONFIRM도 자동 승인하지 않는다.
    fetchChagokRun(restoreId).then(next => {
      if (alive) { setRun(next); setRestoredFor(restoreId); setRestoreFailure(null); }
    }, e => { if (alive) setRestoreFailure({ id: restoreId, message: errorOf(e).message }); });
    return () => { alive = false; };
  }, [restoreId, restoreRound]);
  const restoring = restoreId !== null && restoredFor !== restoreId && restoreError === null;

  const runId = run?.runId;
  const running = run?.status === "RUNNING";
  useEffect(() => {
    if (!running || runId === undefined) return;
    let alive = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await fetchChagokRun(runId);
        if (!alive) return;
        failures = 0;
        setRun(next);
        setPoll(p => ({ ...p, state: "ok" }));
        if (next.status === "RUNNING") timer = setTimeout(read, POLL_MS);
      } catch {
        if (!alive) return;
        failures += 1;
        const stopped = failures >= MAX_POLL_FAILURES;
        setPoll(p => ({ ...p, state: stopped ? "stopped" : "retrying" }));
        if (!stopped) timer = setTimeout(read, POLL_MS);
      }
    };
    void read();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId, running, poll.round]);

  const begin = async (ask: Ask) => {
    try {
      const id = await startChagokRun(ask.text, ask.questionId);
      setRun({ runId: id, ...ask, status: "RUNNING", steps: [], result: null, error: null });
      setPoll(p => ({ ...p, state: "ok" }));
      setActionError(null);
      setConflict(null);
      setDraft(current => current.trim() === ask.text ? "" : current);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RUN_IN_PROGRESS") setConflict(ask);
      else { setConflict(null); setFailure({ ask, error: errorOf(e) }); }
    }
  };
  const guarded = async (work: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setStarting(true);
    setFailure(null);
    setConflictError(null);
    try { await work(); } finally { pending.current = false; setStarting(false); }
  };
  const send = async (text: string) => {
    const value = text.trim();
    if (value && !restoring && !restoreError) await guarded(() => begin({ text: value, questionId }));
  };
  const retry = async () => {
    const ask = failure?.ask ?? (run ? { text: run.text, questionId: run.questionId } : null);
    if (ask) await guarded(() => begin(ask));
  };
  /** 그새 끝났으면 cancel 없이 그대로 시작한다. 또 409 면 begin 이 다시 묻는다 */
  const restart = async () => {
    const ask = conflict;
    if (!ask) return;
    await guarded(async () => {
      try {
        const current = await findRunningChagokRun();
        if (current !== null) await cancelChagokRun(current);
      } catch (e) { setConflictError(errorOf(e).message); return; }
      await begin(ask);
    });
  };
  /** 도는 일을 패널에서 지켜본다. 쓴 글은 입력칸에 그대로다 */
  const wait = async () => {
    if (run?.status === "RUNNING") { setConflict(null); return; }
    await guarded(async () => {
      try {
        const current = await findRunningChagokRun();
        if (current !== null) setRun(await fetchChagokRun(current));
        setConflict(null);
      } catch (e) { setConflictError(errorOf(e).message); }
    });
  };
  const act = async (kind: "confirm" | "cancel") => {
    if (!run || pending.current || restoring || restoreError) return;
    pending.current = true;
    setActing(kind);
    setActionError(null);
    try {
      setRun(await (kind === "confirm" ? confirmChagokRun : cancelChagokRun)(run.runId));
    } catch (e) {
      // 이미 확인 · 그만둠 — 두 번 눌러도 한 번만 실행된다. 지금 상태를 다시 읽어 보인다
      if (e instanceof ApiError && e.code === "RUN_NOT_WAITING") {
        try { setRun(await fetchChagokRun(run.runId)); } catch (again) { setActionError(errorOf(again).message); }
      } else setActionError(errorOf(e).message);
    } finally { pending.current = false; setActing(null); }
  };

  return {
    run, draft, setDraft, starting: starting || restoring, failure, conflict, conflictError, acting, actionError, pollState: poll.state,
    restoreRunId: restoreId, restoring, restoreError, restore: () => { setRestoreFailure(null); setRestoredFor(null); setRestoreRound(n => n + 1); },
    send, retry, restart, wait,
    confirm: () => act("confirm"), cancel: () => act("cancel"),
    resumePolling: () => setPoll(p => ({ state: "ok", round: p.round + 1 })),
  };
}
export type ChagokRunControl = ReturnType<typeof useChagokRun>;
