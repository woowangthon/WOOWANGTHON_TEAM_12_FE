"use client";

// 되묻기(S-22 · S-23) — 시안 6 apply.html 차곡이 패널의 묻기 말풍선(msg--ask). 답은 선택이고, 건너뛰면 아무것도 보내지 않는다
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_ANSWER_LENGTH, type Clarification, type QuestionExperience } from "@/lib/api/question-types";
import { ActivityChip, shortName } from "./question-result";

export type AnswerHandler = (clarificationId: number, answer: string) => Promise<void>;

export const bubble = "m-0 grid max-w-[92%] gap-1.5 justify-self-start rounded-[4px_16px_16px_16px] border border-hairline-soft bg-canvas px-3.5 py-3 text-sm leading-relaxed text-body";

export function ClarificationItem({ activityName, clarification: c, experience, onAnswer }: {
  activityName: string; clarification: Clarification; experience: QuestionExperience; onAnswer?: AnswerHandler;
}) {
  const [skipped, setSkipped] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const ask = <div className="grid gap-1.5">
    <span className="grid justify-items-start"><ActivityChip name={activityName} /></span>
    <p className="m-0 text-sm leading-relaxed font-semibold text-ink">{c.question}</p>
  </div>;
  const card = "grid gap-3 rounded-[4px_16px_16px_16px] border border-hairline bg-canvas p-3.5";

  if (c.supplementId !== null) {
    const supplement = experience.supplements.find(s => s.id === c.supplementId);
    return <li className="grid gap-2.5">
      <div className={card}>{ask}</div>
      {supplement ? <p className="m-0 max-w-[92%] justify-self-end rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-on-primary">{supplement.answer}</p>
        : <p className="m-0 justify-self-end text-sm text-muted">답한 보완을 지금 불러오지 못했어요.</p>}
      <p className={bubble}>「{shortName(activityName)}」 경험에 보완으로 쌓았어요. 다른 지원서에서도 이 답을 근거로 같이 써요.</p>
    </li>;
  }

  if (skipped) return <li className="flex flex-wrap items-center justify-between gap-2 px-1">
    <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-muted">건너뛴 질문 · {c.question}</span>
    <Button variant="link" size="sm" className="min-h-11" onClick={() => setSkipped(false)}>다시 보기</Button>
  </li>;

  const save = async () => {
    if (pending.current || !onAnswer) return;
    if (!text.trim()) { setError("답을 적어 주세요. 답하지 않으려면 「건너뛰기」를 눌러 주세요."); return; }
    pending.current = true; setSaving(true); setError(null);
    try { await onAnswer(c.id, text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setSaving(false); }
  };

  return <li className={card}>
    {ask}
    <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input type="text" maxLength={MAX_ANSWER_LENGTH} value={text} disabled={saving || !onAnswer} onChange={e => { setText(e.target.value); setError(null); }}
        aria-label={`답: ${c.question}`} placeholder="짧게 답해 주세요"
        className="h-9 min-w-0 flex-[1_1_140px] rounded-full bg-surface-soft px-3.5 text-base outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
      <Button type="submit" size="sm" disabled={saving || !onAnswer}>{saving ? "쌓는 중…" : "답하기"}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setSkipped(true); setError(null); }}>건너뛰기</Button>
    </form>
    {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
  </li>;
}
