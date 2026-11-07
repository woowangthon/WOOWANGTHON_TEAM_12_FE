"use client";

// 지원처 이름을 그 자리에서 고친다(S-73). 밖을 누르거나 Enter 면 저장, Esc 면 취소
import { useRef, useState } from "react";
import { MAX_ORGANIZATION_LENGTH, type Application, type UpdateApplicationRequest } from "@/lib/api/question-types";

const TEXT = "m-0 min-w-0 text-heading leading-snug font-bold tracking-[-0.4px] sm:mr-1";

export function OrganizationName({ application, onSave }: { application: Application; onSave: (req: UpdateApplicationRequest) => Promise<unknown> }) {
  const saved = application.organization ?? "";
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelled = useRef(false);

  const commit = async () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (pending.current || text === null) return;
    const next = text.trim();
    if (next === saved) { setText(null); setError(null); return; }
    pending.current = true; setError(null);
    try { await onSave({ organization: next || null }); setText(null); }
    catch (e) { setError(e instanceof Error ? e.message : "이름을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; }
  };

  if (text === null) return <h2 className={TEXT}>
    <button type="button" title="눌러서 이름 고치기" aria-label={`지원처 이름 고치기: ${saved || "지원처 이름 없음"}`} onClick={() => { cancelled.current = false; setText(saved); }}
      className="-mx-1.5 max-w-full cursor-text rounded-sm px-1.5 text-left break-words hover:bg-surface-soft">
      {saved || "지원처 이름 없음"}
    </button>
  </h2>;

  return <div className={`grid gap-1 ${TEXT}`}>
    <input autoFocus aria-label="지원처 이름" value={text} maxLength={MAX_ORGANIZATION_LENGTH} placeholder="지원처 이름 없음"
      onChange={e => { setText(e.target.value); setError(null); }}
      onFocus={e => e.currentTarget.select()}
      onBlur={() => void commit()}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { cancelled.current = true; setText(null); setError(null); }
      }}
      className="-mx-1.5 w-full min-w-0 rounded-sm bg-surface-soft px-1.5 text-heading leading-snug font-bold tracking-[-0.4px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)]" />
    {error && <p role="alert" className="m-0 text-sm font-medium tracking-normal text-error">{error} 글자를 고치거나 Enter 로 다시 저장해 주세요.</p>}
  </div>;
}
