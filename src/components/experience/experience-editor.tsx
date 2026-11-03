"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createExperience, updateExperience } from "@/lib/api/experience";
import { COMPETENCIES, type Actor, type Competency, type Experience, type UpdateExperienceRequest } from "@/lib/api/types";

type Props = ({ experience: Experience; activityId?: never } | { experience?: never; activityId: number }) & {
  onSaved: (experience: Experience) => void;
  onCancel: () => void;
};

export function ExperienceEditor({ experience, activityId, onSaved, onCancel }: Props) {
  const [content, setContent] = useState(experience?.content ?? "");
  const [competencies, setCompetencies] = useState<Competency[]>(experience?.competencies ?? []);
  const [actor, setActor] = useState<Actor>(experience?.actor ?? "ME");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  return (
    <form className="grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      if (pending.current) return;
      if (!content.trim()) { setError("경험 내용을 입력해 주세요."); return; }
      const data: UpdateExperienceRequest = {};
      if (content !== experience?.content) data.content = content;
      if (JSON.stringify(competencies) !== JSON.stringify(experience?.competencies)) data.competencies = competencies;
      if (actor !== experience?.actor) data.actor = actor;
      if (experience && !Object.keys(data).length) { onCancel(); return; }
      setError(null);
      pending.current = true;
      setSaving(true);
      try {
        const result = experience
          ? await updateExperience(experience.id, data)
          : await createExperience(activityId, { content, competencies, actor });
        onSaved(result);
      }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { pending.current = false; setSaving(false); }
    }} aria-busy={saving}>
      <fieldset disabled={saving} className="grid min-w-0 gap-3 border-0 p-0">
        <label className="grid gap-1">경험 내용<textarea autoFocus rows={5} className="w-full rounded-sm border border-hairline p-2 text-base" value={content} onChange={(e) => setContent(e.target.value)} /></label>
        {!experience && <fieldset className="grid gap-1 border-0 p-0">
          <legend className="mb-1">역량 (선택 · 최대 3개)</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(Object.entries(COMPETENCIES) as [Competency, string][]).map(([value, label]) => (
              <label key={value} className="inline-flex min-h-11 items-center gap-1.5">
                <input type="checkbox" checked={competencies.includes(value)} disabled={!competencies.includes(value) && competencies.length === 3}
                  onChange={(event) => setCompetencies(event.target.checked ? [...competencies, value] : competencies.filter((c) => c !== value))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>}
        <label className="grid gap-1">수행 주체<select className="min-h-11 w-full rounded-sm border border-hairline bg-canvas p-2" value={actor} onChange={(e) => setActor(e.target.value as Actor)}><option value="ME">나</option><option value="TEAM">팀</option><option value="UNKNOWN">알 수 없음</option></select></label>
      </fieldset>
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button></div>
    </form>
  );
}
