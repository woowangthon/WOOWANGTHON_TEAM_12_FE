"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { MAX_ANSWER_LENGTH, type DraftOmission, type QuestionDetail } from "@/lib/api/question-types";
import { bubble, type AnswerHandler } from "./clarifications";
import { ActivityChip } from "./question-result";
import { requestError, failureReason } from "./draft-errors";

function answerError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "CLARIFICATION_NOT_FOUND") return "초안이 바뀌어 이 질문에 답할 수 없어요. 초안 상태를 확인해 주세요.";
    if (e.code === "EXPERIENCE_NOT_FOUND") return "이 경험이 지워졌어요. 초안 상태를 확인해 주세요.";
    if (e.code === "CLARIFICATION_ALREADY_ANSWERED") return "이미 답한 질문이에요. 초안 상태를 확인해 주세요.";
  }
  return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요.";
}

function OmissionItem({ item, question, onAnswer, onRefresh, disabled }: {
  item: DraftOmission; question: QuestionDetail; onAnswer: AnswerHandler;
  onRefresh: () => Promise<void>; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const recommendation = question.recommendations.find(r => r.experience.id === item.experienceId);
  const supplement = recommendation?.experience.supplements.find(s => s.id === item.supplementId);
  const canAnswer = item.question !== null && item.experienceId !== null && item.clarificationId !== null;
  const save = async () => {
    if (pending.current || disabled || !canAnswer || item.supplementId !== null) return;
    if (!text.trim()) { setError("답을 적어 주세요. 답하지 않으려면 「건너뛰기」를 눌러 주세요."); return; }
    pending.current = true; setError(null);
    try { await onAnswer(item.clarificationId!, text.trim()); }
    catch (e) { setError(answerError(e)); }
    finally { pending.current = false; }
  };
  const ask = <>
    <p className="m-0 text-xs leading-relaxed text-muted">{item.text}</p>
    {recommendation && <Link href={`/experience?activity=${recommendation.activity.id}&fromQuestion=${question.id}`}
      className="grid min-w-0 gap-1 text-xs leading-relaxed text-evidence underline-offset-4 hover:underline">
      <ActivityChip name={recommendation.activity.name} />
      <span className="break-words">{recommendation.experience.content}</span>
    </Link>}
    <p className="m-0 break-words font-semibold">{item.question}</p>
  </>;

  if (!canAnswer) return <li className={bubble}>
    <p className="m-0 font-medium">{item.text}</p>
    <p className="m-0 text-xs text-muted">직접 쓸 거리예요. 경험에 연결된 질문이 아니라 보완으로 저장하지 않아요.</p>
  </li>;
  if (item.supplementId !== null) return <li className="grid min-w-0 gap-2.5">
    <div className={bubble}>{ask}</div>
    {supplement && <p className="m-0 max-w-[92%] justify-self-end rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-on-primary">
      <span className="mb-1 block text-xs">내가 입력</span>{supplement.answer}
    </p>}
    <div role="status" className={bubble}>
      <p className="m-0">내가 입력 · 경험에 보완으로 쌓았어요.</p>
      <p className="m-0 text-xs text-muted">다른 문항에서도 이 답을 근거로 쓸 수 있어요. 답은 활동 세부에서 확인하고 고칠 수 있어요.</p>
    </div>
  </li>;
  if (skipped) return <li className="grid min-w-0 gap-1 px-1">
    <p className="m-0 break-words text-xs leading-relaxed text-muted">건너뛴 질문 · {item.question}</p>
    <Button variant="link" size="sm" className="min-h-11 justify-self-start" onClick={() => setSkipped(false)} disabled={disabled}>다시 보기</Button>
  </li>;

  return <li className={bubble}>
    {ask}
    <form className="mt-1 flex min-w-0 flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input type="text" aria-label={`답: ${item.question}`} value={text} maxLength={MAX_ANSWER_LENGTH} disabled={disabled}
        onChange={e => { setText(e.target.value); setError(null); }} placeholder="짧게 답해 주세요"
        className="h-11 min-w-0 flex-[1_1_140px] rounded-full bg-surface-soft px-3.5 text-base text-body outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
      <Button type="submit" size="sm" className="min-h-11" disabled={disabled}>{error ? "다시 시도" : "답하기"}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={disabled} onClick={() => { setSkipped(true); setError(null); }}>건너뛰기</Button>
    </form>
    {error && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-error">{error}</p>
      <Button variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={() => void onRefresh()}>초안 상태 확인</Button>
    </div>}
  </li>;
}

export type DraftPanelActions = {
  onGenerate: (ids: number[]) => Promise<void>; onRefresh: () => Promise<void>;
  savingAnswer: boolean; requestingDraft: boolean; focusRequest: number;
};

/** 시안 6 mateFeed: 빠진 사실 질문 → 내 답 → 보완 저장 안내 → 초안 다시 만들기. */
export function DraftFollowUp({ question, onAnswer, onGenerate, onRefresh, savingAnswer, requestingDraft, focusRequest }: {
  question: QuestionDetail; onAnswer: AnswerHandler;
} & DraftPanelActions) {
  const target = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    target.current?.scrollIntoView({ block: "start" });
    target.current?.focus({ preventScroll: true });
  }, [focusRequest]);
  const draft = question.draft;
  const analyzing = requestingDraft || draft?.status === "ANALYZING";
  const disabled = savingAnswer || analyzing || refreshing;
  const allowed = !!draft && draft.experienceIds.length >= 1 && draft.experienceIds.length <= 3
    && draft.experienceIds.every(id => question.recommendations.some(r => r.experience.id === id));
  const generate = async () => {
    if (pending.current || disabled || !allowed || !draft) return;
    pending.current = true; setError(null);
    try { await onGenerate(draft.experienceIds); }
    catch (e) { setError(requestError(e)); }
    finally { pending.current = false; }
  };
  const refresh = async () => {
    if (pending.current || disabled) return;
    pending.current = true; setRefreshing(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError(requestError(e)); }
    finally { pending.current = false; setRefreshing(false); }
  };
  if (!draft && !analyzing) return null;
  return <section ref={target} tabIndex={-1} aria-label="초안 보완" className="mt-3 grid min-w-0 scroll-mt-4 gap-2.5 border-t border-hairline pt-4 outline-none">
    <h3 className="m-0 text-xs font-semibold text-muted">초안 보완</h3>
    {analyzing ? <p role="status" className={bubble}>고른 경험과 보완을 읽고 초안을 만드는 중이에요…</p> : <>
      {draft?.status === "FAILED" ? <p role="alert" className={bubble}>{failureReason(draft.error)} 같은 경험으로 다시 만들 수 있어요.</p> : <>
        <div className={bubble}>
          <p className="m-0">{draft?.omitted.length ? "초안을 써 봤어요. 아래 내용은 자료에서 확인하지 못해 쓰지 않았어요." : "초안을 만들었어요. 가운데 답변 초안에서 문장과 근거를 확인해 주세요."}</p>
          {!!draft?.omitted.length && <>
            <p className="m-0 text-xs font-semibold">자료에 없어 쓰지 않았어요 · AI 해석</p>
            <p className="m-0 text-xs text-muted">기억나는 것만 알려 주세요. 답은 선택이에요. 건너뛰어도 초안을 복사할 수 있어요.</p>
          </>}
        </div>
        <ul aria-label="초안의 빠진 사실" className="m-0 grid list-none gap-2.5 p-0">
          {draft?.omitted.map((item, i) => <OmissionItem key={item.clarificationId ?? `unlinked-${i}`} item={item} question={question} onAnswer={onAnswer} onRefresh={refresh} disabled={disabled} />)}
        </ul>
      </>}
      {savingAnswer && <p role="status" className={bubble}>보완으로 쌓는 중이에요…</p>}
      <div className={bubble}>
        <p className="m-0">「다시 만들기」를 누르면 이 초안에 쓴 경험과 최신 보완으로 다시 써요.</p>
        <p className="m-0 text-xs text-muted">답을 저장할 때는 분석 횟수를 쓰지 않아요. 초안 다시 만들기는 분석 1회로 세어요.</p>
        <Button size="sm" className="mt-1 min-h-11 justify-self-start" disabled={disabled || !allowed} onClick={() => void generate()}>다시 만들기</Button>
      </div>
    </>}
    {error && <div className={bubble}>
      <p role="alert" className="m-0 text-error">{error}</p>
      <Button variant="secondary" size="sm" className="min-h-11 justify-self-start" disabled={disabled} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
  </section>;
}
