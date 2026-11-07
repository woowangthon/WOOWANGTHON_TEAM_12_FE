"use client";

// 역량 고르기 — 닫힌 목록 13개에서 최대 3개 (SPEC 미결정 2 · FE#18). 자유 입력은 없다
// 앞에 고른 것이 더 잘 맞는 역량이라 고른 순서를 숫자로 보이고, 그 순서 그대로 보낸다
// 보이는 건 칩이지만 누르는 건 진짜 체크박스다 — 키보드 · 스크린 리더로도 고를 수 있다
import { cn } from "@/lib/utils";
import { COMPETENCIES, type Competency } from "@/lib/api/types";

export const MAX_COMPETENCIES = 3;

export function CompetencyPicker({ value, onChange }: { value: Competency[]; onChange: (next: Competency[]) => void }) {
  const full = value.length >= MAX_COMPETENCIES;
  return (
    <fieldset className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1 flex w-full items-baseline justify-between gap-2">
        <span>역량 (선택 · 최대 {MAX_COMPETENCIES}개)</span>
        <span className="text-xs text-muted tabular-nums" aria-live="polite">
          {value.length} / {MAX_COMPETENCIES}
        </span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(COMPETENCIES) as [Competency, string][]).map(([key, label]) => {
          const order = value.indexOf(key);
          const checked = order !== -1;
          const disabled = !checked && full;
          return (
            <label
              key={key}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors select-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                checked ? "border-ink bg-ink font-semibold text-canvas" : "border-hairline bg-canvas text-body hover:bg-surface-soft",
                disabled && "cursor-not-allowed opacity-40 hover:bg-canvas",
              )}
            >
              {/* 투명한 체크박스가 칩 전체를 덮는다 — 누르는 곳 = 체크박스. 이름은 순서 숫자 없이 역량 이름만 */}
              <input
                type="checkbox"
                aria-label={label}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? [...value, key] : value.filter((c) => c !== key))}
              />
              {checked && (
                <span
                  className="grid size-4.5 place-items-center rounded-full bg-canvas text-xs leading-none font-bold text-ink tabular-nums"
                  aria-hidden="true"
                >
                  {order + 1}
                </span>
              )}
              {label}
            </label>
          );
        })}
      </div>
      <p className="m-0 text-note text-muted">먼저 고른 역량일수록 이 경험에 더 잘 맞는 것으로 저장돼요.</p>
    </fieldset>
  );
}
