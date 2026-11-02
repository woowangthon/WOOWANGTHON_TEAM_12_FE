"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateExperience } from "@/lib/api/experience";
import type { Actor, Experience, UpdateExperienceRequest } from "@/lib/api/types";

export function ExperienceEditor({ experience, onSaved, onCancel }: {
  experience: Experience;
  onSaved: (experience: Experience) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(experience.content);
  const [perspective, setPerspective] = useState(experience.perspective ?? "");
  const [actor, setActor] = useState(experience.actor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  return (
    <form className="grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      if (pending.current) return;
      if (!content.trim()) { setError("경험 내용을 입력해 주세요."); return; }
      const data: UpdateExperienceRequest = {};
      if (content !== experience.content) data.content = content;
      if (perspective !== (experience.perspective ?? "")) data.perspective = perspective;
      if (actor !== experience.actor) data.actor = actor;
      if (!Object.keys(data).length) { onCancel(); return; }
      setError(null);
      pending.current = true;
      setSaving(true);
      try { onSaved(await updateExperience(experience.id, data)); }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { pending.current = false; setSaving(false); }
    }} aria-busy={saving}>
      <fieldset disabled={saving} className="grid min-w-0 gap-3 border-0 p-0">
        <label className="grid gap-1">경험 내용<textarea autoFocus rows={5} className="w-full rounded-sm border border-hairline p-2 text-base" value={content} onChange={(e) => setContent(e.target.value)} /></label>
        <label className="grid gap-1">관점<input className="min-h-11 w-full rounded-sm border border-hairline p-2" value={perspective} onChange={(e) => setPerspective(e.target.value)} /></label>
        <label className="grid gap-1">수행 주체<select className="min-h-11 w-full rounded-sm border border-hairline bg-canvas p-2" value={actor} onChange={(e) => setActor(e.target.value as Actor)}><option value="ME">나</option><option value="TEAM">팀</option><option value="UNKNOWN">알 수 없음</option></select></label>
      </fieldset>
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button></div>
    </form>
  );
}
