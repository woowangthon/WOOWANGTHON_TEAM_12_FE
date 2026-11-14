"use client";

import type { DraftFrame } from "@/lib/draft-frames";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import type { DraftOmission, QuestionDetail } from "@/lib/api/question-types";
import { AnsweredItem, AskHead, bubble, SupplementNote } from "./clarifications";
import { DraftComposer } from "./draft-composer";
import { isSupposedPair } from "./answer-draft";
import { getBoxShows, subscribeBoxShows } from "./answer-box-state";
import { requestError } from "./draft-errors";
import { revealWithinContainer } from "@/lib/scroll";
import { cn } from "@/lib/utils";

export function answerError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "CLARIFICATION_NOT_FOUND") return "초안이 바뀌어 이 질문에 답할 수 없어요. 초안 상태를 확인해 주세요.";
    if (e.code === "EXPERIENCE_NOT_FOUND") return "이 경험이 지워졌어요. 초안 상태를 확인해 주세요.";
    if (e.code === "CLARIFICATION_ALREADY_ANSWERED") return "이미 답한 질문이에요. 초안 상태를 확인해 주세요.";
  }
  return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요.";
}

/** 답할 수 있는 빠진 사실 — 경험 · 질문 · 되묻기 id 가 다 있어야 보완으로 쌓인다 */
const answerable = (item: DraftOmission) => item.question !== null && item.experienceId !== null && item.clarificationId !== null;

/** 차곡이 패널의 되묻기 블록에 넣을 초안 빈칸 질문 — 다 된 초안만. AI 가정의 짝은 답칸 카드에서 확인하니 뺀다(S-79 · ADR-014) */
export function draftAsks(question: QuestionDetail): DraftOmission[] {
  const draft = question.draft;
  if (draft?.status !== "COMPLETED") return [];
  return draft.omitted.filter(item => !isSupposedPair(draft, item) && answerable(item));
}

/** 빠진 사실의 경험 · 답한 보완 — BE 가 붙인 값으로(ETC#261). 보조 재료 경험(S-75)은 추천에 없다.
 *  그 값이 없는 이전 응답만 추천 목록에서 찾는다 */
export function omissionSource(question: QuestionDetail, item: DraftOmission) {
  const recommendation = question.recommendations.find(r => r.experience.id === item.experienceId);
  const activityId = item.activityId ?? recommendation?.activity.id;
  const activityName = item.activityName ?? recommendation?.activity.name;
  const content = item.experienceContent ?? recommendation?.experience.content;
  const supplement = item.supplement !== undefined ? item.supplement ?? undefined
    : recommendation?.experience.supplements.find(s => s.id === item.supplementId);
  return { activityId, activityName, content, supplement };
}

/** 초안 빈칸 질문의 머리 — 문항 되묻기와 같은 모양(FE#464). 질문과 같은 말인 요약 줄(item.text)은 경험을 모를 때만 대신 보인다 */
export function OmissionHead({ item, question }: { item: DraftOmission; question: QuestionDetail }) {
  const { activityId, activityName, content } = omissionSource(question, item);
  return activityName || content ? <AskHead activityId={activityId} activityName={activityName} content={content} questionId={question.id} />
    : <p className="m-0 text-note leading-relaxed text-muted">{item.text}</p>;
}

/** 답한 초안 빈칸 질문 — 「답한 질문 N개 보기」 안의 한 줄. 답할 질문은 차곡이 패널이 경험별로 묶어 그린다(FE#547) */
export function AnsweredOmission({ item, question }: { item: DraftOmission; question: QuestionDetail }) {
  const { activityName, supplement } = omissionSource(question, item);
  return <AnsweredItem question={item.question!} supplement={supplement} head={<OmissionHead item={item} question={question} />}
    note={<SupplementNote supplement={supplement} activityName={activityName ?? undefined} />} />;
}

export type DraftPanelActions = {
  onGenerate: (ids: number[], frame?: DraftFrame, useContext?: boolean) => Promise<void>; onRefresh: () => Promise<void>;
  savingAnswer: boolean; requestingDraft: boolean; focusRequest: number;
  picks: number[]; onResetPicks: (questionId: number) => void;
};

/** 시안 6 mateFeed: 빠진 사실 질문 → 내 답 → 보완 저장 안내 → 초안 다시 만들기.
 *  다 된 초안이 있으면 「초안 다시 만들기」 설정을 늘 펼쳐 두지 않는다 — 패널 아래 칩 줄의 「초안 다시 만들기」가 연다(FE#547) */
export function DraftFollowUp({ question, onGenerate, onRefresh, savingAnswer, requestingDraft, picks, onResetPicks, composerOpen = false, onComposerClose, revealRequest = 0 }: {
  question: QuestionDetail;
  /** 칩 · 「초안 설정 열기」로 「초안 다시 만들기」를 펼쳤다 */
  composerOpen?: boolean; onComposerClose?: () => void;
  /** 바뀌면 설정 카드를 보이고 강조한다 — 칩 · 가운데 「초안 부탁하기 · 초안 설정 열기」 어느 쪽이든(FE#627) */
  revealRequest?: number;
} & DraftPanelActions) {
  const target = useRef<HTMLElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「초안 부탁하기」(FE#249) — 패널이 이미 열려 있어도 반응이 보이게: 패널 안에서만 설정 카드가 보이게 옮기고, 카드를 한 번 강조하고,
  // 초점은 「초안 만들기 · 다시 만들기」로(못 누르는 상태면 카드로). 메인 페이지는 움직이지 않는다.
  // 강조 · 초점은 바깥 「초안 보완」 말고 설정 카드에 — 칩으로 펼칠 때도 같다(FE#627)
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    const card = composer.current ?? target.current;
    if (!revealRequest || !card) return;
    revealWithinContainer(card);
    const generate = card.querySelector<HTMLButtonElement>("[data-draft-generate]");
    (generate && !generate.disabled ? generate : card).focus({ preventScroll: true });
    // 렌더 중이 아니라 효과 안에서 한 번 켰다가 끈다 — 같은 요청을 여러 번 눌러도 다시 강조한다
    const on = setTimeout(() => setHighlight(true), 0);
    const off = setTimeout(() => setHighlight(false), 1200);
    return () => { clearTimeout(on); clearTimeout(off); setHighlight(false); };
  }, [revealRequest]);
  const draft = question.draft;
  // 답칸이 다 쓴 답을 보이거나 비어 있으면 「초안을 답칸에 넣었어요」라고 하지 않는다(FE#384 · FE#519)
  const shows = useSyncExternalStore(subscribeBoxShows, () => getBoxShows(question.id), () => null);
  // AI 가정의 짝은 「쓰지 않은 것」이 아니라 회색 문장으로 쓴 것 — 답칸의 그 문장 카드에서 확인한다(S-79 · ADR-014)
  // 경험에 붙지 않은 빈칸(포부 등)은 묻지 않는다 — 문장 속 빈칸이면 답칸의 빈칸 카드가 알린다(FE#382)
  const asks = question.draft ? draftAsks(question).filter(item => item.supplementId === null) : [];
  const analyzing = requestingDraft || draft?.status === "ANALYZING";
  // 처음 만들기 · 실패 · 만드는 중은 지금처럼 펼친다
  const folded = draft?.status === "COMPLETED" && !analyzing && !composerOpen;
  const disabled = savingAnswer || analyzing || refreshing;
  const refresh = async () => {
    if (pending.current || disabled) return;
    pending.current = true; setRefreshing(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError(requestError(e)); }
    finally { pending.current = false; setRefreshing(false); }
  };
  return <section ref={target} tabIndex={-1} aria-label="차곡이의 초안" className="mt-3 grid min-w-0 scroll-mt-4 gap-2.5 border-t border-hairline pt-4 outline-none">
    <h3 className="m-0 text-xs font-semibold text-muted">{draft ? "초안 보완" : "초안 준비"}</h3>
    {analyzing ? <p role="status" className={bubble}>고른 경험과 보완을 읽고 초안을 만드는 중이에요…</p> : draft ? <>
      {draft?.status === "FAILED" ? <p className={bubble}>초안을 완성하지 못했어요. 아래 설정에서 다시 요청해 주세요.</p> : <>
        {/* 초안 빈칸 질문은 문항 되묻기와 한 블록(「차곡이가 물어볼 것」)에서 묻는다(FE#336) */}
        <p className={bubble}>{!draft?.sentences.length ? "고른 기록에서 받칠 내용을 찾지 못해 문장을 쓰지 않았어요. 경험이 없다는 뜻은 아니에요."
          : shows ? `${shows === "empty" ? "지금 답칸은 비어 있어요." : "지금 답칸엔 다 쓴 답이 있어요."} 초안 글은 답칸 위 「수정 이력」에서 다시 넣을 수 있어요.${asks.length ? " 자료에 없어 쓰지 않은 건 위 「차곡이가 물어볼 것」에서 물어봐요." : ""}`
          : asks.length ? "초안을 답칸에 넣었어요. 자료에 없어 쓰지 않은 건 위 「차곡이가 물어볼 것」에서 물어봐요." : "초안을 답칸에 넣었어요. 밑줄 · 빈칸 · 회색 문장을 눌러 근거와 이유를 확인해 주세요."}</p>
      </>}
      {savingAnswer && <p role="status" className={bubble}>보완으로 쌓는 중이에요…</p>}
    </> : null}
    {/* 강조는 테두리 한 번 — 움직임 줄이기면 서서히 사라지지 않고 바로 켜졌다 꺼진다 */}
    {!folded && <div ref={composer} tabIndex={-1} data-highlight={highlight || undefined}
      className={cn("min-w-0 scroll-mt-4 rounded-md outline-2 outline-offset-2 motion-safe:transition-[outline-color] motion-safe:duration-700",
        highlight ? "outline-ink" : "outline-transparent")}>
      <DraftComposer question={question} onRefresh={onRefresh} savingAnswer={savingAnswer} requestingDraft={requestingDraft || refreshing} picks={picks} onResetPicks={onResetPicks}
        onGenerate={async (...args) => { await onGenerate(...args); onComposerClose?.(); }} />
    </div>}
    {error && <div className={bubble}>
      <p role="alert" className="m-0 text-error">{error}</p>
      <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-10 justify-self-start" disabled={disabled} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
  </section>;
}
