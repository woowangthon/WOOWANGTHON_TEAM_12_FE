"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { MAX_ANSWER_LENGTH, type DraftOmission, type QuestionDetail } from "@/lib/api/question-types";
import type { AnswerHandler } from "./clarifications";

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

  return <li className="grid min-w-0 gap-2 border-t border-hairline pt-3 first:border-0 first:pt-0">
    <p className="m-0 break-words text-sm font-medium">{item.text}</p>
    {!canAnswer ? <p className="m-0 text-xs leading-relaxed text-muted">직접 쓸 거리예요. 경험에 연결된 질문이 아니라 보완으로 저장하지 않아요.</p> : <>
      {recommendation && <Link href={`/experience?activity=${recommendation.activity.id}&fromQuestion=${question.id}`}
        className="min-w-0 break-words text-xs leading-relaxed text-evidence underline underline-offset-4">
        {recommendation.activity.name} · {recommendation.experience.content}
      </Link>}
      <p className="m-0 break-words text-sm leading-relaxed">{item.question}</p>
      {item.supplementId !== null ? <div role="status" className="grid gap-1">
        <p className="m-0 text-sm font-medium">내가 입력 · 경험에 보완으로 쌓았어요</p>
        {supplement && <p className="m-0 whitespace-pre-wrap break-words text-sm text-body">{supplement.answer}</p>}
        <p className="m-0 text-xs leading-relaxed text-muted">「다시 만들기」를 누르면 최신 보완으로 초안을 써요. 답은 활동 세부에서 확인하고 고칠 수 있어요.</p>
      </div> : skipped ? <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 text-xs text-muted">건너뛴 질문 · 초안은 그대로 쓸 수 있어요.</p>
        <Button variant="link" size="sm" onClick={() => setSkipped(false)} disabled={disabled}>다시 보기</Button>
      </div> : <form className="grid min-w-0 gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="grid min-w-0 gap-1 text-xs text-muted">
          <span>답 · 선택</span>
          <textarea aria-label={`답: ${item.question}`} value={text} maxLength={MAX_ANSWER_LENGTH} rows={2} disabled={disabled}
            onChange={e => { setText(e.target.value); setError(null); }} placeholder="짧게 답해 주세요"
            className="min-w-0 resize-y rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed text-body outline-none focus-visible:border-ink sm:text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" className="min-h-11" disabled={disabled}>{error ? "다시 시도" : "보완으로 쌓기"}</Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={disabled} onClick={() => { setSkipped(true); setError(null); }}>건너뛰기</Button>
        </div>
      </form>}
      {error && <div className="grid justify-items-start gap-2">
        <p role="alert" className="m-0 text-sm text-error">{error}</p>
        <Button variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={() => void onRefresh()}>초안 상태 확인</Button>
      </div>}
    </>}
  </li>;
}

/** 추천의 되묻기와 별도 목록. 새 초안은 서버 clarificationId가 바뀌므로 입력·건너뛰기도 새로 시작한다. */
export function DraftOmissions({ question, ...actions }: {
  question: QuestionDetail; onAnswer: AnswerHandler; onRefresh: () => Promise<void>; disabled: boolean;
}) {
  return <ul aria-label="초안의 빠진 사실" className="m-0 grid list-none gap-4 p-0">
    {question.draft?.omitted.map((item, i) => <OmissionItem key={item.clarificationId ?? `unlinked-${i}`} item={item} question={question} {...actions} />)}
  </ul>;
}
