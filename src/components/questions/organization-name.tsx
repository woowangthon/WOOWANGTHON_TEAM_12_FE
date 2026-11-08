"use client";

// 지원처 이름을 그 자리에서 고친다(S-73). 밖을 누르거나 Enter 면 저장, Esc 면 취소
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { applicationSaveError } from "@/lib/api/questions";
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
    catch (e) { setError(applicationSaveError(e)); }
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
    {/* 서버 문구를 그대로 잇지 않는다 — 사용자 말로 된 이유 한 문장 + 다시 시도(FE#240). 고친 글자는 칸에 그대로 남는다 */}
    {error && <p role="alert" className="m-0 flex flex-wrap items-center gap-x-1 text-sm font-medium tracking-normal text-error">
      이름을 저장하지 못했어요. {error}
      {/* 칸이 먼저 blur 로 저장하지 않게 누르는 순간 초점을 옮기지 않는다 */}
      <Button type="button" variant="link" size="sm" onMouseDown={e => e.preventDefault()} onClick={() => void commit()}>다시 시도</Button>
    </p>}
  </div>;
}
