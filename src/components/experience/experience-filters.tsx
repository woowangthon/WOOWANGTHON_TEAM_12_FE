"use client";

// 경험 거르기 — 역량 · 연도 · 분류 · 확인 필요만 (SPEC S-58). 경험 찾기 화면과 빠른 찾기 창(S-61)이 같이 쓴다
import { CaretDownIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityCategory, type Competency, type ExperienceSearch } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type ExperienceFilters = Omit<ExperienceSearch, "query">;

export const isFiltered = ({ competencies, year, sourceStatus, category }: ExperienceFilters) => !!(competencies?.length || year != null || sourceStatus || category);

type Props = {
  value: ExperienceFilters;
  onChange: (next: ExperienceFilters) => void;
  /** 고를 수 있는 연도 — 최근 해부터 */
  years: number[];
  /** 빠른 찾기 창의 작은 칩 */
  compact?: boolean;
  /** 고르기를 마친 뒤 — 빠른 찾기 창은 입력칸으로 초점을 돌린다 */
  onDone?: () => void;
  className?: string;
};

export function ExperienceFilterBar({ value, onChange, years, compact, onDone, className }: Props) {
  const control = compact
    ? "min-h-11 rounded-full border border-hairline bg-canvas px-3 text-xs text-ink lg:min-h-8"
    : "h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink";
  const competencies = value.competencies ?? [];
  const set = (patch: ExperienceFilters) => { onChange({ ...value, ...patch }); onDone?.(); };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5", className)}>
      <select aria-label="활동 분류" value={value.category ?? ""} onChange={(e) => set({ category: (e.target.value || undefined) as ActivityCategory | undefined })} className={control}>
        <option value="">모든 분류</option>
        {(Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[]).map((c) => <option key={c} value={c}>{ACTIVITY_CATEGORIES[c]}</option>)}
      </select>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${control} inline-flex items-center gap-1.5`}>
            역량{competencies.length > 0 && <span className="font-semibold tabular-nums">{competencies.length}</span>}
            <CaretDownIcon className="size-3.5 text-muted" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} onCloseAutoFocus={onDone && ((e) => { e.preventDefault(); onDone(); })}
            className="z-50 max-h-[min(60dvh,420px)] min-w-40 overflow-auto rounded-md border border-hairline bg-canvas p-1 shadow-float">
            {(Object.keys(COMPETENCIES) as Competency[]).map((c) => (
              <DropdownMenu.CheckboxItem
                key={c}
                checked={competencies.includes(c)}
                onCheckedChange={(on) => {
                  const next = on ? [...competencies, c] : competencies.filter((x) => x !== c);
                  onChange({ ...value, competencies: next.length ? next : undefined });
                }}
                onSelect={(e) => e.preventDefault()} // 여러 개 고르는 동안 닫지 않는다
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft"
              >
                <span className="grid size-4 place-items-center rounded-[4px] border border-hairline text-[11px] leading-none" aria-hidden="true">
                  <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
                </span>
                {COMPETENCIES[c]}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <select aria-label="연도" value={value.year ?? ""} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })} className={control}>
        <option value="">모든 연도</option>
        {years.map((y) => <option key={y} value={y}>{y}년</option>)}
      </select>
      <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-body", compact && "gap-1.5 text-xs lg:min-h-8")}>
        <input type="checkbox" checked={value.sourceStatus === "NEEDS_REVIEW"} onChange={(e) => set({ sourceStatus: e.target.checked ? "NEEDS_REVIEW" : undefined })} className="size-4 accent-review" />
        확인 필요만
      </label>
      {!compact && isFiltered(value) && <Button variant="ghost" size="sm" onClick={() => onChange({})}>거르기 지우기</Button>}
    </div>
  );
}
