"use client";

// 되묻기(S-22 · S-23) — 시안 6 apply.html 차곡이 패널의 묻기. 답은 선택이고, 건너뛰면 아무것도 보내지 않는다.
// 말풍선을 한 줄씩 쌓지 않고 블록 하나(문항 · 초안)로 묶는다 — 답한 것은 접힌 한 줄, 답할 것만 상자로 강조(FE#268)
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpIcon, CaretDownIcon, CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import { asksSeen, markAsksSeen } from "./ask-memory";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
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

/** 되묻기 묶음 — 문항 · 초안 되묻기를 한 블록으로(FE#336). 그 문항에서 **처음 볼 때만** 펼치고, 그다음은 접힌 한 줄 「물어볼 것 N」(FE#547).
 *  새 질문이 생겨도 저절로 펼치지 않고 숫자만 바뀐다. 펼쳐 본 적은 이 브라우저에 기억한다.
 *  외부 AI 를 거친 답(attention)이 있으면 펼친 채 시작한다. openSignal 이 바뀌면(초안 부탁 · 질문 보기) 답할 게 남았을 때 연다 */
export function ClarifyBlock({ questionId, title, info, left, attention = false, openSignal = 0, children }: { questionId: number; title: string; /** 제목 옆 ⓘ — 처음 한 번 읽으면 되는 설명 */ info?: ReactNode; /** 답할 것(건너뛴 것 · 답한 것 빼고) */ left: number; attention?: boolean; openSignal?: number; children: ReactNode }) {
  // 좁은 폭은 패널이 시트라 질문 보기와 함께 새로 그려진다 — 요청이 이미 있으면 열린 채 시작한다(초안 구역의 초점 이동과 같은 기준)
  const [open, setOpen] = useState(() => attention || (left > 0 && (openSignal > 0 || !asksSeen(questionId))));
  const [signal, setSignal] = useState(openSignal);
  if (signal !== openSignal) { setSignal(openSignal); if (openSignal && left > 0) setOpen(true); }
  const asking = left > 0;
  useEffect(() => { if (asking) markAsksSeen(questionId); }, [asking, questionId]);
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group/block min-w-0 rounded-sm border border-hairline bg-canvas">
    <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-center gap-2 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted transition-transform group-open/block:rotate-90" />
      <span className="min-w-0 text-sm font-semibold text-ink">{title}</span>
      {/* ⓘ 를 눌러도 블록이 접히거나 펴지지 않게 — 말풍선이 열린 뒤 summary 의 기본 동작만 막는다 */}
      {info && <span className="-ml-1.5 inline-flex" onClick={e => e.preventDefault()}><InfoTip label={title}>{info}</InfoTip></span>}
      <span className="flex-1" />
      {left > 0 && <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-review tabular-nums"><span aria-hidden="true" className="size-1.5 rounded-full bg-review" />{left}개</span>}
    </summary>
    <div className="grid min-w-0 border-t border-hairline-soft px-3.5 pb-1">{children}</div>
  </details>;
}

/** 블록 아래 접힌 한 줄 — 「답한 질문 N개 보기」 · 「건너뛴 질문 N」이 같은 모양(FE#547) */
export function AskFold({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: ReactNode }) {
  return <details open={defaultOpen || undefined} className="group/fold min-w-0 border-t border-hairline-soft">
    <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-center gap-1 text-note text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
      {label}<CaretDownIcon aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-open/fold:rotate-180" />
    </summary>
    {children}
  </details>;
}

/** 답할 질문의 글 줄 — 줄 끝에 작은 회색 「건너뛰기」(S-23 · FE#547). 버튼 줄을 다시 만들지 않는다(FE#320).
 *  PC 는 그 질문에 올리거나 입력칸에 초점이 있을 때 진하게, 평소엔 흐리게(숨기지 않는다). 모바일은 늘 같은 흐린 글자.
 *  li 에 group/ask 가 있어야 한다 */
export function AskQuestion({ text, note, onSkip }: { text: string; /** 질문 아래 작은 글(「비슷한 질문 2개를 하나로 모았어요」) */ note?: ReactNode; onSkip: () => void }) {
  return <div className="grid min-w-0 gap-0.5">
    <div className="flex min-w-0 items-start gap-2">
      <p className="m-0 min-w-0 flex-1 text-sm leading-relaxed font-semibold break-words text-ink">{text}</p>
      <button type="button" onClick={onSkip} aria-label={`건너뛰기: ${text}`}
        className="-my-2.5 -mr-1.5 inline-flex min-h-11 shrink-0 items-center px-1.5 text-xs text-muted transition-colors hover:text-ink focus-visible:text-ink lg:-my-2 lg:min-h-10 lg:text-muted/60 lg:group-focus-within/ask:text-muted lg:group-hover/ask:text-muted lg:hover:text-ink">건너뛰기</button>
    </div>
    {note && <p className="m-0 text-xs text-muted">{note}</p>}
  </div>;
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

/** 답할 질문 — (활동 칩) · 질문 · 입력칸. 문항 · 초안 · 공고 되묻기가 같이 쓴다.
 *  답은 선택이다 — 비워 두면 아무것도 보내지 않는다(S-22 · S-23). 차곡이 패널은 질문 줄 끝 「건너뛰기」로 치운다(AskQuestion).
 *  보내기는 글을 쓴 칸에만 입력칸 안 오른쪽에 나타난다 — 질문마다 같은 버튼이 줄지어 보이지 않게(FE#320).
 *  onSave 는 오류 문구를 돌려준다(성공이면 null) */
export function AnswerForm({ head, question, label, disabled, onSave, after, maxLength = MAX_ANSWER_LENGTH, inputClassName }: { /** 없으면(경험별로 묶은 차곡이 패널) 머리를 그리지 않는다 */ head?: ReactNode; question: ReactNode; label: string; disabled: boolean; onSave: (text: string) => Promise<string | null>; after?: ReactNode; maxLength?: number; /** 옅은 면 위에 놓일 때 입력칸 바탕을 바꾼다 */ inputClassName?: string }) {
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
    {head && <div className="flex min-w-0">{head}</div>}
    {question}
    <form className="relative mt-1.5 min-w-0" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input type="text" maxLength={maxLength} value={text} disabled={saving || disabled} onChange={e => { setText(e.target.value); setError(null); }}
        aria-label={`답: ${label}`} placeholder="짧게 답해 주세요"
        className={cn("h-11 w-full min-w-0 rounded-sm bg-surface-soft pl-3.5 text-base text-body outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm lg:h-10", ready ? "pr-12 lg:pr-11" : "pr-3.5", inputClassName)} />
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

/** 되묻기 항목의 머리 — 활동 칩(누르면 그 활동) → 그 경험 한 줄(회색 인용). 문항 되묻기 · 초안 빈칸 질문이 같은 모양(FE#464).
 *  이동 링크라 근거 색을 쓰지 않는다. 글 길이가 달라도 칩 · 인용 · 질문 순서가 같다 */
export function AskHead({ activityId, activityName, content, questionId }: { activityId?: number | null; activityName?: string | null; content?: string | null; /** 없으면(공고 되묻기) 「지원서 화면으로 돌아가기」 없이 활동만 */ questionId?: number }) {
  if (!activityName && !content) return null;
  return <div className="grid min-w-0 justify-items-start gap-1.5">
    {activityName && (activityId != null
      ? <Link href={questionId !== undefined ? `/experience?activity=${activityId}&fromQuestion=${questionId}` : `/experience?activity=${activityId}`} title="활동 보기" className="inline-flex max-w-full rounded-full transition-opacity hover:opacity-70"><ActivityChip name={activityName} /></Link>
      : <ActivityChip name={activityName} />)}
    {content && <p className="m-0 line-clamp-2 border-l-2 border-hairline pl-2.5 text-note leading-relaxed break-words text-muted">{content}</p>}
  </div>;
}

/** 답한 문항 되묻기 — 「답한 질문 N개 보기」 안의 한 줄. 답할 질문은 차곡이 패널이 경험별로 묶어 그린다(FE#547) */
export function AnsweredClarification({ activityName, clarification: c, experience, questionId }: {
  activityName: string; clarification: Clarification; experience: QuestionExperience; questionId: number;
}) {
  const supplement = experience.supplements.find(s => s.id === c.supplementId);
  return <AnsweredItem question={c.question} supplement={supplement}
    head={<AskHead activityId={experience.activityId} activityName={activityName} content={experience.content} questionId={questionId} />}
    note={<SupplementNote supplement={supplement} activityId={experience.activityId} activityName={activityName} />} />;
}
