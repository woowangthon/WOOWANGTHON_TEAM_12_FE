"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateActivity } from "@/lib/api/experience";
import { activityError } from "@/lib/api/editing";
import type { ActivitySummary } from "@/lib/api/types";

export function ActivityEditor({ activity, onSaved, onCancel }: {
  activity: ActivitySummary;
  onSaved: (activity: ActivitySummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(activity.name);
  const [period, setPeriod] = useState(activity.period);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form className="grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      const invalid = activityError(name, period);
      setError(invalid);
      if (invalid) return;
      if (name === activity.name && JSON.stringify(period) === JSON.stringify(activity.period)) { onCancel(); return; }
      setSaving(true);
      try { onSaved(await updateActivity(activity.id, { name: name.trim(), period })); }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { setSaving(false); }
    }}>
      <fieldset disabled={saving} className="grid min-w-0 gap-3 border-0 p-0">
        <label className="grid gap-1">활동 이름<input autoFocus className="min-h-11 w-full rounded-sm border border-hairline p-2" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {(["start", "end"] as const).map((field) => (
          <label key={field} className="grid gap-1">{field === "start" ? "시작일" : "종료일"}
            <input className="min-h-11 w-full rounded-sm border border-hairline p-2" placeholder="YYYY / YYYY-MM / YYYY-MM-DD" disabled={field === "end" && period.ongoing} value={period[field] ?? ""} onChange={(e) => setPeriod({ ...period, [field]: e.target.value || null })} />
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={period.ongoing} onChange={(e) => setPeriod({ ...period, ongoing: e.target.checked, end: e.target.checked ? null : period.end })} />진행 중</label>
      </fieldset>
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button></div>
    </form>
  );
}
