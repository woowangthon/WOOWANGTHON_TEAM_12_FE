"use client";

// 차곡이 일(S-31 · ETC ADR-007) — 시안 6 mock.js 의 mate__foot(부탁 칩 + 입력) · msg--me(내 부탁) · msg--ask(묻는 카드) · chagok.css .steps(단계).
// 보이는 단계는 전부 BE 의 Run 그대로다 — 지어낸 진행을 보이지 않고, 실패를 정해진 답으로 채우지 않는다(대회 규칙 1 · 2). 채팅창이 아니라 일 하나만 보인다
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpIcon, CaretDownIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ANALYSIS_EXHAUSTED_NOTE, LowAnalysisNotice, useAnalysisExhausted } from "@/components/auth/analysis-cost";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { foundExperiences, type ChagokConfirmStep, type ChagokRun, type ChagokToolCallStep, type FoundExperience } from "@/lib/api/chagok";
import { JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, type JobRole, type OrganizationType } from "@/lib/api/question-types";
import { bubble, inlineAction } from "./clarifications";
import { ActivityChip, RecommendationEvidence } from "./question-result";
import { RematchButton, type Rematch } from "./rematch-button";
import { whyFailed, type ChagokRunControl } from "./use-chagok-run";

/** 부탁 칩 — 지금 도구 목록(읽기 도구 · search_experiences 등) 안에서만, 문항이 어디까지 왔는지에 맞춰 보인다(FE#338).
 *  초안이 아직 없으면 쓸 경험을 찾는 부탁, 초안이 있으면 그 초안에 더 쓸 근거를 찾는 부탁이다. 초안 · 근거 점검 도구는 생긴 뒤(S-45 · S-27).
 *  「다른 경험으로」는 두지 않는다 — 문항에 맞는 다른 경험은 「경험 다시 찾기」(S-90)가 /match 로 찾는다(ETC#300) */
const PRESETS = {
  beforeDraft: [{ label: "근거 찾기", text: "이 문항에 쓸 경험의 근거를 찾아 줘" }],
  afterDraft: [{ label: "초안 근거 더 찾기", text: "이 문항 초안에 더 쓸 만한 경험의 근거를 찾아 줘" }],
};
const CARDS_AT_FIRST = 3;
const card = "m-0 grid gap-3 rounded-[4px_16px_16px_16px] border border-hairline bg-canvas p-3.5 text-sm leading-relaxed";
const notice = "m-0 grid gap-2 rounded-md border border-hairline bg-canvas p-3 text-note leading-relaxed";
const mark = "mt-0.5 grid size-[18px] place-items-center rounded-full text-on-primary";
const resultLink = "font-semibold text-ink underline underline-offset-3"; // 이동 링크 — 근거 색을 쓰지 않는다(FE#468)

function ExperienceCard({ found: { activityName, experience } }: { found: FoundExperience }) {
  const evidence = [
    ...experience.citations.map(c => ({ type: "CITATION" as const, id: c.id })),
    ...experience.supplements.map(s => ({ type: "SUPPLEMENT" as const, id: s.id })),
  ];
  return <li className="grid min-w-0 gap-2 rounded-md border border-hairline bg-canvas p-3">
    <ActivityChip name={activityName} />
    <p className="m-0 text-sm leading-relaxed break-words text-ink">{experience.content}</p>
    <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted"><ExperienceMeta experience={experience} /></p>
    {evidence.length > 0 && <RecommendationEvidence recommendation={{ experience, evidence }} />}
  </li>;
}

/** 끝난 단계 — 성공이면 「✓ 한 줄」로 접고 찾은 경험이 있으면 눌러 펼친다. 실패는 펼친 채 오류를 보인다(FE#338) */
function ToolStep({ step }: { step: ChagokToolCallStep }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const found = foundExperiences(step.result);
  const expandable = step.ok && found.length > 0;
  const shown = !step.ok || open;
  const line = <>
    <span className={`${mark} ${step.ok ? "bg-primary" : "bg-error"}`}>
      {step.ok ? <CheckIcon aria-hidden="true" className="size-3" weight="bold" /> : <XIcon aria-hidden="true" className="size-3" weight="bold" />}
    </span>
    <span className="min-w-0 text-note leading-relaxed break-words">
      <span className="font-medium text-ink">{step.label}</span>
      {step.ok && step.summary && <span className="text-muted"> · {step.summary}</span>}
    </span>
  </>;
  return <li className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-x-2 gap-y-2">
    {expandable
      ? <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="col-span-2 grid min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-sm text-left">
        {line}
        <CaretDownIcon aria-hidden="true" className={`mt-1 size-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      : <div className="col-span-2 grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2">{line}</div>}
    {!step.ok && step.error && <p className="col-start-2 m-0 text-note break-words text-error">{step.error.message}</p>}
    {shown && found.length > 0 && <div className="col-span-2 grid min-w-0 gap-2">
      <ul aria-label="찾은 경험" className="m-0 grid list-none gap-2 p-0">
        {(all ? found : found.slice(0, CARDS_AT_FIRST)).map(f => <ExperienceCard key={f.experience.id} found={f} />)}
      </ul>
      {!all && found.length > CARDS_AT_FIRST && <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setAll(true)}>{found.length - CARDS_AT_FIRST}개 더 보기</Button>}
    </div>}
  </li>;
}

/** 일하는 동안 맨 아래 한 줄 — 회전 · 받은 마지막 단계 이름(없으면 일하는 중이라고만) · 시작부터 지난 초. 글만 알림으로 읽고 초는 읽지 않는다 */
function RunningLine({ run, canceling, onCancel }: { run: ChagokRun; canceling: boolean; onCancel: () => void }) {
  const mounted = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const created = run.createdAt ? Date.parse(run.createdAt) : NaN;
  const seconds = Math.max(0, now - (Number.isNaN(created) ? mounted.current : created)) / 1000;
  const last = run.steps.findLast(step => step.type === "TOOL_CALL");
  return <div className="flex items-center gap-2 text-note font-medium text-ink">
    <span aria-hidden="true" className="size-[18px] shrink-0 rounded-full border-2 border-ink border-r-transparent motion-safe:animate-spin" />
    <span className="min-w-0 flex-1 break-words">
      <span role="status">{last?.label ?? "차곡이가 일하고 있어요"}</span>
      <span aria-hidden="true" className="font-normal text-muted tabular-nums"> · {seconds.toFixed(1)}초</span>
    </span>
    <Button size="sm" variant="secondary" disabled={canceling} onClick={onCancel}>그만</Button>
  </div>;
}

/** 확인하면 BE 가 실행할 내용 — 사용자는 고칠 수 없으니(1차) 빠짐없이 보인다 */
function ConfirmContent({ step }: { step: ChagokConfirmStep }) {
  const args = (step.arguments ?? {}) as { organization?: string | null; organizationType?: OrganizationType | null; jobRole?: JobRole | null; postingUrl?: string | null; questions?: { text: string }[]; text?: string };
  if (step.tool === "add_source") return <div className="grid gap-1">
    <p className="m-0 text-xs text-muted">넣을 글 · {(args.text ?? "").length.toLocaleString("ko-KR")}자</p>
    <p className="m-0 line-clamp-4 border-l-2 border-hairline pl-3 text-note break-words whitespace-pre-wrap text-body">{args.text}</p>
  </div>;
  if (step.tool !== "create_application") return null;
  const kinds = [args.organizationType && ORGANIZATION_TYPE_LABEL[args.organizationType], args.jobRole && JOB_ROLE_LABEL[args.jobRole]].filter(Boolean).join(" · ");
  return <div className="grid gap-2 text-note">
    <div>
      <p className="m-0 text-xs text-muted">지원처</p>
      <p className="m-0 font-medium break-words text-ink">{args.organization || "지원처 미입력"}{kinds && <span className="font-normal text-muted"> · {kinds}</span>}</p>
    </div>
    {args.postingUrl && <p className="m-0 break-all text-muted">{args.postingUrl}</p>}
    <div>
      <p className="m-0 text-xs text-muted">문항 {args.questions?.length ?? 0}개</p>
      <ol className="m-0 grid list-decimal gap-1 pl-4">{args.questions?.map((q, i) => <li key={i} className="break-words">{q.text}</li>)}</ol>
    </div>
  </div>;
}

function ConfirmCard({ step, control }: { step: ChagokConfirmStep; control: ChagokRunControl }) {
  const waiting = control.run?.status === "WAITING_CONFIRM";
  return <li className={card} aria-label="차곡이의 확인 요청">
    <p className="m-0 font-semibold break-words text-ink">{step.label}</p>
    <ConfirmContent step={step} />
    {waiting && <div className="flex flex-wrap gap-2">
      <Button size="sm" className={inlineAction} disabled={!!control.acting} onClick={() => void control.confirm()}>{step.tool === "add_source" ? "넣기" : "만들기"}</Button>
      <Button size="sm" variant="secondary" disabled={!!control.acting} onClick={() => void control.cancel()}>안 함</Button>
    </div>}
    {waiting && control.actionError && <p role="alert" className="m-0 text-note text-error">{control.actionError}</p>}
  </li>;
}

// 지원 목록을 처음부터 다시 받아야 새 지원이 보여 next/link 가 아니라 화면을 새로 연다
function ResultLink({ run }: { run: ChagokRun }) {
  const result = run.result;
  if (!result) return null;
  const line = `${bubble} flex flex-wrap items-center gap-2`;
  if (result.tool === "create_application") return <div className={line}>
    <span>지원서를 만들었어요.</span>
    <a className={resultLink} href={`/questions?question=${result.questionIds[0]}`}>열기</a>
  </div>;
  return <div className={line}>
    <span>자료를 넣었어요. 분석은 뒤에서 이어져요.</span>
    <a className={resultLink} href="/experience">열기</a>
  </div>;
}

export function ChagokRunFeed({ control, currentQuestionId, rematch }: {
  control: ChagokRunControl; currentQuestionId: number | null;
  /** 지금 문항이 추천이 끝난 상태일 때만 — 차곡이가 찾은 경험을 이 문항의 추천에 반영하는 길(S-90) */
  rematch: { onRematch: Rematch; busy: boolean } | null;
}) {
  const { run, pollState, acting, actionError, starting } = control;
  const [expanded, setExpanded] = useState(false);
  const [prevRunId, setPrevRunId] = useState(run?.runId);
  if (run && prevRunId !== run.runId) {
    setPrevRunId(run.runId);
    setExpanded(false);
  }
  const exhausted = useAnalysisExhausted(1, starting);
  if (!run) return null;
  const isLong = run.text.length > 120 || run.text.split("\n").length > 4;
  // 이 문항에서 한 부탁이 끝났고 찾은 경험이 보일 때만. 차곡이가 스스로 시작하지 않는다 — 사용자가 누른다
  const foundHere = currentQuestionId !== null && run.questionId === currentQuestionId && run.status !== "RUNNING" && run.status !== "WAITING_CONFIRM"
    && run.steps.some(step => step.type === "TOOL_CALL" && foundExperiences(step.result).length > 0);
  return <section aria-label="차곡이의 일" className="mt-2.5 grid gap-2.5 border-t border-hairline-soft pt-3">
    <div className="grid justify-items-end gap-1">
      <div className="max-w-[92%] rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-on-primary">
        <p className={cn("m-0", !expanded && isLong && "line-clamp-4")}>{run.text}</p>
      </div>
      {isLong && <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs text-muted hover:underline">
        {expanded ? "접기" : "더 보기"}
      </button>}
      {run.questionId !== null && run.questionId !== currentQuestionId && <small className="text-note text-muted">다른 문항에서 한 부탁이에요</small>}
    </div>
    <ol aria-live="polite" className="m-0 grid list-none gap-3 p-0">
      {run.steps.map(step => step.type === "TOOL_CALL" ? <ToolStep key={step.seq} step={step} />
        : step.type === "MESSAGE" ? <li key={step.seq} className={`${bubble} break-words`}>{step.text}</li>
        : <ConfirmCard key={step.seq} step={step} control={control} />)}
    </ol>
    {rematch && foundHere && currentQuestionId !== null && <div className={notice}>
      <p className="m-0 text-body">찾은 경험을 이 문항의 추천에 반영하려면 경험을 다시 찾아 주세요. 초안과 다 쓴 답은 그대로 남아요.</p>
      <RematchButton questionId={currentQuestionId} onRematch={rematch.onRematch} busy={rematch.busy} label="이 문항에서 경험 다시 찾기" />
    </div>}
    {run.status === "RUNNING" && <div className="grid gap-2">
      <RunningLine run={run} canceling={!!acting} onCancel={() => void control.cancel()} />
      {actionError && <p role="alert" className="m-0 text-note text-error">{actionError}</p>}
      {pollState === "retrying" && <p className="m-0 text-note text-muted">진행 상황을 불러오지 못했어요. 다시 시도하고 있어요.</p>}
      {pollState === "stopped" && <div role="alert" className={notice}>
        <p className="m-0 text-error">진행 상황을 불러오지 못해 확인을 멈췄어요. 일은 서버에서 이어지고 있을 수 있어요.</p>
        <Button size="sm" variant="secondary" className="justify-self-start" onClick={control.resumePolling}>다시 불러오기</Button>
      </div>}
    </div>}
    {run.status === "FAILED" && <div role="alert" className={notice}>
      <p className="m-0 text-error">{whyFailed(run.error)}</p>
      <Button size="sm" variant="secondary" className="justify-self-start" title="분석 1회" disabled={starting || exhausted} onClick={() => void control.retry()}>다시 시도</Button>
    </div>}
    {run.status === "CANCELED" && <p className="m-0 text-note text-muted">그만뒀어요.</p>}
    {run.status === "DONE" && <ResultLink run={run} />}
  </section>;
}

export function ChagokComposer({ control, hasQuestion, hasDraft }: { control: ChagokRunControl; hasQuestion: boolean; hasDraft: boolean }) {
  const { run, draft, starting, failure, conflict, conflictError } = control;
  const waitingConfirm = run?.status === "WAITING_CONFIRM";
  // 0회면 보내기 · 칩을 막는다(S-15 · FE#391). 채팅처럼 연달아 쓰는 곳이라 「분석 1회」는 늘 보이지 않고 3회 이하일 때만 경고한다(FE#434)
  const exhausted = useAnalysisExhausted(1, starting);
  const blocked = starting || waitingConfirm || !!conflict || exhausted;
  const submit = () => { if (!blocked) void control.send(draft); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };
  return <div className="grid gap-2 border-t border-hairline bg-canvas px-4 pt-3 pb-4">
    {conflict && <div role="alert" className={notice}>
      <p className="m-0">차곡이가 다른 일을 하고 있어요. 어떻게 할까요?</p>
      {conflictError && <p className="m-0 text-error">{conflictError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={inlineAction} disabled={starting} onClick={() => void control.restart()}>그만두고 새로 시작</Button>
        <Button size="sm" variant="secondary" disabled={starting} onClick={() => void control.wait()}>기다리기</Button>
      </div>
    </div>}
    {failure && <div role="alert" className={notice}>
      <p className="m-0 text-error">{whyFailed(failure.error)}</p>
      {failure.error.code !== "TEXT_TOO_LONG" && failure.error.code !== "DAILY_LIMIT_EXCEEDED" && <Button size="sm" variant="secondary" className="justify-self-start" title="분석 1회" disabled={starting || exhausted} onClick={() => void control.retry()}>다시 시도</Button>}
    </div>}
    {waitingConfirm && <p className="m-0 text-note text-muted">확인 카드에 답하면 새 부탁을 할 수 있어요.</p>}
    {hasQuestion && <div className="flex flex-wrap gap-1.5">
      {PRESETS[hasDraft ? "afterDraft" : "beforeDraft"].map(p => <button key={p.label} type="button" title="분석 1회" disabled={blocked} onClick={() => void control.send(p.text)}
        className="rounded-full border border-hairline-soft bg-surface-soft px-2.5 py-1 text-xs text-ink transition-colors hover:bg-surface-strong disabled:opacity-50">{p.label}</button>)}
    </div>}
    <form className="flex items-end gap-1.5 rounded-md border border-hairline py-1 pr-1 pl-3.5" onSubmit={e => { e.preventDefault(); submit(); }}>
      {/* 높이만 글에 맞춰 늘고(최대 128) 폭은 남은 자리로 고정 — 띄어쓰기 없는 긴 글도 줄을 바꿔 보내기 버튼을 밀지 않는다 */}
      <textarea rows={1} value={draft} onChange={e => control.setDraft(e.target.value)} onKeyDown={onKeyDown} aria-label="차곡이에게 부탁하기"
        placeholder="차곡이에게 부탁하기 — 예: WebSocket 경험 찾아 줘"
        className="field-sizing-content max-h-32 min-h-[34px] w-0 min-w-0 flex-1 resize-none border-0 [overflow-wrap:anywhere] bg-transparent py-1.5 text-note leading-[22px] outline-0 placeholder:text-muted" />
      <Button size="icon" className="size-[34px] shrink-0 rounded-full" type="submit" title="분석 1회" disabled={blocked || !draft.trim()} aria-label="보내기"><ArrowUpIcon aria-hidden="true" /></Button>
    </form>
    {exhausted ? failure?.error.code !== "DAILY_LIMIT_EXCEEDED" && <p role="status" className="m-0 text-xs text-review">{ANALYSIS_EXHAUSTED_NOTE}</p> : <LowAnalysisNotice running={starting} />}
  </div>;
}
