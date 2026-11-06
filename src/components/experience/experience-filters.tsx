"use client";

// 경험 거르기 — 역량 · 연도 · 분류 · 확인 필요만 (SPEC S-58). 경험 찾기 화면과 빠른 찾기 창(S-61)이 같이 쓴다
import { CaretDownIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Select, optionsOf } from "@/components/ui/select";
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
  const change = (patch: ExperienceFilters) => onChange({ ...value, ...patch });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5", className)}>
      <Select<ActivityCategory> aria-label="활동 분류" value={value.category ?? ""} onChange={(next) => change({ category: next || undefined })} onClosed={onDone} className={`${control} w-auto`}
        options={[{ value: "", label: "모든 분류" }, ...optionsOf(ACTIVITY_CATEGORIES)]} />
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
      <Select aria-label="연도" value={value.year == null ? "" : String(value.year)} onChange={(next) => change({ year: next ? Number(next) : undefined })} onClosed={onDone} className={`${control} w-auto`}
        options={[{ value: "", label: "모든 연도" }, ...years.map((y) => ({ value: String(y), label: `${y}년` }))]} />
      <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-body", compact && "gap-1.5 text-xs lg:min-h-8")}>
        <input type="checkbox" checked={value.sourceStatus === "NEEDS_REVIEW"} onChange={(e) => { change({ sourceStatus: e.target.checked ? "NEEDS_REVIEW" : undefined }); onDone?.(); }} className="size-4 accent-review" />
        확인 필요만
      </label>
      {!compact && isFiltered(value) && <Button variant="ghost" size="sm" onClick={() => onChange({})}>거르기 지우기</Button>}
    </div>
  );
}
