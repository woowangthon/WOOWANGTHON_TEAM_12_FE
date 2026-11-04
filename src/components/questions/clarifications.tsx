"use client";

// 되묻기(S-22 · S-23) — 추천된 경험 아래에 그 경험에 대한 질문만. 답은 선택이고, 건너뛰면 아무것도 보내지 않는다
import { useRef, useState } from "react";
import { UserEnteredLabel } from "@/components/experience/supplement-list";
import { Button } from "@/components/ui/button";
import { MAX_ANSWER_LENGTH, type Clarification, type QuestionExperience } from "@/lib/api/question-types";

export type AnswerHandler = (clarificationId: number, answer: string) => Promise<void>;

export function Clarifications({ experience, clarifications, onAnswer, label }: {
  experience: QuestionExperience; clarifications: Clarification[]; onAnswer?: AnswerHandler; label: string;
}) {
  if (!clarifications.length) return null;
  return <section aria-label={label} className="mt-5 grid gap-3 rounded-md bg-surface-soft p-4">
    <div>
      <h5 className="m-0 text-sm font-semibold">이 경험에 대해 짧게 물어볼게요</h5>
      <p className="mt-1 mb-0 text-[13px] text-muted">AI 가 자료에서 찾지 못한 부분이에요. 답하면 이 경험에 「내가 입력」 보완으로 쌓여 다음 문항에서도 쓰여요. 답하지 않고 넘어가도 괜찮아요.</p>
    </div>
    <ul className="m-0 grid list-none gap-2 p-0">{clarifications.map(c => <ClarificationItem key={c.id} clarification={c} experience={experience} onAnswer={onAnswer} />)}</ul>
  </section>;
}

function ClarificationItem({ clarification: c, experience, onAnswer }: { clarification: Clarification; experience: QuestionExperience; onAnswer?: AnswerHandler }) {
  const [mode, setMode] = useState<"idle" | "open" | "skipped">("idle");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const question = <p className="m-0 text-[15px] leading-relaxed font-medium text-ink">{c.question}</p>;
  const box = "grid gap-2.5 rounded-sm bg-canvas p-3.5";

  if (c.supplementId !== null) {
    const supplement = experience.supplements.find(s => s.id === c.supplementId);
    return <li className={box}>
      {question}
      <div className="grid gap-1 border-l-2 border-hairline pl-3">
        <UserEnteredLabel>내가 입력 · 이 경험에 쌓였어요</UserEnteredLabel>
        {supplement ? <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-body">{supplement.answer}</p>
          : <p className="m-0 text-sm text-muted">답한 보완을 지금 불러오지 못했어요.</p>}
      </div>
    </li>;
  }

  if (mode === "skipped") return <li className="flex flex-wrap items-center justify-between gap-2 px-1">
    <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-muted">넘어간 질문 · {c.question}</span>
    <Button variant="link" size="sm" className="min-h-11" onClick={() => setMode("idle")}>다시 보기</Button>
  </li>;

  const save = async () => {
    if (pending.current || !onAnswer) return;
    if (!text.trim()) { setError("답을 적어 주세요. 답하지 않으려면 「넘어가기」를 눌러 주세요."); return; }
    pending.current = true; setSaving(true); setError(null);
    try { await onAnswer(c.id, text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setSaving(false); }
  };

  return <li className={box}>
    {question}
    {mode === "open" ? <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
      <textarea autoFocus rows={3} maxLength={MAX_ANSWER_LENGTH} value={text} disabled={saving} onChange={e => { setText(e.target.value); setError(null); }}
        aria-label={`답: ${c.question}`} placeholder="기억나는 만큼 짧게 적어 주세요."
        className="w-full resize-y rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed" />
      <span className="text-right text-xs text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 2,000</span>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "저장하고 있어요…" : "보완으로 저장"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setMode("idle"); setError(null); }}>닫기</Button>
      </div>
    </form> : <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={!onAnswer} onClick={() => setMode("open")}>답하기</Button>
      <Button variant="ghost" size="sm" onClick={() => setMode("skipped")}>넘어가기</Button>
    </div>}
  </li>;
}
