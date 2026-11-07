"use client";

// 기간 한쪽 고르기 — 활동 기간을 그 자리에서 고치는 메뉴(inline-edit PeriodField)가 쓴다
import { Select } from "@/components/ui/select";

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
export function MonthField({ label, value, original, disabled, onChange }: {
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
