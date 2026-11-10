// 쌓인 블록(S-28 · S-83) — 활동 시작 연도별로 경험 하나가 블록 하나. 시작을 모르면 「기간 모름」, 「확인 필요」는 점선.
// 색은 그 활동의 분류(S-57) 색이다 — 미분류는 회색(FE#371). 연도가 많아지면 줄을 바꾸고, 한 해의 블록이 많으면 옆 기둥으로 이어 쌓는다 — 가로로 밀리지 않게(FE#274)
import type { ActivityCategory, ActivityDetail, ActivitySummary } from "@/lib/api/types";
import { categoryOf } from "./activity-category";
import { cn } from "@/lib/utils";

const UNKNOWN = "기간 모름";
/** 한 기둥에 쌓는 블록 수 — 넘으면 옆에 새 기둥 */
const PER_COLUMN = 12;

type Block = { key: string; title: string; review: boolean; category: ActivityCategory | null };

export function experienceYears(activities: ActivitySummary[], details: ActivityDetail[] | null, hiddenIds?: Set<number>) {
  const years = new Map<string, Block[]>();
  for (const a of activities) {
    const year = a.period.start?.slice(0, 4) ?? UNKNOWN;
    const experiences = details?.find((d) => d.id === a.id)?.experiences.filter((e) => !hiddenIds?.has(e.id));
    const blocks = Array.from({ length: a.experienceCount }, (_, i): Block => {
      const e = experiences?.[i];
      return { key: `${a.id}-${i}`, title: e?.content ?? `${a.name}의 경험`, review: e?.sourceStatus === "NEEDS_REVIEW", category: categoryOf(a) };
    });
    years.set(year, [...(years.get(year) ?? []), ...blocks]);
  }
  // 「기간 모름」은 맨 뒤
  return [...years].sort(([a], [b]) => (a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : a.localeCompare(b)));
}

export function ExperienceBlocks({ years, size = "sm", className }: { years: ReturnType<typeof experienceYears>; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-wrap items-end gap-x-3 gap-y-3", className)}>
      {years.map(([year, blocks]) => {
        const columns = Array.from({ length: Math.ceil(blocks.length / PER_COLUMN) }, (_, i) => blocks.slice(i * PER_COLUMN, (i + 1) * PER_COLUMN));
        return (
          <span key={year} className="flex shrink-0 flex-col items-center gap-1.5">
            <span className="flex min-h-8 items-end gap-1" role="img" aria-label={`${year} 경험 ${blocks.length}개${blocks.some((b) => b.review) ? ` · 확인 필요 ${blocks.filter((b) => b.review).length}개` : ""}`}>
              {columns.map((column, c) => (
                <span key={c} className="flex flex-col-reverse gap-0.5">
                  {column.map((b) => (
                    <i key={b.key} title={b.title} data-category={b.category ?? undefined} className={cn("block rounded-sm bg-category even:translate-x-0.5", size === "md" ? "h-2 w-6" : "h-1.5 w-5", b.review && "outline-1 outline-offset-1 outline-dashed outline-review-line")} />
                  ))}
                </span>
              ))}
            </span>
            <small className="text-xs text-muted tabular-nums">{year}</small>
          </span>
        );
      })}
    </span>
  );
}
