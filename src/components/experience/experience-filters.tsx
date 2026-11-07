"use client";

// 경험 거르기 — 역량 · 연도 · 분류 · 확인 필요만 (SPEC S-58) · 저장한 것 (S-71). 경험 찾기 화면과 빠른 찾기 창(S-61)이 같이 쓴다
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Select, optionsOf } from "@/components/ui/select";
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityCategory, type Competency, type ExperienceSearch } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type ExperienceFilters = Omit<ExperienceSearch, "query">;

export const isFiltered = ({ competencies, year, sourceStatus, category, saved }: ExperienceFilters) => !!(competencies?.length || year != null || sourceStatus || category || saved);

type Props = {
  value: ExperienceFilters;
  onChange: (next: ExperienceFilters) => void;
  /** 고를 수 있는 연도 — 최근 해부터 */
  years: number[];
  /** 「거르기 지우기」를 막대에 둔다 — 빠른 찾기 창은 찾은 게 없을 때만 보여 준다 */
  clearable?: boolean;
  /** 고르기를 마친 뒤 — 빠른 찾기 창은 입력칸으로 초점을 돌린다 */
  onDone?: () => void;
  className?: string;
};

/** 시안 6 .pal__filters .chip — 1024 미만만 44 로 키운다. 아래 화살표는 Select 안의 것도 같은 크기로 */
const chip = "min-h-11 w-auto cursor-pointer items-center gap-0.5 rounded-full border px-2.75 py-1 text-xs leading-[1.6] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:min-h-0 [&_svg]:size-3 [&_svg]:text-current";
const chipState = (on: boolean) => on ? "border-primary bg-primary font-semibold text-on-primary" : "border-hairline bg-canvas font-normal text-body hover:bg-surface-soft";

export function ExperienceFilterBar({ value, onChange, years, clearable, onDone, className }: Props) {
  const competencies = value.competencies ?? [];
  const change = (patch: ExperienceFilters) => onChange({ ...value, ...patch });

  return (
    <div role="group" aria-label="경험 거르기" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Select<ActivityCategory> aria-label="활동 분류" value={value.category ?? ""} onChange={(next) => change({ category: next || undefined })} onClosed={onDone} triggerLabel={value.category ? undefined : "분류"} className={cn(chip, chipState(!!value.category))}
        options={[{ value: "", label: "모든 분류" }, ...optionsOf(ACTIVITY_CATEGORIES)]} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={cn(chip, "inline-flex", chipState(competencies.length > 0))}>
            역량{competencies.length > 0 && <span className="tabular-nums">{competencies.length}</span>}
            <CaretDownIcon aria-hidden="true" />
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
                <span className="grid size-4 place-items-center rounded-[4px] border border-hairline text-xs leading-none" aria-hidden="true">
                  <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
                </span>
                {COMPETENCIES[c]}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Select aria-label="연도" value={value.year == null ? "" : String(value.year)} onChange={(next) => change({ year: next ? Number(next) : undefined })} onClosed={onDone} triggerLabel={value.year == null ? "연도" : undefined} className={cn(chip, chipState(value.year != null))}
        options={[{ value: "", label: "모든 연도" }, ...years.map((y) => ({ value: String(y), label: `${y}년` }))]} />
      <ToggleChip on={value.sourceStatus === "NEEDS_REVIEW"} onToggle={(on) => { change({ sourceStatus: on ? "NEEDS_REVIEW" : undefined }); onDone?.(); }}>확인 필요만</ToggleChip>
      <ToggleChip on={value.saved === true} onToggle={(on) => { change({ saved: on ? true : undefined }); onDone?.(); }}>저장한 것</ToggleChip>
      {clearable && isFiltered(value) && <Button variant="ghost" size="sm" onClick={() => onChange({})}>거르기 지우기</Button>}
    </div>
  );
}

/** 눌러 켜는 칩 — 켜졌는지는 색만이 아니라 체크 아이콘 · aria-pressed 로도 알린다 */
function ToggleChip({ on, onToggle, children }: { on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={() => onToggle(!on)} className={cn(chip, "inline-flex", chipState(on))}>
    {on && <CheckIcon weight="bold" aria-hidden="true" />}{children}
  </button>;
}
