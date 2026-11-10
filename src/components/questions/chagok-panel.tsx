"use client";

// 차곡이 패널 — 시안 6 apply.html 오른쪽 「AI 동료」. 문항을 읽고 → 맞는 경험을 고르고 → 지난 보완을 다시 쓰고 → 빠진 것만 묻는다.
// 보이는 말은 전부 이 문항의 실제 결과(요구사항 · 추천 · evidence · 되묻기)에서 만든다 — 지어낸 진행 단계를 보이지 않는다(대회 규칙 1 · 2).
// 그 아래에 부탁 입력과 차곡이가 도구로 일하는 과정(S-31)이 붙는다 — chagok-run.tsx
import { useEffect, useRef } from "react";
import { CheckIcon, MinusCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuestionDetail, RequirementStatus, Supplement } from "@/lib/api/question-types";
import { bubble, ClarificationItem, ClarifyBlock, clarifyList, type AnswerHandler } from "./clarifications";
import { DraftFollowUp, type DraftPanelActions } from "./draft-omissions";
import { shortName } from "./question-result";
import { ChagokComposer, ChagokRunFeed } from "./chagok-run";
import type { ChagokRunControl } from "./use-chagok-run";

const JUDGMENT: Record<RequirementStatus, { label: string; icon: typeof CheckIcon; tone: string }> = {
  SUPPORTED: { label: "근거 있음", icon: CheckIcon, tone: "text-evidence" },
  PARTIAL: { label: "일부 확인됨", icon: MinusCircleIcon, tone: "text-muted" },
  NOT_FOUND: { label: "자료에서 확인 안 됨", icon: WarningCircleIcon, tone: "text-muted" },
};

const EYE_WHITE = "M19 11.5C19 17.8513 15.2733 23 9.56875 23C4.16063 23 0 17.8513 0 11.5C0 5.14873 4.26832 0 9.56875 0C14.8692 0 19 5.14873 19 11.5Z";
const EYES = [
  { x: 24.27, pupil: "M17 11.5C17 16.7467 13.866 21 10 21C6.13401 21 3 16.7467 3 11.5C3 6.25329 6.13401 2 10 2C13.866 2 17 6.25329 17 11.5Z", shine: { x: 13, width: 4 } },
  { x: 48.27, pupil: "M16 11.5C16 16.7467 12.866 21 9 21C5.13401 21 2 16.7467 2 11.5C2 6.25329 5.13401 2 9 2C12.866 2 16 6.25329 16 11.5Z", shine: { x: 12, width: 6 } },
];

/** 차곡이 — 블록 셋에 눈(디자인 데모 character-demo · FE#276). public/brand/mascot.svg 와 같은 그림이다.
 *  animate 면 블록이 위에서 떨어져 쌓이고 몇 초마다 눈을 깜빡인다(globals.css .chagok-char). 움직임 줄이기면 멈춘 그림 */
export function Mascot({ size = 28, animate = false, className }: { size?: number; animate?: boolean; className?: string }) {
  return <svg viewBox="0 0 83 91" width={size * 83 / 91} height={size} aria-hidden="true" className={cn("shrink-0 overflow-visible", animate && "chagok-char", className)}>
    <rect className="chagok-block chagok-block--pink" x="9" y="60" width="73.115" height="30.106" rx="10.752" fill="var(--record-pink)" />
    <rect className="chagok-block chagok-block--green" x="0" y="30" width="73.832" height="30.106" rx="10.752" fill="var(--record-green)" />
    <g className="chagok-block chagok-block--blue">
      <rect x="8" y="0" width="73.832" height="30.106" rx="10.752" fill="var(--mark)" />
      {EYES.map(eye => <g key={eye.x} transform={`translate(${eye.x} 5)`}><g className="chagok-eye">
        <path d={EYE_WHITE} fill="var(--canvas)" />
        <path d={eye.pupil} fill="var(--ink)" />
        <rect x={eye.shine.x} y="14" width={eye.shine.width} height="3" fill="var(--canvas)" />
      </g></g>)}
    </g>
  </svg>;
}

/** 보완이 어디서 나왔나 — 「OO 부트캠프 문항」 · 「이 지원의 문항 2」 */
export type SupplementOrigin = (supplement: Supplement) => string;

export function ChagokPanel({ question, index, originOf, onAnswer, onClose, draftActions, control }: {
  question: QuestionDetail | null; index: number; originOf: SupplementOrigin; onAnswer: AnswerHandler; onClose: () => void; draftActions: DraftPanelActions; control: ChagokRunControl;
}) {
  // 단계가 쌓이면 맨 아래를 보인다
  const body = useRef<HTMLDivElement>(null);
  const progress = control.run && `${control.run.runId}:${control.run.status}:${control.run.steps.length}`;
  const restoredQuestionId = control.restoreRunId !== null ? question?.id : null;
  const restoredQuestionStatus = control.restoreRunId !== null ? question?.status : null;
  // S-47: 복원한 일이 먼저 도착하고 문항 Feed가 늦게 붙어도 확인 카드가 아래로 밀리지 않게 한다.
  useEffect(() => { if (progress && body.current) body.current.scrollTop = body.current.scrollHeight; }, [progress, restoredQuestionId, restoredQuestionStatus]);
  return <div className="flex h-full min-h-0 flex-col bg-surface-soft">
    <header className="flex items-center gap-2 border-b border-hairline bg-canvas px-4 py-3">
      <Mascot />
      <b className="text-ui">차곡이</b><small className="text-xs text-muted">경험 동료</small>
      {question && <span className="ml-auto text-note text-muted">문항 {index + 1}</span>}
      <Button variant="ghost" size="icon" className={question ? "" : "ml-auto"} onClick={onClose} aria-label="차곡이 닫기"><XIcon /></Button>
    </header>
    <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {control.restoring && <p role="status" className={bubble}>차곡이 일을 다시 열고 있어요…</p>}
      {control.restoreError && <div role="alert" className={bubble}><p>{control.restoreError}</p><Button variant="secondary" onClick={control.restore}>일 다시 불러오기</Button></div>}
      {question ? <Feed key={question.id} question={question} originOf={originOf} onAnswer={onAnswer} draftActions={draftActions} /> : <p className={bubble}>문항을 고르면 읽어 보고 맞는 경험을 찾아 둘게요.</p>}
      {!control.restoring && !control.restoreError && <ChagokRunFeed control={control} currentQuestionId={question?.id ?? null} />}
    </div>
    <ChagokComposer control={control} hasQuestion={!!question} />
  </div>;
}

function Feed({ question: q, originOf, onAnswer, draftActions }: { question: QuestionDetail; originOf: SupplementOrigin; onAnswer: AnswerHandler; draftActions: DraftPanelActions }) {
  if (q.status === "ANALYZING") return <div role="status" aria-live="polite" className={bubble}>문항을 읽고, 쌓인 경험에서 맞는 걸 찾고 있어요…</div>;
  if (q.status === "FAILED") return <p className={bubble}>이 문항은 분석하지 못했어요. 가운데의 「다시 시도」를 눌러 주세요.</p>;

  const activityOf = (experienceId: number) => q.recommendations.find(r => r.experience.id === experienceId)?.activity.name ?? "이 경험";
  // S-25 — 이 문항 뒤가 아니라 앞에서 답한 보완이 근거로 쓰였으면 그렇다고 말한다
  const reused = q.recommendations.flatMap(r => r.evidence.filter(e => e.type === "SUPPLEMENT").flatMap(e => {
    const supplement = r.experience.supplements.find(s => s.id === e.id);
    return supplement && supplement.questionId !== q.id ? [{ activity: r.activity.name, supplement }] : [];
  }));
  const top = q.recommendations[0];
  const asks = q.clarifications.flatMap(c => {
    const experience = q.recommendations.find(r => r.experience.id === c.experienceId)?.experience;
    return experience ? [{ c, experience }] : [];
  });

  return <div className="grid gap-2.5">
    <section aria-label="문항이 보려는 것" className={bubble}>
      <p className="m-0">문항을 읽어 봤어요. 이 문항이 보려는 건 {q.requirements.length}가지예요.</p>
      <ul className="m-0 grid list-none gap-1.5 p-0">{q.requirements.map((r, i) => {
        const { label, icon: Icon, tone } = JUDGMENT[r.status];
        return <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-hairline-soft pt-1.5 text-note">
          <span>{r.text}</span>
          <span className={`inline-flex items-center gap-0.5 font-medium whitespace-nowrap ${tone}`}><Icon aria-hidden="true" className="size-3.5" />{label}</span>
        </li>;
      })}</ul>
      <p className="m-0 text-note text-muted">자료에 없다고 경험이 없는 건 아니에요.{q.clarifications.length > 0 && " 몇 가지만 물어볼게요."}</p>
    </section>
    <p className={bubble}>{top ? <>「{shortName(top.activity.name)}」 경험이 가장 잘 맞아요. 「참고」에 {q.recommendations.length}개 골라 뒀어요.</>
      : <>지금 자료에서 이 문항에 연결할 경험을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.</>}</p>
    {reused.map(({ activity, supplement }) => <div key={supplement.id} className={bubble}>
      <p className="m-0">{originOf(supplement)}에서 알려 준 답을 「{shortName(activity)}」 경험의 근거로 같이 썼어요.</p>
      <p className="m-0 border-l-2 border-hairline pl-3 text-note whitespace-pre-wrap text-muted">{supplement.answer}</p>
      {!q.clarifications.some(c => c.question === supplement.question) && <p className="m-0 text-note text-muted">그 부분은 다시 묻지 않을게요.</p>}
    </div>)}
    {asks.length > 0 && <ClarifyBlock title="문항에 대한 되묻기" total={asks.length} answered={asks.filter(({ c }) => c.supplementId !== null).length}
      attention={asks.some(({ c, experience }) => experience.supplements.find(s => s.id === c.supplementId)?.mcpChange)}>
      <ul aria-label="차곡이의 질문" className={clarifyList}>{asks.map(({ c, experience }) =>
        <ClarificationItem key={c.id} activityName={activityOf(c.experienceId)} clarification={c} experience={experience} onAnswer={onAnswer} />)}</ul>
    </ClarifyBlock>}
    <DraftFollowUp question={q} onAnswer={onAnswer} {...draftActions} />
  </div>;
}
