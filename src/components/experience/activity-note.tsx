"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateActivity } from "@/lib/api/experience";
import { activityNoteError, MAX_ACTIVITY_NOTE_LENGTH } from "@/lib/api/editing";
import type { ActivityDetail, ActivitySummary } from "@/lib/api/types";
import { UserEnteredLabel } from "./supplement-list";

/** S-34: 경험·근거와 분리한 사용자 메모. 빈 상태를 재촉하거나 저장 성공을 낙관적으로 표시하지 않는다. */
export function ActivityNote({ activity, onSaved, readOnly = false }: {
  activity: ActivityDetail; onSaved: (activity: ActivitySummary) => void; readOnly?: boolean;
}) {
  const note = activity.note ?? null;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null | undefined>(undefined);
  const pending = useRef(false);
  const invalid = activityNoteError(text);
  const save = async (value: string | null) => {
    if (pending.current) return;
    const validation = value === null ? null : activityNoteError(value);
    if (validation) { setError(validation); return; }
    const normalized = value?.trim() || null;
    if (normalized === note) { setEditing(false); setError(null); return; }
    pending.current = true; setSaving(true); setError(null);
    try {
      const saved = await updateActivity(activity.id, { note: normalized });
      onSaved(saved); setEditing(false); setRetryNote(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
      setRetryNote(normalized);
    } finally { pending.current = false; setSaving(false); }
  };
  const start = () => { setText(note ?? ""); setError(null); setRetryNote(undefined); setEditing(true); };
  const inputId = `activity-note-${activity.id}`;
  return <section aria-labelledby={`${inputId}-title`} className="border-b border-hairline bg-surface-soft px-4.5 py-4 lg:px-7">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h3 id={`${inputId}-title`} className="m-0 text-sm font-semibold">그때의 나</h3>
      <span className="text-xs text-muted">계기 · 생각 — 남기고 싶을 때만</span>
    </div>
    {editing ? <form className="mt-3 grid gap-2" aria-label="그때의 나 편집" aria-busy={saving} onSubmit={e => { e.preventDefault(); void save(text); }}>
      <label htmlFor={inputId} className="sr-only">계기 · 그때 든 생각</label>
      <input id={inputId} autoFocus type="text" value={text} disabled={saving} aria-describedby={`${inputId}-hint`} aria-invalid={!!invalid}
        className="min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-canvas px-3 text-base text-body outline-none focus-visible:border-ink sm:text-sm"
        onChange={e => { setText(e.target.value); setError(null); setRetryNote(undefined); }}
        onPaste={e => {
          if (/[\r\n]/.test(e.clipboardData.getData("text/plain"))) {
            e.preventDefault(); setError("줄바꿈 없이 한 줄로 적어 주세요."); setRetryNote(undefined);
          }
        }} />
      <p id={`${inputId}-hint`} className="m-0 text-xs text-muted">앞뒤 공백을 뺀 {MAX_ACTIVITY_NOTE_LENGTH}자까지 · 줄바꿈 없이 한 줄</p>
      {invalid && <p role="alert" className="m-0 text-sm text-error">{invalid}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={saving || !!invalid}>{saving ? "저장 중…" : "저장"}</Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={() => { setEditing(false); setError(null); setRetryNote(undefined); }}>취소</Button>
      </div>
    </form> : <>
      {note !== null ? <div className="mt-3 grid gap-2">
        <UserEnteredLabel />
        <p className="m-0 break-words text-sm leading-relaxed text-body">{note}</p>
        {!readOnly && <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={start}>고치기</Button>
          <Button variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={() => void save(null)}>{saving ? "지우는 중…" : "지우기"}</Button>
        </div>}
      </div> : !readOnly && <Button variant="link" className="mt-1 min-h-11 h-auto whitespace-normal text-left text-sm text-muted" onClick={start}>+ 계기나 그때 든 생각 남기기</Button>}
    </>}
    {error && <div className="mt-2 grid justify-items-start gap-1">
      <p role="alert" className="m-0 text-sm text-error">{error}</p>
      {retryNote !== undefined && <Button variant="secondary" className="min-h-11" disabled={saving} onClick={() => void save(retryNote)}>다시 시도</Button>}
    </div>}
  </section>;
}
