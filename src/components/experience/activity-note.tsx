"use client";

import { useRef, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { updateActivity } from "@/lib/api/experience";
import { activityNoteError } from "@/lib/api/editing";
import type { ActivityDetail, ActivitySummary } from "@/lib/api/types";
import { InlineTextarea } from "./inline-edit";
import { UserEnteredLabel } from "./supplement-list";

/** S-34: 경험·근거와 분리한 사용자 메모. 빈 상태를 재촉하거나 저장 성공을 낙관적으로 표시하지 않는다.
 * 그 자리 고치기(DESIGN.md) — 글을 누르면 입력칸, 밖을 누르면 저장 · Esc 취소. 비우고 저장하면 지운다. 지우기는 휴지통 */
export function ActivityNote({ activity, onSaved, readOnly = false }: {
  activity: ActivityDetail; onSaved: (activity: ActivitySummary) => void; readOnly?: boolean;
}) {
  const note = activity.note ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const save = async (value: string | null) => {
    if (pending.current) return;
    const validation = value === null ? null : activityNoteError(value);
    if (validation) { setError(validation); return; }
    const normalized = value?.trim() || null;
    if (normalized === note) { setDraft(null); setError(null); return; }
    pending.current = true; setSaving(true); setError(null);
    try {
      onSaved(await updateActivity(activity.id, { note: normalized }));
      setDraft(null);
    } catch (e) {
      // 고치던 글은 그대로 둔다 — 다시 밖을 누르면 다시 저장한다. 휴지통으로 지우다 실패하면 글자 아래에 알린다
      setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally { pending.current = false; setSaving(false); }
  };
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft !== null) void save(draft);
  };
  const start = () => { cancelled.current = false; setDraft(note ?? ""); setError(null); };
  const inputId = `activity-note-${activity.id}`;
  return <section aria-labelledby={`${inputId}-title`} className="border-b border-hairline bg-surface-soft px-4.5 py-4 lg:px-7">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h3 id={`${inputId}-title`} className="m-0 text-sm font-semibold">그때의 나</h3>
      <span className="text-note text-muted">계기 · 생각 — 남기고 싶을 때만</span>
    </div>
    {draft !== null ? <div className="mt-3 flex">
      <InlineTextarea label="계기 · 그때 든 생각" value={draft} singleLine saving={saving} error={error}
        onChange={(v) => { setDraft(v); setError(null); }} onCommit={commit}
        onCancel={() => { cancelled.current = true; setDraft(null); setError(null); }}
        className="mx-0 bg-canvas px-3 py-2 text-base leading-relaxed text-body sm:text-sm" />
    </div> : <>
      {note !== null ? <div className="mt-3 grid gap-2">
        <UserEnteredLabel />
        <div className="flex items-start gap-2">
          {readOnly ? <p className="m-0 min-w-0 flex-1 break-words text-sm leading-relaxed text-body">{note}</p>
            : <button type="button" title="눌러서 고치기" aria-label={`그때의 나 고치기: ${note}`} onClick={start} disabled={saving}
              className="-mx-1.5 -my-0.5 min-w-0 flex-1 cursor-text rounded-sm px-1.5 py-0.5 text-left text-sm leading-relaxed break-words text-body hover:bg-surface-strong">{note}</button>}
          {!readOnly && <Button variant="ghost" size="icon" className="-my-1.5 size-11 shrink-0 text-muted hover:text-error lg:size-8"
            title="지우기" aria-label="그때의 나 지우기" disabled={saving} onClick={() => void save(null)}>
            <TrashIcon aria-hidden="true" />
          </Button>}
        </div>
      </div> : !readOnly && <Button variant="link" className="mt-1 min-h-11 lg:min-h-10 h-auto whitespace-normal text-left text-sm text-muted" onClick={start}>+ 계기나 그때 든 생각 남기기</Button>}
      {error && <p role="alert" className="m-0 mt-1 text-xs font-medium text-error">{error}</p>}
    </>}
  </section>;
}
