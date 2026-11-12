"use client";

// 차곡이 패널 — 시안 6 apply.html 오른쪽 「AI 동료」. 문항을 읽고 → 맞는 경험을 고르고 → 지난 보완을 다시 쓰고 → 빠진 것만 묻는다.
// 보이는 말은 전부 이 문항의 실제 결과(요구사항 · 추천 · evidence · 되묻기)에서 만든다 — 지어낸 진행 단계를 보이지 않는다(대회 규칙 1 · 2).
// 그 아래에 부탁 입력과 차곡이가 도구로 일하는 과정(S-31)이 붙는다 — chagok-run.tsx
import { useEffect, useRef, useState } from "react";
import { CheckIcon, MinusCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Answer, Clarification, DraftOmission, QuestionDetail, QuestionExperience, RequirementStatus, Supplement } from "@/lib/api/question-types";
import { AnsweredClarification, AnswerForm, AskFold, AskHead, AskQuestion, bubble, ClarifyBlock, clarifyList, openItem, type AnswerHandler } from "./clarifications";
import { AnsweredOmission, answerError, DraftFollowUp, draftAsks, OmissionHead, omissionSource, type DraftPanelActions } from "./draft-omissions";
import { isSupposedPair } from "./answer-draft";
import { skipAsks, unskipAsks, useSkippedAsks } from "./ask-memory";
import { shortName } from "./question-result";
import { ChagokComposer, ChagokRunFeed, type RedraftChip } from "./chagok-run";
import type { Rematch } from "./rematch-button";
import type { ChagokRunControl } from "./use-chagok-run";
import { NewFactCandidates } from "./new-fact-candidates";
import { useConfirmedAnswer } from "./use-confirmed-answer";

/** 요구사항 판정(S-19) — 공고 탭의 줄 판정(S-93)도 같은 글자 · 아이콘 · 색 */
export const JUDGMENT: Record<RequirementStatus, { label: string; icon: typeof CheckIcon; tone: string }> = {
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

/** 「이 답에서 경험 쌓기」(S-48 · FE#543 — 옛 「새 경험 후보」)를 패널에서 찾고 고른다(FE#270) — 답은 화면이 받아 둔 문항의 것을 같이 쓴다 */
export type NewFactActions = { onAnswerChange: (id: number, answer: Answer | null) => void };

export function ChagokPanel({ question, index, originOf, onAnswer, onClose, draftActions, control, newFacts, onRematch, postingOpen = false }: {
  question: QuestionDetail | null; index: number; originOf: SupplementOrigin; onAnswer: AnswerHandler; onClose: () => void; draftActions: DraftPanelActions; control: ChagokRunControl; newFacts: NewFactActions; onRematch: Rematch;
  /** 지원 화면이 「공고」 탭을 보고 있다(S-93) — 공고 되묻기는 탭 안에서 답하니 패널은 그쪽을 가리킨다 */
  postingOpen?: boolean;
}) {
  // 단계가 쌓이면 맨 아래를 보인다
  const body = useRef<HTMLDivElement>(null);
  const progress = control.run && `${control.run.runId}:${control.run.status}:${control.run.steps.length}`;
  const restoredQuestionId = control.restoreRunId !== null ? question?.id : null;
  const restoredQuestionStatus = control.restoreRunId !== null ? question?.status : null;
  // S-47: 복원한 일이 먼저 도착하고 문항 Feed가 늦게 붙어도 확인 카드가 아래로 밀리지 않게 한다.
  useEffect(() => { if (progress && body.current) body.current.scrollTop = body.current.scrollHeight; }, [progress, restoredQuestionId, restoredQuestionStatus]);
  // 「초안 다시 만들기」 칩으로 펼친 설정 — 문항을 바꾸면 접힌 채로 돌아간다(FE#547)
  const [redraftFor, setRedraftFor] = useState<number | null>(null);
  const redraftOpen = question !== null && redraftFor === question.id;
  const draft = question?.draft;
  const redraft: RedraftChip | null = question && draft?.status === "COMPLETED" ? {
    open: redraftOpen, free: !!draft.freeRegenerate,
    newAnswers: draft.omitted.filter(o => o.supplementId !== null && !isSupposedPair(draft, o)).length,
    onToggle: () => setRedraftFor(redraftOpen ? null : question.id),
  } : null;
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
      {question ? <Feed key={question.id} question={question} originOf={originOf} onAnswer={onAnswer} draftActions={draftActions} composerOpen={redraftOpen} onComposerClose={() => setRedraftFor(null)} /> : <p className={bubble}>{postingOpen ? "공고 줄 되묻기는 공고 탭에서 답할 수 있어요. 문항을 더하면 문항도 같이 봐 둘게요." : "문항을 고르면 읽어 보고 맞는 경험을 찾아 둘게요."}</p>}
      {/* 흐름의 끝 — 다 쓴 답에서 새로 쓴 사실을 경험으로(S-48) */}
      {question?.answer && <PanelNewFacts key={`facts-${question.id}`} question={question} {...newFacts} />}
      {!control.restoring && !control.restoreError && <ChagokRunFeed control={control} currentQuestionId={question?.id ?? null}
        rematch={question?.status === "COMPLETED" ? { onRematch, busy: draftActions.savingAnswer || draftActions.requestingDraft || question.draft?.status === "ANALYZING" } : null} />}
    </div>
    <ChagokComposer control={control} hasQuestion={!!question} hasDraft={question?.draft?.status === "COMPLETED"} redraft={redraft} />
  </div>;
}

function PanelNewFacts({ question, onAnswerChange }: { question: QuestionDetail } & NewFactActions) {
  // 진행 중 확인은 답칸이 한다 — 패널이 닫혀도 「다 썼어요」 잠금이 풀리게
  const confirmed = useConfirmedAnswer(question.id, question.answer ?? null, onAnswerChange, { poll: false });
  return <div className="mt-2.5"><NewFactCandidates confirmed={confirmed} /></div>;
}

/** 「차곡이가 물어볼 것」의 질문 하나 — 문항 되묻기(S-22) 또는 초안 빈칸 질문(S-27). 글자가 같은 중복은 ids 에 모은다 */
type AskEntry = {
  key: string; question: string; experienceId: number | null; answered: boolean;
  /** 이 줄이 대신하는 되묻기 ID — 답은 첫 ID 로 보내고, 건너뛰기는 전부 */
  ids: number[];
  supplement?: Supplement;
  source: { kind: "draft"; item: DraftOmission } | { kind: "ask"; c: Clarification; experience: QuestionExperience; activityName: string };
};

/** 「거의 같은」 질문 — 공백 · 문장부호 · 기호를 빼고 글자가 같다(AI 를 부르지 않는다 · FE#547) */
const sameText = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, "");

/** 「차곡이가 물어볼 것」 한 블록의 질문 — 초안 빈칸 질문(S-27, 위) + 문항 되묻기(추천 경험에 붙은 것 · S-22).
 *  같은 경험의 같은 글 질문은 하나로, 건너뛴 질문(S-23 · 이 브라우저에만)은 따로 뺀다.
 *  위 막대의 「차곡이 질문 N」도 이것으로 센다 — 둘이 어긋나지 않게(FE#383) */
export function chagokAsks(q: QuestionDetail, skipped: ReadonlySet<number>) {
  const fromDraft: AskEntry[] = draftAsks(q).map(item => ({
    key: `d${item.clarificationId}`, question: item.question!, experienceId: item.experienceId, answered: item.supplementId !== null,
    ids: [item.clarificationId!], supplement: omissionSource(q, item).supplement, source: { kind: "draft", item },
  }));
  const asks: AskEntry[] = q.clarifications.flatMap(c => {
    const r = q.recommendations.find(r => r.experience.id === c.experienceId);
    return r ? [{
      key: `c${c.id}`, question: c.question, experienceId: c.experienceId, answered: c.supplementId !== null,
      ids: [c.id], supplement: r.experience.supplements.find(s => s.id === c.supplementId), source: { kind: "ask" as const, c, experience: r.experience, activityName: r.activity.name },
    }] : [];
  });
  // 초안 빈칸 질문과 문항 되묻기는 답이 같은 보완으로 쌓이니 한 블록으로 — 초안 질문이 위(FE#336)
  const all = [...fromDraft, ...asks];
  const answered = all.filter(e => e.answered);
  const textKey = (e: AskEntry) => `${e.experienceId ?? e.key}|${sameText(e.question) || e.key}`;
  // 같은 경험에서 이미 답한 글과 같은 질문은 다시 묻지 않는다
  const answeredKeys = new Set(answered.map(textKey));
  const open = new Map<string, AskEntry>();
  for (const e of all) {
    if (e.answered || answeredKeys.has(textKey(e))) continue;
    const prev = open.get(textKey(e));
    open.set(textKey(e), prev ? { ...prev, ids: [...prev.ids, ...e.ids] } : e);
  }
  const pending = [...open.values()];
  const isSkipped = (e: AskEntry) => e.ids.some(id => skipped.has(id));
  const live = pending.filter(e => !isSkipped(e));
  return { live, answered, skipped: pending.filter(isSkipped), left: live.length, attention: answered.some(e => e.supplement?.mcpChange) };
}

/** 답할 질문을 경험별로 — 경험 머리 한 번, 그 아래 질문들. 묶음 순서 · 안 순서는 처음 나온 순서 그대로 */
function byExperience(entries: AskEntry[]) {
  const groups: { key: string; entries: AskEntry[] }[] = [];
  for (const e of entries) {
    const key = e.experienceId !== null ? `e${e.experienceId}` : e.key;
    const group = groups.find(g => g.key === key);
    if (group) group.entries.push(e); else groups.push({ key, entries: [e] });
  }
  return groups;
}

function AskGroupHead({ entry, question }: { entry: AskEntry; question: QuestionDetail }) {
  const s = entry.source;
  return s.kind === "draft" ? <OmissionHead item={s.item} question={question} />
    : <AskHead activityId={s.experience.activityId} activityName={s.activityName} content={s.experience.content} questionId={question.id} />;
}

function OpenAsk({ entry, onAnswer, draftDisabled, onRefreshDraft }: { entry: AskEntry; onAnswer: AnswerHandler; draftDisabled: boolean; onRefreshDraft: () => void }) {
  const fromDraft = entry.source.kind === "draft";
  return <li className={cn(openItem, "group/ask")}>
    <AnswerForm label={entry.question} disabled={fromDraft && draftDisabled}
      question={<AskQuestion text={entry.question} onSkip={() => skipAsks(entry.ids)}
        note={entry.ids.length > 1 && `비슷한 질문 ${entry.ids.length}개를 하나로 모았어요`} />}
      onSave={async text => {
        try { await onAnswer(entry.ids[0], text); return null; }
        catch (e) { return fromDraft ? answerError(e) : e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."; }
      }}
      after={fromDraft && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-10" disabled={draftDisabled} onClick={onRefreshDraft}>초안 상태 확인</Button>} />
  </li>;
}

function AsksBlock({ question: q, onAnswer, draftActions }: { question: QuestionDetail; onAnswer: AnswerHandler; draftActions: DraftPanelActions }) {
  const skippedIds = useSkippedAsks();
  const { live, answered, skipped, left, attention } = chagokAsks(q, skippedIds);
  // 답한 것만 남으면 블록을 숨긴다 — 이미 경험에 쌓였다. 건너뛴 것이 있으면 되돌릴 자리로 남긴다
  if (!left && !skipped.length && !attention) return null;
  const draftDisabled = draftActions.savingAnswer || draftActions.requestingDraft || q.draft?.status === "ANALYZING";
  const refreshDraft = () => { void draftActions.onRefresh().catch(() => { /* 실패하면 다음 갱신에서 다시 읽는다 */ }); };
  return <ClarifyBlock questionId={q.id} title="차곡이가 물어볼 것" info="답은 그 경험에 보완으로 쌓이고 다음 초안에 들어가요. 기억나지 않는 질문은 건너뛰어도 돼요." left={left} attention={attention} openSignal={draftActions.focusRequest}>
    {byExperience(live).map((group, i) => <div key={group.key} className={cn("grid min-w-0 pt-3", i > 0 && "border-t border-hairline-soft")}>
      <AskGroupHead entry={group.entries[0]} question={q} />
      <ul aria-label="차곡이의 질문" className={clarifyList}>
        {group.entries.map(e => <OpenAsk key={e.key} entry={e} onAnswer={onAnswer} draftDisabled={draftDisabled} onRefreshDraft={refreshDraft} />)}
      </ul>
    </div>)}
    {answered.length > 0 && <AskFold label={`답한 질문 ${answered.length}개 보기`} defaultOpen={attention}>
      <ul aria-label="답한 질문" className={clarifyList}>{answered.map(e => e.source.kind === "draft"
        ? <AnsweredOmission key={e.key} item={e.source.item} question={q} />
        : <AnsweredClarification key={e.key} activityName={e.source.activityName} clarification={e.source.c} experience={e.source.experience} questionId={q.id} />)}</ul>
    </AskFold>}
    {skipped.length > 0 && <AskFold label={`건너뛴 질문 ${skipped.length}`}>
      <ul aria-label="건너뛴 질문" className={cn(clarifyList, "pb-1")}>{skipped.map(e => <li key={e.key} className="flex min-w-0 items-start gap-2 py-2">
        <p className="m-0 min-w-0 flex-1 text-note leading-relaxed break-words text-muted">{e.question}</p>
        <button type="button" onClick={() => unskipAsks(e.ids)} aria-label={`다시 답하기: ${e.question}`}
          className="-my-2 inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-ink underline-offset-3 hover:underline lg:min-h-10">다시 답하기</button>
      </li>)}</ul>
    </AskFold>}
  </ClarifyBlock>;
}

/** S-25 — 앞 지원서에서 답한 보완을 근거로 다시 썼다는 말 · 여럿이어도 말풍선 하나(FE#569).
 *  접힌 한 줄이 기본이고, 「보기」를 펼치면 경험 · 어느 지원서 문항 · 인용 */
function ReusedBubble({ reused, originOf, asked }: { reused: { activity: string; supplement: Supplement }[]; originOf: SupplementOrigin; asked: (question: string) => boolean }) {
  const one = reused.length === 1;
  // 되묻기에 같은 질문이 남아 있으면 「다시 묻지 않는다」는 거짓이다 — 하나라도 안 남았을 때만 말한다
  const noAsk = reused.some(({ supplement }) => !asked(supplement.question));
  const head = one ? `${originOf(reused[0].supplement)}에서 알려 준 답을 「${shortName(reused[0].activity)}」 경험의 근거로 같이 썼어요`
    : `다른 지원서에서 알려 준 답 ${reused.length}개를 근거로 같이 썼어요`;
  const quote = "m-0 border-l-2 border-hairline pl-3 text-note whitespace-pre-wrap text-muted";
  return <div className={bubble}>
    <p className="m-0">{head}{noAsk && " · 다시 묻지 않을게요"}</p>
    <AskFold label="보기">
      {one ? <p className={cn(quote, "mb-1")}>{reused[0].supplement.answer}</p>
        : <ul aria-label="근거로 쓴 답" className={cn(clarifyList, "pb-1")}>{reused.map(({ activity, supplement }) => <li key={supplement.id} className="grid min-w-0 gap-1 py-2">
          <p className="m-0 text-note break-words text-ink">「{shortName(activity)}」 경험 · {originOf(supplement)}</p>
          <p className={quote}>{supplement.answer}</p>
        </li>)}</ul>}
    </AskFold>
  </div>;
}

function Feed({ question: q, originOf, onAnswer, draftActions, composerOpen, onComposerClose }: { question: QuestionDetail; originOf: SupplementOrigin; onAnswer: AnswerHandler; draftActions: DraftPanelActions; composerOpen: boolean; onComposerClose: () => void }) {
  if (q.status === "ANALYZING") return <div role="status" aria-live="polite" className={bubble}>문항을 읽고, 쌓인 경험에서 맞는 걸 찾고 있어요…</div>;
  if (q.status === "FAILED") return <p className={bubble}>이 문항은 분석하지 못했어요. 가운데의 「다시 시도」를 눌러 주세요.</p>;

  // S-25 — 이 문항 뒤가 아니라 앞에서 답한 보완이 근거로 쓰였으면 그렇다고 말한다
  const reused = q.recommendations.flatMap(r => r.evidence.filter(e => e.type === "SUPPLEMENT").flatMap(e => {
    const supplement = r.experience.supplements.find(s => s.id === e.id);
    return supplement && supplement.questionId !== q.id ? [{ activity: r.activity.name, supplement }] : [];
  }));
  const top = q.recommendations[0];

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
    <p className={bubble}>{top ? <>「{shortName(top.activity.name)}」 경험이 가장 잘 맞아요. 「꺼내 쓸 경험」에 {q.recommendations.length}개 골라 뒀어요.</>
      : <>지금 자료에서 이 문항에 연결할 경험을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.</>}</p>
    {reused.length > 0 && <ReusedBubble reused={reused} originOf={originOf} asked={text => q.clarifications.some(c => c.question === text)} />}
    <AsksBlock question={q} onAnswer={onAnswer} draftActions={draftActions} />
    <DraftFollowUp question={q} {...draftActions} composerOpen={composerOpen} onComposerClose={onComposerClose} />
  </div>;
}
