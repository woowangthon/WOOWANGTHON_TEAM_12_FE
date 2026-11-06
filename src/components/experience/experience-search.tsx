"use client";

// 경험 찾기 — 낱말 · 역량 · 연도 · 확인 필요 · 분류로 경험을 한 줄씩 훑는다 (SPEC S-58). AI 를 부르지 않는다
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import type { MockMode } from "@/lib/api/experience";
import type { ExperienceSearch as Search } from "@/lib/api/types";
import { ExperienceFilterBar, type ExperienceFilters } from "./experience-filters";
import { ExperienceResultRow } from "./experience-result";
import { useExperienceSearch } from "./use-experience-search";

type Props = {
  /** 처음 조건 — 주소 · 빠른 찾기 창이 넘긴다 */
  initial: Search;
  /** 고를 수 있는 연도 — 최근 해부터 */
  years: number[];
  mock: MockMode;
  version: number;
  /** 지우기를 되돌릴 수 있는 동안 숨겨 둘 경험 */
  hiddenIds: Set<number>;
  onOpen: (activityId: number) => void;
};

export function ExperienceSearch({ initial, years, mock, version, hiddenIds, onOpen }: Props) {
  const [query, setQuery] = useState(initial.query ?? "");
  const [filters, setFilters] = useState<ExperienceFilters>(() => { const { query: _word, ...rest } = initial; void _word; return rest; });

  const search = useMemo<Search>(() => ({ query: query.trim() || undefined, ...filters }), [query, filters]);
  const { state, retry } = useExperienceSearch(search, { mock, version });

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
          className="h-11 w-full rounded-md border border-hairline bg-canvas px-3 pl-9.5 text-base text-ink"
        />
      </div>
      <ExperienceFilterBar value={filters} onChange={setFilters} years={years} className="mt-2" />

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
