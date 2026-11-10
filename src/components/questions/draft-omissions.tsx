"use client";

import Link from "next/link";
import type { DraftFrame } from "@/lib/draft-frames";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { ApiError } from "@/lib/api/errors";
import type { DraftOmission, QuestionDetail } from "@/lib/api/question-types";
import { AnsweredItem, AnswerForm, bubble, ClarifyBlock, openItem, SupplementNote, type AnswerHandler } from "./clarifications";
import { DraftComposer } from "./draft-composer";
import { ActivityChip } from "./question-result";
import { requestError } from "./draft-errors";
import { scrollWithinContainer } from "@/lib/scroll";
import { cn } from "@/lib/utils";

function answerError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "CLARIFICATION_NOT_FOUND") return "초안이 바뀌어 이 질문에 답할 수 없어요. 초안 상태를 확인해 주세요.";
    if (e.code === "EXPERIENCE_NOT_FOUND") return "이 경험이 지워졌어요. 초안 상태를 확인해 주세요.";
    if (e.code === "CLARIFICATION_ALREADY_ANSWERED") return "이미 답한 질문이에요. 초안 상태를 확인해 주세요.";
  }
  return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요.";
}

/** 답할 수 있는 빠진 사실 — 경험 · 질문 · 되묻기 id 가 다 있어야 보완으로 쌓인다 */
const answerable = (item: DraftOmission) => item.question !== null && item.experienceId !== null && item.clarificationId !== null;

function OmissionItem({ item, question, onAnswer, onRefresh, disabled }: {
  item: DraftOmission; question: QuestionDetail; onAnswer: AnswerHandler;
  onRefresh: () => Promise<void>; disabled: boolean;
}) {
  const recommendation = question.recommendations.find(r => r.experience.id === item.experienceId);
  const supplement = recommendation?.experience.supplements.find(s => s.id === item.supplementId);
  const where = <>
    <p className="m-0 text-note leading-relaxed text-muted">{item.text}</p>
    {recommendation && <Link href={`/experience?activity=${recommendation.activity.id}&fromQuestion=${question.id}`}
      className="grid min-w-0 gap-1 text-note leading-relaxed text-evidence underline-offset-4 hover:underline">
      <ActivityChip name={recommendation.activity.name} />
      <span className="break-words">{recommendation.experience.content}</span>
    </Link>}
  </>;

  if (item.supplementId !== null) return <AnsweredItem question={item.question!} supplement={supplement} head={where}
    note={<SupplementNote supplement={supplement} activityName={recommendation?.activity.name} />} />;

  return <li className={openItem}>
    {where}
    <p className="m-0 break-words text-sm font-semibold text-ink">{item.question}</p>
    <AnswerForm label={item.question!} disabled={disabled} onSave={async text => {
      try { await onAnswer(item.clarificationId!, text); return null; }
      catch (e) { return answerError(e); }
    }} after={<Button variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={() => void onRefresh()}>초안 상태 확인</Button>} />
  </li>;
}

export type DraftPanelActions = {
  onGenerate: (ids: number[], frame?: DraftFrame, useContext?: boolean) => Promise<void>; onRefresh: () => Promise<void>;
  savingAnswer: boolean; requestingDraft: boolean; focusRequest: number;
  picks: number[]; onResetPicks: (questionId: number) => void;
};

/** 시안 6 mateFeed: 빠진 사실 질문 → 내 답 → 보완 저장 안내 → 초안 다시 만들기. */
export function DraftFollowUp({ question, onAnswer, onGenerate, onRefresh, savingAnswer, requestingDraft, focusRequest, picks, onResetPicks }: {
  question: QuestionDetail; onAnswer: AnswerHandler;
} & DraftPanelActions) {
  const target = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「초안 부탁하기」(FE#249) — 패널이 이미 열려 있어도 반응이 보이게: 패널 안에서만 「초안 준비」로 옮기고, 카드를 한 번 강조하고,
  // 초점은 「초안 만들기」로(못 누르는 상태면 카드로). 메인 페이지는 움직이지 않는다
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (!focusRequest || !target.current) return;
    const section = target.current;
    scrollWithinContainer(section);
    const generate = section.querySelector<HTMLButtonElement>("[data-draft-generate]");
    (generate && !generate.disabled ? generate : section).focus({ preventScroll: true });
    // 렌더 중이 아니라 효과 안에서 한 번 켰다가 끈다 — 같은 요청을 여러 번 눌러도 다시 강조한다
    const on = setTimeout(() => setHighlight(true), 0);
    const off = setTimeout(() => setHighlight(false), 1200);
    return () => { clearTimeout(on); clearTimeout(off); setHighlight(false); };
  }, [focusRequest]);
  const draft = question.draft;
  const asks = draft?.omitted.filter(answerable) ?? [];
  const unlinked = draft?.omitted.filter(item => !answerable(item)) ?? [];
  const supplementOf = (item: DraftOmission) => question.recommendations.find(r => r.experience.id === item.experienceId)?.experience.supplements.find(s => s.id === item.supplementId);
  const analyzing = requestingDraft || draft?.status === "ANALYZING";
  const disabled = savingAnswer || analyzing || refreshing;
  const refresh = async () => {
    if (pending.current || disabled) return;
    pending.current = true; setRefreshing(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError(requestError(e)); }
    finally { pending.current = false; setRefreshing(false); }
  };
  return <section ref={target} tabIndex={-1} aria-label="차곡이의 초안" data-highlight={highlight || undefined}
    // 강조는 테두리 한 번 — 움직임 줄이기면 서서히 사라지지 않고 바로 켜졌다 꺼진다
    className={cn("mt-3 grid min-w-0 scroll-mt-4 gap-2.5 rounded-sm border-t border-hairline pt-4 outline-2 outline-offset-4 motion-safe:transition-[outline-color] motion-safe:duration-700",
      highlight ? "outline-ink" : "outline-transparent")}>
    <h3 className="m-0 text-xs font-semibold text-muted">{draft ? "초안 보완" : "초안 준비"}</h3>
    {analyzing ? <p role="status" className={bubble}>고른 경험과 보완을 읽고 초안을 만드는 중이에요…</p> : draft ? <>
      {draft?.status === "FAILED" ? <p className={bubble}>초안을 완성하지 못했어요. 아래 설정에서 다시 요청해 주세요.</p> : <>
        <p className={bubble}>{!draft?.sentences.length ? "고른 기록에서 받칠 내용을 찾지 못해 문장을 쓰지 않았어요. 경험이 없다는 뜻은 아니에요." : draft.omitted.length ? "초안을 답칸에 넣었어요. 아래 내용은 자료에서 확인하지 못해 쓰지 않았어요." : "초안을 답칸에 넣었어요. 밑줄 · 빈칸을 눌러 근거와 이유를 확인해 주세요."}</p>
        {asks.length > 0 && <ClarifyBlock title="초안에 대한 되묻기" total={asks.length} answered={asks.filter(item => item.supplementId !== null).length}
          attention={asks.some(item => supplementOf(item)?.mcpChange)}>
          <p className="m-0 text-note leading-relaxed text-muted"><b className="font-semibold text-body">자료에 없어 쓰지 않았어요 · AI 해석</b><InfoTip label="초안에 대한 되묻기" className="align-middle">기억나는 것만 알려 주세요. 답은 선택이고, 건너뛰어도 초안을 복사할 수 있어요.</InfoTip></p>
          <ul aria-label="초안의 빠진 사실" className="m-0 grid list-none gap-1 p-0">
            {asks.map(item => <OmissionItem key={item.clarificationId} item={item} question={question} onAnswer={onAnswer} onRefresh={refresh} disabled={disabled} />)}
          </ul>
        </ClarifyBlock>}
        {/* 경험에 붙지 않는 빈칸(지원 동기 등)은 묻지 않고 직접 쓸 거리로만 — 보완으로 저장하지 않는다 */}
        {unlinked.length > 0 && <div className="grid min-w-0 gap-1 px-1">
          <p className="m-0 text-xs font-semibold text-muted">직접 쓸 거리 · 보완으로 저장하지 않아요</p>
          <ul aria-label="직접 쓸 거리" className="m-0 grid list-disc gap-1 pl-4 text-note leading-relaxed text-body">
            {unlinked.map((item, i) => <li key={i} className="break-words">{item.text}</li>)}
          </ul>
        </div>}
      </>}
      {savingAnswer && <p role="status" className={bubble}>보완으로 쌓는 중이에요…</p>}
    </> : null}
    <DraftComposer question={question} onGenerate={onGenerate} onRefresh={onRefresh} savingAnswer={savingAnswer} requestingDraft={requestingDraft || refreshing} picks={picks} onResetPicks={onResetPicks} />
    {error && <div className={bubble}>
      <p role="alert" className="m-0 text-error">{error}</p>
      <Button variant="secondary" size="sm" className="min-h-11 justify-self-start" disabled={disabled} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
  </section>;
}
