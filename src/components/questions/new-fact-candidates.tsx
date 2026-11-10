"use client";

import { InfoTip } from "@/components/ui/info-tip";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MonthField } from "@/components/experience/activity-editor";
import { activityError } from "@/lib/api/editing";
import { fetchActivities } from "@/lib/api/experience";
import { scrollWithinContainer } from "@/lib/scroll";
import type { NewFactCandidate, SaveNewFactRequest } from "@/lib/api/question-types";
import type { ActivitySummary, Actor, Period } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type { useConfirmedAnswer } from "./use-confirmed-answer";

type Confirmed = ReturnType<typeof useConfirmedAnswer>;
const field = "min-h-11 lg:min-h-10 w-full min-w-0 rounded-sm border border-hairline bg-canvas p-3 text-sm text-ink";

/** 새 경험 후보(S-48) — 차곡이 패널에서 찾고 고른다(FE#270). 답칸에는 저장했다는 것과 찾기 한 줄만 둔다.
 *  findRequested — 답칸의 「새 경험 후보 찾기」로 패널이 열렸다. 한 번만 시작하고 onFindStarted 로 지운다(시트를 다시 열어도 또 찾지 않게)
 *  focusRequest — 답칸의 「차곡이에서 보기」 · 「새 경험 후보 찾기」를 누를 때마다 오르는 번호(0 이면 없음). 받으면 onFocused 로 알린다(FE#390) */
export function NewFactCandidates({ confirmed: a, findRequested, onFindStarted, focusRequest, onFocused }: {
  confirmed: Confirmed; findRequested: boolean; onFindStarted: () => void; focusRequest: number; onFocused: (request: number) => void;
}) {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityError, setActivityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const section = useRef<HTMLElement>(null);
  const needsActivities = a.answer?.newFacts?.candidates.some(c => c.status === "PENDING") ?? false;
  useEffect(() => {
    if (!needsActivities) return;
    let disposed = false;
    void fetchActivities().then(items => {
      if (!disposed) { setActivities(items); setActivityError(""); setLoading(false); }
    }).catch(e => { if (!disposed) { setActivityError(e instanceof Error ? e.message : "활동을 불러오지 못했어요."); setLoading(false); } });
    return () => { disposed = true; };
  }, [needsActivities, attempt]);
  const { retryFind } = a;
  useEffect(() => {
    if (!findRequested) return;
    onFindStarted();
    void retryFind();
  }, [findRequested, onFindStarted, retryFind]);
  // 「초안 부탁하기」(FE#249)와 같은 반응 — 패널 안에서만 이 칸으로 옮기고, 초점을 칸에 두고, 테두리를 한 번 강조한다. 메인 페이지는 움직이지 않는다.
  // 받은 뒤 요청이 0 으로 바뀌어도 강조는 끝까지 — 타이머는 이 칸이 사라질 때만 지운다
  const [highlight, setHighlight] = useState(false);
  const highlightTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => highlightTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!focusRequest || !section.current) return;
    const target = section.current;
    scrollWithinContainer(target);
    target.focus({ preventScroll: true });
    onFocused(focusRequest);
    highlightTimers.current.forEach(clearTimeout);
    // 렌더 중이 아니라 효과 안에서 한 번 켰다가 끈다 — 같은 요청을 여러 번 눌러도 다시 강조한다
    highlightTimers.current = [setTimeout(() => setHighlight(true), 0), setTimeout(() => setHighlight(false), 1200)];
  }, [focusRequest, onFocused]);
  const facts = a.answer?.newFacts;
  if (!a.answer) return null;
  return <section ref={section} tabIndex={-1} aria-label="새 경험 후보" data-highlight={highlight || undefined}
    // 강조는 테두리 한 번 — 움직임 줄이기면 서서히 사라지지 않고 바로 켜졌다 꺼진다
    className={cn("grid min-w-0 gap-3 rounded-sm border border-hairline bg-canvas px-3.5 py-3 text-sm outline-2 outline-offset-4 motion-safe:transition-[outline-color] motion-safe:duration-700",
      highlight ? "outline-ink" : "outline-transparent")}>
    <div className="flex items-center gap-0.5"><h4 className="m-0 text-sm font-semibold">새 경험 후보</h4><InfoTip label="새 경험 후보">다 쓴 답에서 새로 쓴 사실을 찾아요. 경험은 저장을 눌러야 쌓여요.</InfoTip></div>
    {a.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{a.failure.message}{a.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      <Button variant="secondary" disabled={a.busy} onClick={() => void (a.failure?.action === "find" ? a.retryFind() : a.refresh())}>
        {a.failure.action === "find" ? "다시 찾기" : "상태 다시 확인"}
      </Button>
    </div>}
    {!facts && !a.failure && <>
      <p className="m-0 text-body">다 쓴 답에서 내가 새로 쓴 사실을 찾아 경험으로 쌓을 수 있어요.</p>
      <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={a.busy} onClick={() => void a.retryFind()}>{a.busy ? "찾기 시작하는 중…" : "새 경험 후보 찾기"}</Button><AnalysisCost running={a.busy} /></div>
    </>}
    {facts?.status === "ANALYZING" && <p role="status" className="m-0 text-muted">새 경험 후보를 찾고 있어요… 새로고침해도 이어서 확인해요.</p>}
    {facts?.status === "FAILED" && !a.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-error">답은 저장했어요 · {facts.error?.message || "후보를 찾지 못했어요."}</p>
      <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={a.busy} onClick={() => void a.retryFind()}>다시 찾기</Button><AnalysisCost running={a.busy} /></div>
    </div>}
    {facts?.status === "COMPLETED" && !facts.candidates.length && <p role="status" className="m-0 text-muted">새로 쓴 사실이 없어요</p>}
    {facts?.status === "COMPLETED" && facts.candidates.length > 0 && <p className="m-0 text-muted">AI 제안이니 확인하고 고쳐 주세요.</p>}
    {activityError && needsActivities && <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-error">{activityError}</p><Button variant="secondary" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>활동 다시 불러오기</Button></div>}
    {facts?.status === "COMPLETED" && facts.candidates.length > 0 && <ol className="m-0 grid list-none gap-3 p-0">{facts.candidates.map(c => <CandidateCard key={c.id} candidate={c} activities={activities} unavailable={loading || !!activityError} busy={a.busy} decide={a.decide} questionId={a.answer!.questionId} onActivityCreated={() => setAttempt(n => n + 1)} />)}</ol>}
  </section>;
}

/** 「+ 새 활동 만들기」를 고른 값 — 활동 id 는 양의 정수라 겹치지 않는다 */
const NEW = "new";
const NO_PERIOD: Period = { start: null, end: null, ongoing: false };

/** onActivityCreated — 새 활동을 만들어 저장했다. 다른 후보 카드도 그 활동을 고를 수 있게 활동 목록을 다시 읽는다 */
function CandidateCard({ candidate: c, activities, unavailable, busy, decide, questionId, onActivityCreated }: {
  candidate: NewFactCandidate; activities: ActivitySummary[]; unavailable: boolean; busy: boolean;
  decide: Confirmed["decide"]; questionId: number; onActivityCreated: () => void;
}) {
  const [content, setContent] = useState(c.content);
  const [actor, setActor] = useState<Actor>(c.actor);
  // AI 가 붙일 활동을 못 찾았으면(null) 새 활동 만들기를 바로 연다(S-48 · ETC#260)
  const [activity, setActivity] = useState(c.activityId === null ? NEW : String(c.activityId));
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<Period>(NO_PERIOD);
  const [error, setError] = useState("");
  const creating = activity === NEW;
  const activityId = Number(activity);
  const chosen = activities.find(a => a.id === activityId);
  // 기간은 이름보다 먼저 보이지 않게 — 이름 빈칸은 버튼을 막는 것으로 알린다
  const periodError = creating ? activityError("-", period) : null;
  const ready = creating ? !!name.trim() && !periodError : !!chosen;
  const submit = async (data?: SaveNewFactRequest, activityName?: string) => {
    setError("");
    try {
      await decide(c.id, data, activityName);
      if (data?.newActivity) onActivityCreated();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
  };
  const save = () => void (creating
    ? submit({ newActivity: { name: name.trim(), period }, content, actor }, name.trim())
    : submit({ activityId, content, actor }, chosen?.name));
  return <li className="grid min-w-0 gap-3 rounded-md border border-hairline p-3">
    <p className="m-0 text-xs font-semibold text-muted">AI 제안</p>
    <div className="grid gap-1"><p className="m-0 text-xs text-muted">다 쓴 답의 원래 문장</p><blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 text-sm leading-relaxed">{c.sentence}</blockquote></div>
    {c.status === "PENDING" ? <>
      <label className="grid min-w-0 gap-1 text-xs text-muted">경험 문장<textarea rows={3} className={field} value={content} disabled={busy} onChange={e => setContent(e.target.value)} /></label>
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-xs text-muted">수행 주체<Select<Actor> value={actor} disabled={busy} onChange={next => { if (next) setActor(next); }} className="min-h-10" options={[{ value: "ME", label: "나" }, { value: "TEAM", label: "팀" }, { value: "UNKNOWN", label: "알 수 없음" }]} /></label>
        <label className="grid min-w-0 gap-1 text-xs text-muted">붙일 활동<Select value={creating || chosen ? activity : ""} disabled={busy || (unavailable && !creating)} onChange={setActivity} className="min-h-10" placeholder="활동을 골라 주세요"
          options={[...activities.map(a => ({ value: String(a.id), label: a.name })), { value: NEW, label: "+ 새 활동 만들기" }]} /></label>
      </div>
      {c.activityName ? <p className="m-0 break-words text-note text-muted">AI가 제안한 활동 — {c.activityName}</p>
        : c.activityId === null && <p className="m-0 break-words text-note text-muted">맞는 활동이 없어 보여요. 새 활동을 만들어 붙이거나 기존 활동을 골라 주세요.</p>}
      {creating && <fieldset className="m-0 grid min-w-0 gap-3 rounded-sm border border-hairline p-3" disabled={busy}>
        <legend className="px-1 text-xs font-semibold text-muted">새 활동</legend>
        <label className="grid min-w-0 gap-1 text-xs text-muted">활동 이름<input className={field} value={name} required placeholder="예: 교내 해커톤 · 결제 서버 운영" onChange={e => setName(e.target.value)} /></label>
        <div className="grid min-w-0 gap-2 text-xs text-muted">
          <p className="m-0">기간 (선택 — 비우면 기간 모름)</p>
          {(["start", "end"] as const).map(key => <MonthField key={key} label={key === "start" ? "시작" : "종료"} value={period[key]} original={null}
            disabled={busy || (key === "end" && period.ongoing)} onChange={value => setPeriod(p => ({ ...p, [key]: value }))} />)}
          <label className="flex min-h-11 lg:min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={period.ongoing} onChange={e => setPeriod(p => ({ ...p, ongoing: e.target.checked, end: e.target.checked ? null : p.end }))} />진행 중</label>
          {periodError && <p role="alert" className="m-0 text-sm text-error">{periodError}</p>}
        </div>
        <p className="m-0 text-note text-muted">분류는 저장한 뒤 활동 세부에서 정해요.</p>
      </fieldset>}
      {!unavailable && !activities.length && !creating && <p className="m-0 text-sm text-muted">기존 활동이 없어요. 「+ 새 활동 만들기」로 붙여 주세요.</p>}
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || (unavailable && !creating) || !ready || !content.trim()} onClick={save}>경험으로 저장</Button><Button variant="secondary" disabled={busy} onClick={() => void submit()}>저장 안 함</Button></div>
    </> : c.status === "SAVED" ? <>
      <p role="status" className="m-0 break-words text-sm">{c.activityName ? <>「{c.activityName}」에 경험으로 저장했어요</> : "경험으로 저장했어요"}</p>
      {c.experienceId !== null ? <Link className="inline-flex min-h-11 lg:min-h-10 items-center justify-self-start text-sm underline underline-offset-3" href={`/experience?experience=${c.experienceId}&fromQuestion=${questionId}#experience-${c.experienceId}`}>저장한 경험 보기 →</Link>
        : <p className="m-0 text-sm text-muted">저장했던 경험이 지금은 없어요.</p>}
    </> : <p role="status" className="m-0 text-sm text-muted">저장하지 않았어요</p>}
  </li>;
}
