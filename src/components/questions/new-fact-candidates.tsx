"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchActivities } from "@/lib/api/experience";
import type { NewFactCandidate, SaveNewFactRequest } from "@/lib/api/question-types";
import type { ActivitySummary, Actor } from "@/lib/api/types";
import type { useConfirmedAnswer } from "./use-confirmed-answer";

type Confirmed = ReturnType<typeof useConfirmedAnswer>;
const field = "min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-canvas p-3 text-sm";

export function NewFactCandidates({ confirmed: a }: { confirmed: Confirmed }) {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityError, setActivityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const needsActivities = a.answer?.newFacts?.candidates.some(c => c.status === "PENDING") ?? false;
  useEffect(() => {
    if (!needsActivities) return;
    let disposed = false;
    void fetchActivities().then(items => {
      if (!disposed) { setActivities(items); setActivityError(""); setLoading(false); }
    }).catch(e => { if (!disposed) { setActivityError(e instanceof Error ? e.message : "활동을 불러오지 못했어요."); setLoading(false); } });
    return () => { disposed = true; };
  }, [needsActivities, attempt]);
  const facts = a.answer?.newFacts;
  return <div className="grid min-w-0 gap-4">
    {a.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{a.failure.message}{a.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      <Button variant="secondary" disabled={a.busy} onClick={() => void (a.failure?.action === "confirm" ? a.confirm(a.failure.text!) : a.failure?.action === "find" ? a.retryFind() : a.refresh())}>
        {a.failure.action === "confirm" ? "같은 답으로 다시 확정" : a.failure.action === "find" ? "다시 찾기" : "확정 상태 다시 확인"}
      </Button>
    </div>}
    {a.answer && <section aria-label="새 경험 후보" className="grid min-w-0 gap-3">
      <h4 className="m-0 text-sm font-semibold">새 경험 후보</h4>
      <p className="m-0 text-sm leading-relaxed text-muted">확정한 글에서 새로 쓴 사실을 찾아요. AI 제안이니 확인하고 고쳐 주세요. 경험은 저장을 눌러야 쌓여요.</p>
      {facts?.status === "ANALYZING" && <p role="status" className="m-0 text-sm text-muted">새 경험 후보를 찾고 있어요… 새로고침해도 이어서 확인해요.</p>}
      {facts?.status === "FAILED" && !a.failure && <div className="grid justify-items-start gap-2">
        <p role="alert" className="m-0 text-sm text-error">답은 확정됐어요 · {facts.error?.message || "후보를 찾지 못했어요."}</p>
        <Button variant="secondary" disabled={a.busy} onClick={() => void a.retryFind()}>다시 찾기</Button>
      </div>}
      {!facts && !a.failure && <Button variant="secondary" className="justify-self-start" disabled={a.busy} onClick={() => void a.retryFind()}>새 경험 후보 찾기</Button>}
      {facts?.status === "COMPLETED" && !facts.candidates.length && <p role="status" className="m-0 text-sm text-muted">새로 쓴 사실이 없어요</p>}
      {activityError && needsActivities && <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-sm text-error">{activityError}</p><Button variant="secondary" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>활동 다시 불러오기</Button></div>}
      {facts?.status === "COMPLETED" && <ol className="m-0 grid list-none gap-4 p-0">{facts.candidates.map(c => <CandidateCard key={c.id} candidate={c} activities={activities} unavailable={loading || !!activityError} busy={a.busy} decide={a.decide} questionId={a.answer!.questionId} />)}</ol>}
    </section>}
  </div>;
}

function CandidateCard({ candidate: c, activities, unavailable, busy, decide, questionId }: {
  candidate: NewFactCandidate; activities: ActivitySummary[]; unavailable: boolean; busy: boolean;
  decide: Confirmed["decide"]; questionId: number;
}) {
  const [content, setContent] = useState(c.content);
  const [actor, setActor] = useState<Actor>(c.actor);
  const [activity, setActivity] = useState(c.activityId === null ? "" : String(c.activityId));
  const [error, setError] = useState("");
  const activityId = Number(activity);
  const validActivity = activities.some(a => a.id === activityId);
  const submit = async (data?: SaveNewFactRequest) => {
    setError("");
    try { await decide(c.id, data); }
    catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
  };
  return <li className="grid min-w-0 gap-3 rounded-md border border-hairline p-4">
    <p className="m-0 text-xs font-semibold text-muted">AI 제안</p>
    <div className="grid gap-1"><p className="m-0 text-xs text-muted">확정한 답의 원래 문장</p><blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 text-sm leading-relaxed">{c.sentence}</blockquote></div>
    {c.status === "PENDING" ? <>
      <label className="grid min-w-0 gap-1 text-xs text-muted">경험 문장<textarea rows={3} className={field} value={content} disabled={busy} onChange={e => setContent(e.target.value)} /></label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="grid min-w-0 gap-1 text-xs text-muted">수행 주체<select className={field} value={actor} disabled={busy} onChange={e => setActor(e.target.value as Actor)}><option value="ME">나</option><option value="TEAM">팀</option><option value="UNKNOWN">알 수 없음</option></select></label>
        <label className="grid min-w-0 gap-1 text-xs text-muted">붙일 활동<select className={field} value={validActivity ? activity : ""} disabled={busy || unavailable} onChange={e => setActivity(e.target.value)}><option value="">활동을 골라 주세요</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      {!unavailable && !activities.length && <p className="m-0 text-sm text-muted">저장할 활동이 없어요. 내 경험에서 활동을 준비한 뒤 다시 열어 주세요.</p>}
      {c.activityName && <p className="m-0 break-words text-xs text-muted">AI가 제안한 활동 — {c.activityName}</p>}
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || unavailable || !validActivity || !content.trim()} onClick={() => void submit({ activityId, content, actor })}>경험으로 저장</Button><Button variant="secondary" disabled={busy} onClick={() => void submit()}>저장 안 함</Button></div>
    </> : c.status === "SAVED" ? <>
      <p role="status" className="m-0 text-sm">경험으로 저장했어요</p>
      {c.experienceId !== null ? <Link className="inline-flex min-h-11 items-center justify-self-start text-sm underline underline-offset-3" href={`/experience?experience=${c.experienceId}&fromQuestion=${questionId}#experience-${c.experienceId}`}>저장한 경험 보기 →</Link>
        : <p className="m-0 text-sm text-muted">저장했던 경험이 지금은 없어요.</p>}
    </> : <p role="status" className="m-0 text-sm text-muted">저장하지 않았어요</p>}
  </li>;
}
