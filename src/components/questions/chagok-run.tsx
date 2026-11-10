"use client";

// 차곡이 일(S-31 · ETC ADR-007) — 시안 6 mock.js 의 mate__foot(부탁 칩 + 입력) · msg--me(내 부탁) · msg--ask(묻는 카드) · chagok.css .steps(단계).
// 보이는 단계는 전부 BE 의 Run 그대로다 — 지어낸 진행을 보이지 않고, 실패를 정해진 답으로 채우지 않는다(대회 규칙 1 · 2). 채팅창이 아니라 일 하나만 보인다
import { useState, type KeyboardEvent } from "react";
import { ArrowUpIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { foundExperiences, type ChagokConfirmStep, type ChagokRun, type ChagokToolCallStep, type FoundExperience } from "@/lib/api/chagok";
import { JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, type JobRole, type OrganizationType } from "@/lib/api/question-types";
import { bubble, inlineAction } from "./clarifications";
import { ActivityChip, RecommendationEvidence } from "./question-result";
import { whyFailed, type ChagokRunControl } from "./use-chagok-run";

/** 시안의 부탁 칩 중 도구가 있는 둘 — 근거 점검 · 초안은 그 도구가 생긴 뒤(S-45 · S-27) */
const PRESETS = [
  { label: "근거 찾기", text: "이 문항에 쓸 경험의 근거를 찾아 줘" },
  { label: "다른 경험으로", text: "지금 고른 경험 말고 이 문항에 쓸 다른 경험을 찾아 줘" },
];
const CARDS_AT_FIRST = 3;
const card = "m-0 grid gap-3 rounded-[4px_16px_16px_16px] border border-hairline bg-canvas p-3.5 text-sm leading-relaxed";
const notice = "m-0 grid gap-2 rounded-md border border-hairline bg-canvas p-3 text-note leading-relaxed";
const mark = "mt-0.5 grid size-[18px] place-items-center rounded-full text-on-primary";
const resultLink = "font-semibold text-evidence underline underline-offset-3";

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

function ToolStep({ step }: { step: ChagokToolCallStep }) {
  const [all, setAll] = useState(false);
  const found = foundExperiences(step.result);
  return <li className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-x-2 gap-y-2">
    <span className={`${mark} ${step.ok ? "bg-primary" : "bg-error"}`}>
      {step.ok ? <CheckIcon aria-hidden="true" className="size-3" weight="bold" /> : <XIcon aria-hidden="true" className="size-3" weight="bold" />}
    </span>
    <div className="min-w-0 text-note leading-relaxed">
      <p className="m-0 font-medium break-words text-ink">{step.label}</p>
      {step.summary && <p className="m-0 break-words text-muted">{step.summary}</p>}
      {!step.ok && step.error && <p className="m-0 break-words text-error">{step.error.message}</p>}
    </div>
    {found.length > 0 && <div className="col-span-2 grid min-w-0 gap-2">
      <ul aria-label="찾은 경험" className="m-0 grid list-none gap-2 p-0">
        {(all ? found : found.slice(0, CARDS_AT_FIRST)).map(f => <ExperienceCard key={f.experience.id} found={f} />)}
      </ul>
      {!all && found.length > CARDS_AT_FIRST && <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setAll(true)}>{found.length - CARDS_AT_FIRST}개 더 보기</Button>}
    </div>}
  </li>;
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
    <span>지원을 만들었어요.</span>
    <a className={resultLink} href={`/questions?question=${result.questionIds[0]}`}>열기</a>
  </div>;
  return <div className={line}>
    <span>자료를 넣었어요. 분석은 뒤에서 이어져요.</span>
    <a className={resultLink} href="/experience">열기</a>
  </div>;
}

export function ChagokRunFeed({ control, currentQuestionId }: { control: ChagokRunControl; currentQuestionId: number | null }) {
  const { run, pollState, acting, actionError, starting } = control;
  if (!run) return null;
  return <section aria-label="차곡이의 일" className="mt-2.5 grid gap-2.5 border-t border-hairline-soft pt-3">
    <div className="grid justify-items-end gap-1">
      <p className="m-0 line-clamp-4 max-w-[92%] rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-on-primary">{run.text}</p>
      {run.questionId !== null && run.questionId !== currentQuestionId && <small className="text-note text-muted">다른 문항에서 한 부탁이에요</small>}
    </div>
    <ol aria-live="polite" className="m-0 grid list-none gap-3 p-0">
      {run.steps.map(step => step.type === "TOOL_CALL" ? <ToolStep key={step.seq} step={step} />
        : step.type === "MESSAGE" ? <li key={step.seq} className={`${bubble} break-words`}>{step.text}</li>
        : <ConfirmCard key={step.seq} step={step} control={control} />)}
    </ol>
    {run.status === "RUNNING" && <div className="grid gap-2">
      <div role="status" className="flex items-center gap-2 text-note font-medium text-ink">
        <span aria-hidden="true" className="size-[18px] shrink-0 rounded-full border-2 border-ink border-r-transparent motion-safe:animate-spin" />
        <span className="min-w-0 flex-1">차곡이가 일하고 있어요</span>
        <Button size="sm" variant="secondary" disabled={!!acting} onClick={() => void control.cancel()}>그만</Button>
      </div>
      {actionError && <p role="alert" className="m-0 text-note text-error">{actionError}</p>}
      {pollState === "retrying" && <p className="m-0 text-note text-muted">진행 상황을 불러오지 못했어요. 다시 시도하고 있어요.</p>}
      {pollState === "stopped" && <div role="alert" className={notice}>
        <p className="m-0 text-error">진행 상황을 불러오지 못해 확인을 멈췄어요. 일은 서버에서 이어지고 있을 수 있어요.</p>
        <Button size="sm" variant="secondary" className="justify-self-start" onClick={control.resumePolling}>다시 불러오기</Button>
      </div>}
    </div>}
    {run.status === "FAILED" && <div role="alert" className={notice}>
      <p className="m-0 text-error">{whyFailed(run.error)}</p>
      <Button size="sm" variant="secondary" className="justify-self-start" disabled={starting} onClick={() => void control.retry()}>다시 시도</Button>
    </div>}
    {run.status === "CANCELED" && <p className="m-0 text-note text-muted">그만뒀어요.</p>}
    {run.status === "DONE" && <ResultLink run={run} />}
  </section>;
}

export function ChagokComposer({ control, hasQuestion }: { control: ChagokRunControl; hasQuestion: boolean }) {
  const { run, draft, starting, failure, conflict, conflictError } = control;
  const waitingConfirm = run?.status === "WAITING_CONFIRM";
  const blocked = starting || waitingConfirm || !!conflict;
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
      {failure.error.code !== "TEXT_TOO_LONG" && <Button size="sm" variant="secondary" className="justify-self-start" disabled={starting} onClick={() => void control.retry()}>다시 시도</Button>}
    </div>}
    {waitingConfirm && <p className="m-0 text-note text-muted">확인 카드에 답하면 새 부탁을 할 수 있어요.</p>}
    {hasQuestion && <div className="flex flex-wrap gap-1.5">
      {PRESETS.map(p => <button key={p.label} type="button" disabled={blocked} onClick={() => void control.send(p.text)}
        className="rounded-full border border-hairline-soft bg-surface-soft px-2.5 py-1 text-xs text-ink transition-colors hover:bg-surface-strong disabled:opacity-50">{p.label}</button>)}
    </div>}
    <form className="flex items-end gap-1.5 rounded-[20px] border border-hairline py-1 pr-1 pl-3.5" onSubmit={e => { e.preventDefault(); submit(); }}>
      {/* 높이만 글에 맞춰 늘고(최대 128) 폭은 남은 자리로 고정 — 띄어쓰기 없는 긴 글도 줄을 바꿔 보내기 버튼을 밀지 않는다 */}
      <textarea rows={1} value={draft} onChange={e => control.setDraft(e.target.value)} onKeyDown={onKeyDown} aria-label="차곡이에게 부탁하기"
        placeholder="차곡이에게 부탁하기 — 예: WebSocket 경험 찾아 줘"
        className="field-sizing-content max-h-32 min-h-[34px] w-0 min-w-0 flex-1 resize-none border-0 [overflow-wrap:anywhere] bg-transparent py-1.5 text-note leading-[22px] outline-0 placeholder:text-muted" />
      <Button size="icon" className="size-[34px] shrink-0 rounded-full" type="submit" disabled={blocked || !draft.trim()} aria-label="보내기"><ArrowUpIcon aria-hidden="true" /></Button>
    </form>
  </div>;
}
