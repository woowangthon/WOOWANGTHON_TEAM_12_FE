"use client";

// 되묻기(S-22 · S-23) — 시안 6 apply.html 차곡이 패널의 묻기. 답은 선택이고, 건너뛰면 아무것도 보내지 않는다.
// 말풍선을 한 줄씩 쌓지 않고 블록 하나(문항 · 초안)로 묶는다 — 답한 것은 접힌 한 줄, 답할 것만 상자로 강조(FE#268)
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpIcon, CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MCP_ANSWER_NOTE, mcpAnswerName } from "@/components/experience/supplement-list";
import { mcpClientName } from "@/lib/api/mcp";
import { MAX_ANSWER_LENGTH, type Clarification, type QuestionExperience, type Supplement } from "@/lib/api/question-types";
import { cn } from "@/lib/utils";
import { ActivityChip, shortName } from "./question-result";

export type AnswerHandler = (clarificationId: number, answer: string) => Promise<void>;

export const bubble = "m-0 grid max-w-[92%] gap-1.5 justify-self-start rounded-[4px_16px_16px_16px] border border-hairline-soft bg-canvas px-3.5 py-3 text-sm leading-relaxed text-body";

/** 지원 화면의 줄 안 검은 버튼(답하기 · 맞아요 · 내가 했어요 …) — 글자 길이와 상관없이 같은 높이 · 최소 폭(FE#268) */
export const inlineAction = "min-h-11 lg:min-h-10 min-w-20";

/** 답할 질문 — 상자 안 상자를 만들지 않는다. 질문끼리는 목록(clarifyList)의 가는 선으로만 나눈다(FE#320) */
export const openItem = "grid min-w-0 gap-2 py-3";

/** 되묻기 목록 — 항목 사이 가는 선 */
export const clarifyList = "m-0 grid list-none divide-y divide-hairline-soft p-0";

/** 되묻기 묶음 — 문항 · 초안 되묻기를 한 블록으로(FE#336). 기본은 접고, 답할 게 남았으면 머리줄에 점 · 개수로 강조한다.
 *  외부 AI 를 거친 답(attention)이 있으면 펼친 채 시작한다. openSignal 이 바뀌면(초안 부탁 · 질문 보기) 답할 게 남았을 때 연다 */
export function ClarifyBlock({ title, total, answered, attention = false, openSignal = 0, children }: { title: string; total: number; answered: number; attention?: boolean; openSignal?: number; children: ReactNode }) {
  const left = total - answered;
  // 좁은 폭은 패널이 시트라 질문 보기와 함께 새로 그려진다 — 요청이 이미 있으면 열린 채 시작한다(초안 구역의 초점 이동과 같은 기준)
  const [open, setOpen] = useState(attention || (openSignal > 0 && left > 0));
  const [signal, setSignal] = useState(openSignal);
  if (signal !== openSignal) { setSignal(openSignal); if (openSignal && left > 0) setOpen(true); }
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group/block min-w-0 rounded-sm border border-hairline bg-canvas">
    <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-center gap-2 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted transition-transform group-open/block:rotate-90" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</span>
      {left > 0 ? <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-review tabular-nums"><span aria-hidden="true" className="size-1.5 rounded-full bg-review" />답할 것 {left}개</span>
        : <span className="shrink-0 text-xs text-muted tabular-nums">모두 답했어요</span>}
    </summary>
    <div className="grid min-w-0 gap-2 border-t border-hairline-soft px-3.5 pb-1">{children}</div>
  </details>;
}

/** 답한 질문 — 접힌 한 줄(질문), 펼치면 질문 · 내 답 · 어디에 쌓였는지가 한 덩어리.
 *  외부 AI 가 전한 답(S-56)은 사용자가 정해야 하니 펼친 채 시작한다 */
export function AnsweredItem({ head, question, supplement, note }: { head?: ReactNode; question: string; supplement: Supplement | undefined; note: ReactNode }) {
  return <li className="min-w-0">
    <details className="group/item" open={!!supplement?.mcpChange || undefined}>
      <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-start gap-2 py-2 text-sm text-body [&::-webkit-details-marker]:hidden">
        <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-evidence" />
        <span className="line-clamp-1 min-w-0 flex-1 break-words group-open/item:line-clamp-none">{question}</span>
        <span className="sr-only">답함</span>
      </summary>
      <div className="grid min-w-0 gap-1.5 pb-2.5 pl-6 text-note leading-relaxed">
        {head}
        {supplement ? <p className="m-0 whitespace-pre-wrap break-words text-ink">
          <span className="mr-1.5 text-xs font-semibold text-muted">{supplement.mcpChange ? mcpAnswerName(supplement.mcpChange.client) : "내가 입력"}</span>{supplement.answer}
        </p> : <p className="m-0 text-muted">답한 보완을 지금 불러오지 못했어요.</p>}
        {note}
      </div>
    </details>
  </li>;
}

/** 쌓인 곳 안내. 외부 AI 가 전한 답은 맞아요 전까지 근거가 아니다(S-56) — 정하는 곳은 활동 세부 · 변경 기록 */
export function SupplementNote({ supplement, activityId, activityName }: { supplement: Supplement | undefined; activityId?: number; activityName?: string }) {
  if (supplement?.mcpChange) return <p role="status" className="m-0 text-muted">
    {mcpClientName(supplement.mcpChange.client)}가 전한 답이에요. {MCP_ANSWER_NOTE}{" "}
    {activityId !== undefined ? <Link href={`/experience?activity=${activityId}`} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-3 lg:min-h-0">활동 세부에서 맞아요 · 되돌리기</Link> : "맞아요 · 되돌리기는 활동 세부에서 할 수 있어요."}
  </p>;
  return <p className="m-0 text-muted">{activityName ? `「${shortName(activityName)}」 경험에 ` : "경험에 "}보완으로 쌓았어요. 다른 지원서에서도 이 답을 근거로 같이 써요.</p>;
}

/** 답할 질문 — 활동 칩 · 질문 · 입력칸. 문항 · 초안 되묻기가 같이 쓴다.
 *  답은 선택이라 건너뛰기 버튼이 없다 — 비워 두면 아무것도 보내지 않는다(S-22 · S-23).
 *  보내기는 글을 쓴 칸에만 입력칸 안 오른쪽에 나타난다 — 질문마다 같은 버튼이 줄지어 보이지 않게(FE#320).
 *  onSave 는 오류 문구를 돌려준다(성공이면 null) */
export function AnswerForm({ head, question, label, disabled, onSave, after }: { head: ReactNode; question: ReactNode; label: string; disabled: boolean; onSave: (text: string) => Promise<string | null>; after?: ReactNode }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const ready = text.trim().length > 0;
  const save = async () => {
    if (pending.current || disabled || !ready) return;
    pending.current = true; setSaving(true); setError(null);
    try { setError(await onSave(text.trim())); }
    finally { pending.current = false; setSaving(false); }
  };
  return <>
    <div className="flex min-w-0">{head}</div>
    {question}
    <form className="relative mt-1.5 min-w-0" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input type="text" maxLength={MAX_ANSWER_LENGTH} value={text} disabled={saving || disabled} onChange={e => { setText(e.target.value); setError(null); }}
        aria-label={`답: ${label}`} placeholder="짧게 답해 주세요"
        className={cn("h-11 w-full min-w-0 rounded-sm bg-surface-soft pl-3.5 text-base text-body outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm lg:h-10", ready ? "pr-12 lg:pr-11" : "pr-3.5")} />
      {/* 보내기는 모양 없이 진한 화살표만 — 둥근 입력칸 안에서 혼자 튀지 않게. 올리면 옅은 바탕 */}
      {ready && <Button type="submit" variant="ghost" size="icon" className="absolute top-1 right-1 size-9 rounded-[6px] text-ink after:absolute after:-inset-1 hover:bg-surface-strong lg:size-8" disabled={saving || disabled}
        aria-label={saving ? "쌓는 중" : error ? "다시 시도" : "답하기"} title="답하기">
        <ArrowUpIcon aria-hidden="true" weight="bold" />
      </Button>}
    </form>
    {error && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-note text-error">{error}</p>
      {after}
    </div>}
  </>;
}

export function ClarificationItem({ activityName, clarification: c, experience, onAnswer }: {
  activityName: string; clarification: Clarification; experience: QuestionExperience; onAnswer?: AnswerHandler;
}) {
  if (c.supplementId !== null) {
    const supplement = experience.supplements.find(s => s.id === c.supplementId);
    return <AnsweredItem question={c.question} supplement={supplement}
      head={<span className="grid justify-items-start"><ActivityChip name={activityName} /></span>}
      note={<SupplementNote supplement={supplement} activityId={experience.activityId} activityName={activityName} />} />;
  }
  return <li className={openItem}>
    <AnswerForm head={<ActivityChip name={activityName} />} question={<p className="m-0 text-sm leading-relaxed font-semibold text-ink">{c.question}</p>} label={c.question} disabled={!onAnswer} onSave={async text => {
      try { await onAnswer!(c.id, text); return null; }
      catch (e) { return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."; }
    }} />
  </li>;
}
