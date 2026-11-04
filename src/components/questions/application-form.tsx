"use client";

import { useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, MAX_QUESTIONS_PER_SUBMIT, type CreateApplicationRequest } from "@/lib/api/question-types";
import { QUESTION_EXAMPLES } from "@/lib/mock/question-examples";

const EXAMPLE_LABELS = ["기술 문제 해결 예시", "팀 역할·협업 예시"];
const field = "w-full rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed font-normal";

/** 계약 오류를 사용자 말로 — 429 는 문항 수가 남은 횟수보다 많을 때도 같다 */
export function submitErrorMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED") return "오늘 분석 횟수를 다 썼어요. 문항은 넣지 않았어요 — 내일 다시 넣어 주세요.";
  return e instanceof Error ? e.message : fallback;
}

/** 지원 넣기 — 지원처 이름(선택) + 문항 칸 여러 개. 넣기 전엔 자유롭게 더하고 빼고 순서를 바꾼다(S-18) */
export function ApplicationForm({ onSubmit, onCancel }: { onSubmit: (req: CreateApplicationRequest) => Promise<unknown>; onCancel?: () => void }) {
  const [organization, setOrganization] = useState("");
  const [texts, setTexts] = useState([""]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const set = (i: number, value: string) => setTexts(prev => prev.map((t, j) => (j === i ? value : t)));
  const move = (i: number, to: number) => setTexts(prev => { const next = [...prev]; [next[i], next[to]] = [next[to], next[i]]; return next; });

  return (
    <form className="grid gap-5" aria-busy={saving} onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      const blank = texts.findIndex(t => !t.trim());
      if (blank >= 0) { setError(texts.length === 1 ? "지원 문항을 입력해 주세요." : `비어 있는 문항이 있어요(문항 ${blank + 1}). 채우거나 빼 주세요.`); return; }
      if (texts.some(t => t.length > MAX_QUESTION_LENGTH) || organization.length > MAX_ORGANIZATION_LENGTH) {
        setError("지원처는 100자, 문항은 5,000자까지 입력할 수 있어요."); return;
      }
      pending.current = true; setSaving(true); setError(null);
      try { await onSubmit({ organization: organization.trim() || null, questions: texts.map(text => ({ text })) }); }
      catch (e) { setError(submitErrorMessage(e, "지원을 보관하지 못했어요.")); }
      finally { pending.current = false; setSaving(false); }
    }}>
      <div className="grid gap-1.5">
        <h2 className="m-0 text-[21px] font-[650] tracking-[-0.3px]">어디에 지원하나요?</h2>
        <p className="m-0 text-sm text-muted">지원서의 문항을 순서대로 넣으면 문항마다 꺼내 볼 경험을 찾아요.</p>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium text-muted">예시 문항으로 시작하기</span>
        <div className="flex flex-wrap gap-2">
          {QUESTION_EXAMPLES.map((sample, i) => (
            <Button key={sample.id} type="button" variant="secondary" size="sm" className="min-h-11" disabled={saving} onClick={() => {
              setOrganization(prev => prev || (sample.organization ?? ""));
              // 비어 있는 첫 칸에, 없으면 새 칸에
              setTexts(prev => { const at = prev.findIndex(t => !t.trim()); if (at >= 0) return prev.map((t, j) => (j === at ? sample.text : t)); return prev.length < MAX_QUESTIONS_PER_SUBMIT ? [...prev, sample.text] : prev; });
              setError(null);
            }}>{EXAMPLE_LABELS[i]}</Button>
          ))}
        </div>
      </div>
      <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <label className="grid gap-1.5 text-sm font-medium">
          지원처 이름 (선택)
          <input aria-label="지원처 이름 (선택)" autoComplete="organization" maxLength={MAX_ORGANIZATION_LENGTH} value={organization} onChange={e => setOrganization(e.target.value)} className={`${field} min-h-11 py-0`} placeholder="동아리 · 부트캠프 · 대외활동 · 회사 이름" />
          <span className="text-right text-xs font-normal text-muted tabular-nums">{organization.length} / 100</span>
        </label>
        <ol className="m-0 grid list-none gap-4 p-0" aria-label="문항">
          {texts.map((text, i) => (
            <li key={i} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`question-${i}`} className="text-sm font-medium">문항 {i + 1}</label>
                {texts.length > 1 && <span className="flex gap-0.5">
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 위로`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUpIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 아래로`} disabled={i === texts.length - 1} onClick={() => move(i, i + 1)}><ArrowDownIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 빼기`} onClick={() => setTexts(prev => prev.filter((_, j) => j !== i))}><XIcon /></Button>
                </span>}
              </div>
              <textarea id={`question-${i}`} autoFocus={i === 0} rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} onChange={e => set(i, e.target.value)} className={`${field} resize-y`} placeholder="문항을 붙여 넣어 주세요. 글자 수 · 공고 일부를 함께 넣어도 괜찮아요." />
              <span className="text-right text-xs font-normal text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
            </li>
          ))}
        </ol>
        {texts.length < MAX_QUESTIONS_PER_SUBMIT && <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setTexts(prev => [...prev, ""])}><PlusIcon />문항 칸 더하기</Button>}
      </fieldset>
      <p className="m-0 text-[13px] text-muted">넣은 뒤엔 문항을 고치지 않아요 — 잘못 넣었으면 그 지원에 새로 더해 주세요. 지금은 실제 분석 없이 정해진 기술·협업 예시 결과를 보여줘요.</p>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "지원을 보관하고 있어요…" : texts.length > 1 ? `문항 ${texts.length}개 넣고 경험 찾기` : "지원 넣고 경험 찾기"}</Button>
        {onCancel && <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>}
      </div>
    </form>
  );
}

/** 이미 넣은 지원에 문항 하나 더하기 */
export function AddQuestionForm({ onSubmit, onCancel }: { onSubmit: (text: string) => Promise<unknown>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  return (
    <form className="grid gap-3" aria-busy={saving} aria-label="문항 더하기" onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      if (!text.trim()) { setError("더할 문항을 입력해 주세요."); return; }
      pending.current = true; setSaving(true); setError(null);
      try { await onSubmit(text); }
      catch (e) { setError(submitErrorMessage(e, "문항을 보관하지 못했어요.")); }
      finally { pending.current = false; setSaving(false); }
    }}>
      <label htmlFor="add-question" className="text-[17px] font-semibold">이 지원에 문항 더하기</label>
      <textarea id="add-question" autoFocus rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} disabled={saving} onChange={e => setText(e.target.value)} className={`${field} resize-y`} placeholder="더할 문항을 붙여 넣어 주세요." />
      <span className="text-right text-xs text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "문항을 보관하고 있어요…" : "문항 더하고 경험 찾기"}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
      </div>
    </form>
  );
}
