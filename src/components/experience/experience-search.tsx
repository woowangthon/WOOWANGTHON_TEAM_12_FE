"use client";

// 경험 찾기 — 낱말 · 역량 · 연도 · 확인 필요 · 분류로 경험을 한 줄씩 훑는다 (SPEC S-58). AI 를 부르지 않는다
import { ArrowsClockwiseIcon, CaretDownIcon, MagnifyingGlassIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { useMemo, useState } from "react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import type { MockMode } from "@/lib/api/experience";
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityCategory, type Competency, type ExperienceSearch as Search } from "@/lib/api/types";
import { ExperienceResultRow } from "./experience-result";
import { useExperienceSearch } from "./use-experience-search";

const control = "h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink";

type Props = {
  initialQuery: string;
  /** 고를 수 있는 연도 — 최근 해부터 */
  years: number[];
  mock: MockMode;
  version: number;
  /** 지우기를 되돌릴 수 있는 동안 숨겨 둘 경험 */
  hiddenIds: Set<number>;
  onOpen: (activityId: number) => void;
};

export function ExperienceSearch({ initialQuery, years, mock, version, hiddenIds, onOpen }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [category, setCategory] = useState<ActivityCategory | null>(null);

  const search = useMemo<Search>(() => ({
    query: query.trim() || undefined,
    competencies: competencies.length ? competencies : undefined,
    year: year ?? undefined,
    sourceStatus: needsReview ? "NEEDS_REVIEW" : undefined,
    category: category ?? undefined,
  }), [query, competencies, year, needsReview, category]);
  const { state, retry } = useExperienceSearch(search, { mock, version });
  const filtered = competencies.length > 0 || year != null || needsReview || category != null;
  const clearFilters = () => { setCompetencies([]); setYear(null); setNeedsReview(false); setCategory(null); };

  const shown = state.status === "ready" ? state.experiences.filter((e) => !hiddenIds.has(e.id)) : [];
  const total = state.status === "ready" ? state.total - (state.experiences.length - shown.length) : 0;

  return (
    <section aria-label="경험 찾기" className="mt-4">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="찾을 낱말"
          placeholder="낱말로 찾기 — 본문 · 근거 · 보완 · 활동 이름"
          className={`${control} w-full pl-9.5 text-base`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={`${control} inline-flex items-center gap-1.5`}>
              역량{competencies.length > 0 && <span className="font-semibold tabular-nums">{competencies.length}</span>}
              <CaretDownIcon className="size-3.5 text-muted" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className="z-50 max-h-[min(60dvh,420px)] min-w-40 overflow-auto rounded-md border border-hairline bg-canvas p-1 shadow-float">
              {(Object.keys(COMPETENCIES) as Competency[]).map((c) => (
                <DropdownMenu.CheckboxItem
                  key={c}
                  checked={competencies.includes(c)}
                  onCheckedChange={(on) => setCompetencies((prev) => on ? [...prev, c] : prev.filter((x) => x !== c))}
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
        <select aria-label="연도" value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} className={control}>
          <option value="">모든 연도</option>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select aria-label="활동 분류" value={category ?? ""} onChange={(e) => setCategory((e.target.value || null) as ActivityCategory | null)} className={control}>
          <option value="">모든 분류</option>
          {(Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[]).map((c) => <option key={c} value={c}>{ACTIVITY_CATEGORIES[c]}</option>)}
        </select>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-body">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} className="size-4 accent-review" />
          확인 필요만
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={clearFilters}>거르기 지우기</Button>}
      </div>

      {state.status === "loading" && <p className="py-10 text-center text-sm text-muted">경험을 찾고 있어요…</p>}
      {state.status === "error" && (
        <CenterState icon={<WarningCircleIcon className="text-error" />} title="경험을 찾지 못했어요" body={state.message}>
          <Button onClick={retry}><ArrowsClockwiseIcon />다시 시도</Button>
        </CenterState>
      )}
      {state.status === "ready" && total === 0 && (
        <div role="status">
          <CenterState icon={<MagnifyingGlassIcon />} title="쌓인 자료에서 찾지 못했어요" body="낱말을 바꾸거나 거르기를 줄여 보세요. 뜻으로 찾고 싶다면 홈에서 물어보세요." />
        </div>
      )}
      {state.status === "ready" && total > 0 && (
        <div aria-busy={state.refreshing}>
          <p role="status" className="mt-4 mb-0 text-[13px] text-muted tabular-nums">
            {total > shown.length ? `${total}개 중 ${shown.length}개를 보여 드려요. 낱말이나 거르기로 더 좁혀 보세요.` : `경험 ${total}개`}
          </p>
          <ul className="m-0 list-none p-0">
            {shown.map((e) => <ExperienceResultRow key={e.id} experience={e} onOpen={onOpen} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
