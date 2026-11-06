"use client";

// 외부 AI 변경 기록 — 언제 · 어느 AI · 무엇을 · 왜, 건별 맞아요 · 되돌리기 (S-53 · S-54 · mcp-api.md 「변경 기록」)
// 종류를 더할 때는 아래 표와 Body 에 한 줄씩 더한다(FE#118)
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { retryJob } from "@/lib/api/experience";
import { confirmMcpChange, fetchMcpChanges, mcpClientName, undoMcpChange, type McpChange } from "@/lib/api/mcp";

export const timestamp = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
}).format(new Date(value));

const VERB: Record<McpChange["type"], string> = {
  ADD_SOURCE: "자료를 넣음",
  UPDATE_EXPERIENCE: "경험 본문을 고침",
  CREATE_APPLICATION: "지원을 만듦",
  ANSWER_CLARIFICATION: "되묻기 답을 전함",
};
const STATUS: Record<McpChange["status"], string> = { APPLIED: "반영됨", CONFIRMED: "맞아요", UNDONE: "되돌림" };

/** 맞아요는 이 두 종류만 받는다(mcp-api.md 「confirm」) */
const CONFIRMABLE: McpChange["type"][] = ["UPDATE_EXPERIENCE", "ANSWER_CLARIFICATION"];

const UNDO_WARNING: Record<McpChange["type"], string> = {
  UPDATE_EXPERIENCE: "본문과 출처 상태가 고치기 전으로 돌아가요.",
  ADD_SOURCE: "이 자료로 만든 경험을 지워요. 내가 손댄 경험은 남고, 원본도 남아요.",
  CREATE_APPLICATION: "이 지원과 문항 · 추천을 지워요. 쓴 분석 횟수는 돌아오지 않아요.",
  ANSWER_CLARIFICATION: "이 보완을 지워요. 그 되묻기에 다시 답할 수 있어요.",
};

function blockedText(change: McpChange) {
  switch (change.undoBlockedReason) {
    case "CHANGED_AFTER": return "그 뒤 내용이 바뀌어서 되돌릴 수 없어요.";
    case "ANALYZING": return "분석이 끝나면 되돌릴 수 있어요.";
    case "ANALYSIS_FAILED": return "분석에 실패해서 되돌릴 것이 없어요.";
    case "DECIDED": return change.status === "CONFIRMED" ? "맞아요를 누른 변경은 되돌릴 수 없어요. 고치려면 경험에서 직접 고쳐 주세요." : null;
    default: return null;
  }
}

function Text({ label, children }: { label: string; children: ReactNode }) {
  return <div>
    <p className="text-[13px] font-medium text-muted">{label}</p>
    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{children}</p>
  </div>;
}

function AnalysisStatus({ source }: { source: NonNullable<McpChange["source"]> }) {
  if (source.jobStatus === "FAILED") return <span className="text-error">분석 실패</span>;
  if (source.jobStatus === "COMPLETED") return <>분석 완료 · 경험 {source.experienceCount}개</>;
  return <>분석 중</>;
}

function Body({ change, inActivity }: { change: McpChange; inActivity: boolean }) {
  const { experience, source, application, supplement, reason } = change;
  return <div className="mt-3 space-y-2">
    {experience && <>
      {!inActivity && <Link href={`/experience?activity=${experience.activityId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-3 hover:underline">{experience.activityName}</Link>}
      <Text label="고치기 전">{experience.beforeContent}</Text>
      <Text label="고친 뒤">{experience.afterContent}</Text>
    </>}
    {reason && <Text label="고친 이유">{reason}</Text>}
    {source && <>
      <Text label="자료">{source.name}</Text>
      <p className="text-sm text-body"><AnalysisStatus source={source} /></p>
    </>}
    {application && <Text label="지원">{application.organization || "지원처 미입력"} · 문항 {application.questionCount}개</Text>}
    {supplement && <Text label={supplement.question}>{supplement.answer}</Text>}
  </div>;
}

/** 변경 한 건. onChange 는 정한 뒤의 변경, onStale 은 서버 상태가 달라 다시 불러와야 할 때 */
export function McpChangeCard({ change, onChange, onStale, inActivity = false }: {
  change: McpChange;
  onChange: (change: McpChange, outcome: string) => void;
  onStale: () => void;
  /** 활동 세부 안 — 활동 이름 · 링크를 뺀다 */
  inActivity?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failedAnalysis = change.source?.jobStatus === "FAILED";
  const canConfirm = CONFIRMABLE.includes(change.type) && change.status === "APPLIED" && change.undoBlockedReason !== "CHANGED_AFTER";

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setAsking(false);
    setError(null);
    try {
      await action();
    } catch (e) {
      // 그새 다른 탭에서 정했거나 상태가 달라졌다 — 지금 상태를 다시 읽어 맞는 이유를 보인다.
      if (e instanceof ApiError && e.status === 409) onStale();
      else if (e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED") setError("오늘 분석 횟수를 다 썼어요. 내일 다시 시도해 주세요.");
      else setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const confirm = () => run(async () => {
    onChange(await confirmMcpChange(change.id), "맞아요 — 「내가 입력」으로 바뀌었어요.");
  }, "맞아요를 저장하지 못했어요. 다시 시도해 주세요.");

  const undo = () => run(async () => {
    const { change: next, removedExperiences, keptExperiences } = await undoMcpChange(change.id);
    onChange(next, change.type === "ADD_SOURCE"
      ? `되돌렸어요. 경험 ${removedExperiences}개를 지웠고, 내가 손댄 경험 ${keptExperiences}개는 남겼어요. 원본은 남아 있어요.`
      : "되돌렸어요.");
  }, "되돌리지 못했어요. 다시 시도해 주세요.");

  const retry = () => run(async () => {
    await retryJob(change.source!.jobId);
    onStale();
  }, "다시 시도하지 못했어요. 잠시 뒤 다시 눌러 주세요.");

  const blocked = blockedText(change);
  return <>
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="font-semibold">{mcpClientName(change.client)} · {VERB[change.type]}</span>
      <span className="text-[13px] font-medium text-muted">{STATUS[change.status]}</span>
      <time dateTime={change.createdAt} className="text-[13px] text-muted">{timestamp(change.createdAt)}</time>
    </p>
    <Body change={change} inActivity={inActivity} />
    {blocked && <p className="mt-2 text-sm leading-relaxed text-muted">{blocked}</p>}
    {error && <p role="alert" className="mt-2 text-sm leading-relaxed text-error">{error}</p>}
    {(canConfirm || change.undoable || failedAnalysis) && <div className="mt-3 flex flex-wrap gap-2">
      {canConfirm && <Button className="min-h-11" disabled={busy} onClick={() => void confirm()}>맞아요</Button>}
      {change.undoable && <Button className="min-h-11" variant="secondary" disabled={busy} onClick={() => setAsking(true)}>되돌리기</Button>}
      {failedAnalysis && <Button className="min-h-11" variant="secondary" disabled={busy} onClick={() => void retry()}>다시 시도</Button>}
    </div>}
    <Dialog open={asking} onOpenChange={setAsking}>
      <DialogContent>
        <DialogTitle>이 변경을 되돌릴까요?</DialogTitle>
        <DialogDescription>{UNDO_WARNING[change.type]}</DialogDescription>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setAsking(false)}>취소</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => void undo()}>되돌리기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

type LogState = { status: "loading" } | { status: "error" } | { status: "ready"; changes: McpChange[] };

export function McpChangeLog() {
  const [state, setState] = useState<LogState>({ status: "loading" });
  const [outcomes, setOutcomes] = useState<Record<number, string>>({});

  const load = useCallback(() => fetchMcpChanges().then(
    (changes) => setState({ status: "ready", changes }),
    () => setState({ status: "error" }),
  ), []);
  useEffect(() => { void load(); }, [load]);

  function decided(next: McpChange, outcome: string) {
    setState((current) => current.status === "ready"
      ? { status: "ready", changes: current.changes.map((c) => c.id === next.id ? next : c) } : current);
    setOutcomes((all) => ({ ...all, [next.id]: outcome }));
  }

  return <section aria-labelledby="mcp-changes" className="mt-8 border-t border-hairline pt-6">
    <div className="flex items-center justify-between gap-3">
      <h2 id="mcp-changes" className="text-lg font-semibold">변경 기록</h2>
      {state.status === "ready" && <Button className="min-h-11" variant="ghost" size="sm" onClick={() => void load()}>새로고침</Button>}
    </div>
    <p className="mt-2 text-sm leading-relaxed text-muted">외부 AI가 바꾼 것을 건별로 확인하고 되돌려요. 웹에서 고친 것은 남지 않아요.</p>
    {state.status === "loading" && <p role="status" className="mt-4 text-sm text-muted">변경 기록을 불러오고 있어요…</p>}
    {state.status === "error" && <div role="alert" className="mt-4 space-y-3">
      <p className="text-sm leading-relaxed text-error">변경 기록을 불러오지 못했어요.</p>
      <Button className="min-h-11" onClick={() => { setState({ status: "loading" }); void load(); }}>다시 시도</Button>
    </div>}
    {state.status === "ready" && (state.changes.length === 0
      ? <p className="mt-4 text-sm text-body">아직 외부 AI가 바꾼 것이 없어요.</p>
      : <ul className="m-0 mt-2 list-none p-0">
        {state.changes.map((change) => <li key={change.id} className="border-b border-hairline py-4">
          <McpChangeCard change={change} onStale={() => void load()} onChange={decided} />
          {outcomes[change.id] && <p role="status" className="mt-2 text-sm leading-relaxed text-body">{outcomes[change.id]}</p>}
        </li>)}
      </ul>)}
  </section>;
}
