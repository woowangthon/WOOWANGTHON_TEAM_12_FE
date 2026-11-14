"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createExperience, updateExperience } from "@/lib/api/experience";
import type { Actor, Competency, Experience, UpdateExperienceRequest } from "@/lib/api/types";
import { CompetencyPicker } from "./competency-picker";

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
      // 역량은 배열 통째로 보낸다 — 순서만 달라도 바뀐 것, 다 지우면 [], 그대로면 필드를 뺀다(계약 「경험 수정」)
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
        <CompetencyPicker value={competencies} onChange={setCompetencies} />
        {/* label 로 감싸지 않는다 — 감싸면 글자 줄 옆 빈 곳을 눌러도 선택창이 열린다(FE#641). 이름은 aria-label 로 */}
        <div className="grid gap-1"><span>수행 주체</span><Select<Actor> aria-label="수행 주체" value={actor} onChange={(next) => { if (next) setActor(next); }} options={[{ value: "ME", label: "나" }, { value: "TEAM", label: "팀" }, { value: "UNKNOWN", label: "알 수 없음" }]} /></div>
      </fieldset>
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button></div>
    </form>
  );
}
