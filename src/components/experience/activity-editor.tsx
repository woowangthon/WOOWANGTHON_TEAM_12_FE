"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const pending = useRef(false);
  return (
    <form className="grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      if (pending.current) return;
      const invalid = activityError(name, period);
      setError(invalid);
      if (invalid) return;
      if (name === activity.name && JSON.stringify(period) === JSON.stringify(activity.period)) { onCancel(); return; }
      pending.current = true;
      setSaving(true);
      try { onSaved(await updateActivity(activity.id, { name: name.trim(), period })); }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { pending.current = false; setSaving(false); }
    }} aria-busy={saving}>
      <fieldset disabled={saving} className="grid min-w-0 gap-3 border-0 p-0">
        <label className="grid gap-1">활동 이름<input autoFocus className="min-h-11 w-full rounded-sm border border-hairline p-2" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {(["start", "end"] as const).map((field) => (
          <MonthField key={field} label={field === "start" ? "시작" : "종료"} value={period[field]} original={activity.period[field]}
            disabled={field === "end" && period.ongoing} onChange={(value) => setPeriod({ ...period, [field]: value })} />
        ))}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={period.ongoing} onChange={(e) => setPeriod({ ...period, ongoing: e.target.checked, end: e.target.checked ? null : period.end })} />진행 중</label>
      </fieldset>
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button></div>
    </form>
  );
}

const FIRST_YEAR = 1990;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: `${i + 1}월` }));

/** 「YYYY」 · 「YYYY-MM」 · 「YYYY-MM-DD」 → 연 · 월 칸. 월이 없으면 "" */
function parts(value: string | null) {
  return { year: value?.slice(0, 4) ?? "", month: value?.slice(5, 7) ?? "" };
}

/**
 * 기간 한쪽을 연 · 월 고르기로 고친다 (FE#25). 글자를 치지 않는다.
 * 연 · 월이 원래 값과 같으면 원래 문자열(일까지 있으면 일까지)을 그대로 돌려준다 — 정밀도를 잃지 않게
 */
function MonthField({ label, value, original, disabled, onChange }: {
  label: string;
  value: string | null;
  original: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const { year, month } = parts(value);
  const thisYear = new Date().getFullYear();
  const years = new Set<string>();
  for (let y = thisYear + 1; y >= FIRST_YEAR; y--) years.add(String(y).padStart(4, "0"));
  for (const extra of [year, parts(original).year]) if (extra) years.add(extra);
  const sorted = [...years].sort((a, b) => b.localeCompare(a));

  const change = (nextYear: string, nextMonth: string) => {
    if (!nextYear) return onChange(null);
    const o = parts(original);
    if (original && nextYear === o.year && nextMonth === o.month) return onChange(original);
    onChange(nextMonth ? `${nextYear}-${nextMonth}` : nextYear);
  };

  return (
    <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0" disabled={disabled}>
      <legend className="mb-1 p-0">{label}</legend>
      <div className="flex gap-2">
        <Select aria-label={`${label} 연도`} className="flex-1" value={year} disabled={disabled} onChange={(next) => change(next, next ? month : "")}
          options={[{ value: "", label: label === "종료" ? "없음 · 모름" : "기간 모름" }, ...sorted.map((y) => ({ value: y, label: `${Number(y)}년` }))]} />
        <Select aria-label={`${label} 월`} className="flex-1" value={month} disabled={disabled || !year} onChange={(next) => change(year, next)}
          options={[{ value: "", label: "월 모름" }, ...MONTH_OPTIONS]} />
      </div>
    </fieldset>
  );
}
