"use client";

// 되묻기(S-22 · S-23) — 시안 6 apply.html 차곡이 패널의 묻기. 답은 선택이고, 건너뛰면 아무것도 보내지 않는다.
// 말풍선을 한 줄씩 쌓지 않고 블록 하나(문항 · 초안)로 묶는다 — 답한 것은 접힌 한 줄, 답할 것만 상자로 강조(FE#268)
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MCP_ANSWER_NOTE, mcpAnswerName } from "@/components/experience/supplement-list";
import { mcpClientName } from "@/lib/api/mcp";
import { MAX_ANSWER_LENGTH, type Clarification, type QuestionExperience, type Supplement } from "@/lib/api/question-types";
import { ActivityChip, shortName } from "./question-result";

export type AnswerHandler = (clarificationId: number, answer: string) => Promise<void>;

export const bubble = "m-0 grid max-w-[92%] gap-1.5 justify-self-start rounded-[4px_16px_16px_16px] border border-hairline-soft bg-canvas px-3.5 py-3 text-sm leading-relaxed text-body";

/** 지원 화면의 줄 안 검은 버튼(답하기 · 맞아요 · 내가 했어요 …) — 글자 길이와 상관없이 같은 높이 · 최소 폭(FE#268) */
export const inlineAction = "min-h-11 min-w-20";

/** 답할 질문 상자 — 블록 안에서 이것만 상자로 강조한다 */
export const openItem = "grid min-w-0 gap-2 rounded-sm bg-surface-soft p-3";

/** 되묻기 묶음 — 머리에 무엇에 대한 되묻기인지 · 몇 개 · 답한 수. 답할 게 남았거나 확인할 답(attention)이 있으면 펼친 채 시작한다 */
export function ClarifyBlock({ title, total, answered, attention = false, children }: { title: string; total: number; answered: number; attention?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(answered < total || attention);
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group/block min-w-0 rounded-sm border border-hairline bg-canvas">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted transition-transform group-open/block:rotate-90" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</span>
      <span className="shrink-0 text-xs text-muted tabular-nums">{total}개 · 답 {answered}</span>
    </summary>
    <div className="grid min-w-0 gap-2 border-t border-hairline-soft px-3.5 pt-2.5 pb-3">{children}</div>
  </details>;
}

/** 답한 질문 — 접힌 한 줄(질문), 펼치면 질문 · 내 답 · 어디에 쌓였는지가 한 덩어리.
 *  외부 AI 가 전한 답(S-56)은 사용자가 정해야 하니 펼친 채 시작한다 */
export function AnsweredItem({ head, question, supplement, note }: { head?: ReactNode; question: string; supplement: Supplement | undefined; note: ReactNode }) {
  return <li className="min-w-0">
    <details className="group/item" open={!!supplement?.mcpChange || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-2 text-sm text-body [&::-webkit-details-marker]:hidden">
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

/** 답할 질문의 입력 줄 — 문항 · 초안 되묻기가 같이 쓴다. onSave 는 오류 문구를 돌려준다(성공이면 null) */
export function AnswerForm({ label, disabled, onSave, after }: { label: string; disabled: boolean; onSave: (text: string) => Promise<string | null>; after?: ReactNode }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const pending = useRef(false);
  const save = async () => {
    if (pending.current || disabled) return;
    if (!text.trim()) { setError("답을 적어 주세요. 답하지 않으려면 「건너뛰기」를 눌러 주세요."); return; }
    pending.current = true; setSaving(true); setError(null);
    try { setError(await onSave(text.trim())); }
    finally { pending.current = false; setSaving(false); }
  };
  if (skipped) return <div className="flex flex-wrap items-center gap-2">
    <span className="text-note text-muted">건너뛰었어요</span>
    <Button variant="link" size="sm" className="min-h-11" onClick={() => setSkipped(false)}>다시 답하기</Button>
  </div>;
  return <>
    <form className="flex min-w-0 flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input type="text" maxLength={MAX_ANSWER_LENGTH} value={text} disabled={saving || disabled} onChange={e => { setText(e.target.value); setError(null); }}
        aria-label={`답: ${label}`} placeholder="짧게 답해 주세요"
        className="h-11 min-w-0 flex-[1_1_140px] rounded-full bg-canvas px-3.5 text-base text-body shadow-[inset_0_0_0_1px_var(--hairline)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
      <Button type="submit" size="sm" className={inlineAction} disabled={saving || disabled}>{saving ? "쌓는 중…" : error ? "다시 시도" : "답하기"}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={() => { setSkipped(true); setError(null); }}>건너뛰기</Button>
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
    <span className="grid justify-items-start"><ActivityChip name={activityName} /></span>
    <p className="m-0 text-sm leading-relaxed font-semibold text-ink">{c.question}</p>
    <AnswerForm label={c.question} disabled={!onAnswer} onSave={async text => {
      try { await onAnswer!(c.id, text); return null; }
      catch (e) { return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."; }
    }} />
  </li>;
}
