"use client";

// 되묻기(S-22 · S-23) — 시안 6 apply.html 차곡이 패널의 묻기 말풍선(msg--ask)을 추천 경험 아래로 옮겼다(패널은 ETC#78 논의 중).
// 답은 선택이고, 건너뛰면 아무것도 보내지 않는다
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_ANSWER_LENGTH, type Clarification, type QuestionExperience } from "@/lib/api/question-types";

export type AnswerHandler = (clarificationId: number, answer: string) => Promise<void>;

/** 「바꿔요 — 캠퍼스 중고거래 앱」 → 「바꿔요」 (시안의 활동 칩) */
const shortName = (name: string) => name.split(" — ")[0];

export function Clarifications({ activityName, experience, clarifications, onAnswer, label }: {
  activityName: string; experience: QuestionExperience; clarifications: Clarification[]; onAnswer?: AnswerHandler; label: string;
}) {
  if (!clarifications.length) return null;
  return <section aria-label={label} className="mt-5 grid gap-2.5">
    <p className="m-0 text-[13px] text-muted">자료에 없다고 경험이 없는 건 아니에요. 몇 가지만 물어볼게요.</p>
    <ul className="m-0 grid list-none gap-2.5 p-0">{clarifications.map(c => <ClarificationItem key={c.id} activity={shortName(activityName)} clarification={c} experience={experience} onAnswer={onAnswer} />)}</ul>
  </section>;
}

function ClarificationItem({ activity, clarification: c, experience, onAnswer }: { activity: string; clarification: Clarification; experience: QuestionExperience; onAnswer?: AnswerHandler }) {
  const [skipped, setSkipped] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const ask = <div className="grid gap-1.5">
    <span className="inline-flex justify-self-start rounded-full bg-mark-soft px-2.5 py-px text-xs font-semibold text-evidence">{activity}</span>
    <p className="m-0 text-sm leading-relaxed font-semibold text-ink">{c.question}</p>
  </div>;
  const card = "grid gap-3 rounded-[4px_16px_16px_16px] border border-hairline bg-canvas p-3.5";

  if (c.supplementId !== null) {
    const supplement = experience.supplements.find(s => s.id === c.supplementId);
    return <li className="grid gap-2.5">
      <div className={card}>{ask}</div>
      {supplement ? <p className="m-0 max-w-[92%] justify-self-end rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-on-primary">{supplement.answer}</p>
        : <p className="m-0 justify-self-end text-sm text-muted">답한 보완을 지금 불러오지 못했어요.</p>}
      <p className="m-0 max-w-[92%] rounded-[4px_16px_16px_16px] border border-hairline-soft bg-canvas px-3.5 py-3 text-sm leading-relaxed text-body">
        「{activity}」 경험에 보완으로 쌓았어요. 다른 지원서에서도 이 답을 근거로 같이 써요.
      </p>
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
