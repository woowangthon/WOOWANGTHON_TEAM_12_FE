"use client";

// 문항 글을 그 자리에서 고친다(S-89 · FE#511 — DESIGN.md 「그 자리 고치기」). 지원처 이름(organization-name.tsx)과 같은 규칙:
// 누르면 같은 글꼴의 입력칸, 밖을 누르거나 Enter 면 저장(Shift+Enter 줄 바꿈), Esc 면 취소. 글이 같거나 비면 요청하지 않고 원래 글로.
// 저장하면 추천이 다시 돌고 초안 · 근거 점검이 지워진다 — 그것들이나 다 쓴 답이 있을 때만 저장 직전에 확인 창
import { useRef, useState } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_LENGTH } from "@/lib/api/question-types";
import { ConfirmQuestionTextDialog, questionTextError } from "./question-menus";

const TEXT = "text-xl leading-relaxed font-[650] tracking-[-0.3px]";

export function QuestionText({ id, index, text: saved, needsConfirm, onSave }: {
  id: number; index: number; text: string;
  /** 저장하면 지워질 것(초안 · 근거 점검 · 다 쓴 답)이 있나 — 저장하는 순간에 묻는다 */
  needsConfirm: () => boolean;
  /** 성공하면 끝, 실패하면 던진다 — 쓴 글은 칸에 남는다 */
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const close = () => { setText(null); setError(null); setConfirming(null); };
  const save = async (next: string) => {
    pending.current = true; setSaving(true); setError(null);
    try { await onSave(next); close(); }
    finally { pending.current = false; setSaving(false); }
  };
  const commit = async () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (pending.current || confirming !== null || text === null) return;
    const next = text.trim();
    if (!next || next === saved.trim() || next.length > MAX_QUESTION_LENGTH) {
      // 너무 긴 글은 칸에 두고 이유만 — 빈 글 · 같은 글은 조용히 원래 글로
      if (next.length > MAX_QUESTION_LENGTH) { setError(`문항 글은 ${MAX_QUESTION_LENGTH.toLocaleString()}자까지예요.`); return; }
      close(); return;
    }
    if (needsConfirm()) { setConfirming(next); return; }
    try { await save(next); }
    catch (e) { setError(questionTextError(e)); }
  };
  const start = () => { cancelled.current = false; setText(saved); };

  if (text === null) return <div className="flex items-start gap-1">
    {/* PC 는 글을 눌러 고친다. 좁은 화면은 누르기가 스크롤과 겹쳐 옆 연필로만 들어간다 */}
    <h3 className={`m-0 min-w-0 flex-1 ${TEXT}`}>
      {/* 이름은 글 그대로(제목으로 읽힌다) — 고칠 수 있다는 건 말풍선 · 설명으로 */}
      <button type="button" title="눌러서 문항 글 고치기" onClick={start}
        className="-mx-1.5 block max-h-36 w-[calc(100%+0.75rem)] cursor-text overflow-y-auto rounded-sm px-1.5 text-left whitespace-pre-wrap hover:bg-surface-soft max-lg:pointer-events-none">
        {saved}
      </button>
    </h3>
    <Button variant="ghost" size="icon" className="-my-1.5 size-11 shrink-0 text-muted hover:text-ink lg:hidden" aria-label={`문항 ${index + 1} 글 고치기`} title="문항 글 고치기" onClick={start}>
      <PencilSimpleIcon aria-hidden="true" />
    </Button>
  </div>;

  return <div className="grid gap-1">
    <textarea ref={field} autoFocus aria-label={`문항 ${index + 1} 글`} value={text} readOnly={saving}
      onChange={e => { setText(e.target.value); setError(null); }}
      onFocus={e => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }}
      onBlur={() => void commit()}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { cancelled.current = true; close(); }
      }}
      className={`-mx-1.5 max-h-60 w-[calc(100%+0.75rem)] resize-none rounded-sm bg-surface-soft px-1.5 outline-none [field-sizing:content] focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] ${TEXT}`} />
    {saving && <p role="status" className="m-0 text-xs text-muted">저장하는 중…</p>}
    {/* 실패해도 쓴 글은 칸에 남는다 — 이유 한 문장 + 다시 시도(FE#240) */}
    {error && <p role="alert" className="m-0 flex flex-wrap items-center gap-x-1 text-xs text-error">
      {error}
      <Button type="button" variant="link" size="sm" className="h-auto text-xs" onMouseDown={e => e.preventDefault()} onClick={() => void commit()}>다시 시도</Button>
    </p>}
    <ConfirmQuestionTextDialog target={confirming === null ? null : { id, index, text: confirming }}
      onCancel={() => { setConfirming(null); requestAnimationFrame(() => field.current?.focus()); }}
      onSave={(_, next) => save(next)} />
  </div>;
}
