"use client";

// 공고 탭 「자료에서 확인 안 됨」 줄의 「직접 기록하기」(S-93 · FE#567) — 그 줄 아래에 한 줄 입력을 펼친다. 화면을 옮기지 않는다.
// 붙일 경험이 없는 줄이라 되묻기 답(보완)과 달리 새 자료로 넣어 분석한다(POST /api/sources — 분석 1회, S-15).
// 분석이 끝나도 경험 찾기는 자동으로 돌리지 않는다 — 「경험 다시 찾기」를 그 자리에 보여 횟수를 사용자가 정하게(분석 1회 더)
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AnalysisMark, useAnalysisExhausted, ANALYSIS_EXHAUSTED_NOTE } from "@/components/auth/analysis-cost";
import { useAuth } from "@/components/auth/auth-gate";
import { dailyLimitMessage } from "@/lib/api/auth";
import { ApiError, fetchJob, retryJob, submitSource } from "@/lib/api/experience";
import type { Job } from "@/lib/api/types";
import { MAX_TEXT_LENGTH } from "@/lib/api/types";

const POLL_MS = 2000;

function submitError(e: unknown) {
  if (!(e instanceof ApiError)) return "기록을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  if (e.code === "DAILY_LIMIT_EXCEEDED") return dailyLimitMessage("new");
  if (e.code === "SOURCE_DUPLICATE") return "이미 넣은 글과 같아요. 조금 다르게 적어 주세요.";
  return e.message || "기록을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

function jobError(job: Job) {
  const code = job.error?.code;
  const why = code === "AI_TIMEOUT" ? "AI 응답이 너무 오래 걸렸어요."
    : code === "AI_UNAVAILABLE" ? "AI 서버에 연결하지 못했어요."
    : code === "AI_FAILED" ? "AI 가 올바른 결과를 돌려주지 않았어요."
    : job.error?.message || "분석을 마치지 못했어요.";
  return `${why} 적은 글은 저장돼 있으니 다시 시도해 주세요.`;
}

type State =
  | { step: "write" }
  | { step: "sending" }
  | { step: "analyzing"; jobId: number }
  | { step: "unknown"; jobId: number; message: string }
  | { step: "failed"; job: Job }
  | { step: "done"; job: Job };

/** 줄 아래에 펼친 한 줄 입력. refind — 분석이 끝난 뒤 그 자리에 보일 「경험 다시 찾기」 */
export function PostingRecord({ lineText, refind, onRecorded, onClose }: { lineText: string; refind: ReactNode; onRecorded: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ step: "write" });
  const [error, setError] = useState<string | null>(null);
  const [poll, setPoll] = useState(0);
  const pending = useRef(false);
  const { refresh } = useAuth();
  const running = state.step === "sending" || state.step === "analyzing";
  const exhausted = useAnalysisExhausted(1, running);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => { onRecordedRef.current = onRecorded; });

  // 분석 작업 상태를 2초마다 묻는다 — 끝나면 멈춘다
  const jobId = state.step === "analyzing" ? state.jobId : null;
  useEffect(() => {
    if (jobId === null) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const job = await fetchJob(jobId);
        if (!live) return;
        if (job.status === "COMPLETED") { setState({ step: "done", job }); refresh(); if (job.activityIds.length) onRecordedRef.current(); }
        else if (job.status === "FAILED") { setState({ step: "failed", job }); refresh(); }
        else setPoll(n => n + 1);
      } catch (e) {
        if (live) setState({ step: "unknown", jobId, message: e instanceof Error ? e.message : "분석 상태를 확인하지 못했어요." });
      }
    }, POLL_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [jobId, poll, refresh]);

  const send = async () => {
    const body = text.trim();
    if (pending.current || !body || exhausted) return;
    pending.current = true; setState({ step: "sending" }); setError(null);
    try {
      const { jobId } = await submitSource({ kind: "TEXT", name: null, text: body });
      setState({ step: "analyzing", jobId });
      refresh();
    } catch (e) {
      setError(submitError(e));
      setState({ step: "write" });
    } finally { pending.current = false; }
  };
  const retry = async (job: Job) => {
    setState({ step: "analyzing", jobId: job.jobId });
    try { await retryJob(job.jobId); }
    catch (e) { setState({ step: "failed", job: { ...job, error: { code: "RETRY", message: e instanceof Error ? e.message : "다시 시도하지 못했어요." } } }); }
  };
  const again = () => { setText(""); setState({ step: "write" }); };

  const writing = state.step === "write" || state.step === "sending";
  return <div className="mt-2 grid min-w-0 gap-2 rounded-sm bg-surface-faint px-3.5 py-3">
    {writing ? <>
      <form className="relative min-w-0" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input type="text" autoFocus maxLength={MAX_TEXT_LENGTH} value={text} disabled={state.step === "sending"}
          onChange={e => { setText(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Escape" && !text.trim()) onClose(); }}
          aria-label={`이 요건과 관련해 한 일: ${lineText}`} placeholder="이 요건과 관련해 한 일을 적어 주세요"
          className="h-11 w-full min-w-0 rounded-sm bg-canvas pr-12 pl-3.5 text-base text-body outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm lg:h-10 lg:pr-11" />
        <Button type="submit" variant="ghost" size="icon" className="absolute top-1 right-1 size-9 rounded-[6px] text-ink hover:bg-surface-strong lg:size-8"
          disabled={!text.trim() || state.step === "sending" || exhausted} aria-label={state.step === "sending" ? "보내는 중" : "보내기 — 분석 1회"} title="분석 1회">
          {text.trim() ? <ArrowUpIcon aria-hidden="true" weight="bold" /> : <AnalysisMark />}
        </Button>
      </form>
      <p className="m-0 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <LockSimpleIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span><AnalysisMark className="mr-0.5 inline size-[1.1em] align-[-2px]" />보내면 새 자료로 분석해요(1회) · 분석을 위해 외부 AI(OpenAI)로 보내져요.</span>
      </p>
      {exhausted && <p className="m-0 text-xs text-review">{ANALYSIS_EXHAUSTED_NOTE}</p>}
      {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
      {state.step !== "sending" && <Button type="button" variant="link" size="sm" className="justify-self-start px-0" onClick={onClose}>접기</Button>}
    </> : state.step === "analyzing" ? <p role="status" aria-live="polite" className="m-0 text-sm text-body">적은 글에서 활동과 한 일을 정리하고 있어요. 보통 30초 안에 끝나요.</p>
    : state.step === "unknown" ? <div role="alert" className="grid justify-items-start gap-2">
      <p className="m-0 text-note text-error">분석 상태를 확인하지 못했어요. {state.message}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => setState({ step: "analyzing", jobId: state.jobId })}>다시 확인</Button>
    </div>
    : state.step === "failed" ? <div role="alert" className="grid justify-items-start gap-2">
      <p className="m-0 text-note text-error">{jobError(state.job)}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => void retry(state.job)}>다시 시도</Button>
    </div>
    : state.job.activityIds.length ? <div role="status" className="grid justify-items-start gap-2">
      <p className="m-0 text-sm text-body">
        기록했어요 — <Link href={`/experience?activity=${state.job.activityIds[0]}`} className="underline underline-offset-4 hover:text-ink">내 경험</Link>에 정리했어요.
        이 줄 판정은 「경험 다시 찾기」를 누르면 다시 봐요.
      </p>
      {refind}
    </div>
    : <div role="status" className="grid justify-items-start gap-2">
      <p className="m-0 text-sm text-body">적은 글에서 활동을 찾지 못했어요. 언제 · 어디서 무엇을 했는지 조금 더 적어 주세요.</p>
      <Button type="button" variant="secondary" size="sm" onClick={again}>다시 적기</Button>
    </div>}
  </div>;
}
