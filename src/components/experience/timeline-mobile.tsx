"use client";

// 모바일 타임라인 — PC 를 줄이지 않고 연도별 카드 목록으로. 카드 아래 12칸 띠가 그 해의 기간을 보인다 (SPEC S-07)
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActivitySummary } from "@/lib/api/types";
import { periodText, type Span } from "@/lib/period";

type Props = {
  activities: ActivitySummary[];
  spans: Map<number, Span>;
  years: number[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function TimelineMobile({ activities, spans, years, selectedId, onSelect }: Props) {
  const undated = activities.filter((a) => !spans.has(a.id));

  return (
    <div className="grid gap-3.5">
      {years.map((year) => {
        const first = year * 12;
        const last = first + 11;
        const inYear = activities.filter((a) => {
          const s = spans.get(a.id);
          return s && s.start <= last && s.end >= first;
        });
        const starts = inYear
          .filter((a) => spans.get(a.id)!.start >= first)
          .sort((a, b) => spans.get(a.id)!.start - spans.get(b.id)!.start);
        const continuing = inYear.filter((a) => spans.get(a.id)!.start < first);
        if (!inYear.length) return null;

        return (
          <section key={year} className="grid gap-2" aria-label={`${year}년`}>
            <div className="sticky top-0 z-[1] flex items-baseline gap-2 bg-paper py-1.5">
              <b className="font-mono text-lg font-medium">{year}</b>
              <small className="text-xs text-ink-3">활동 {inYear.length}</small>
            </div>
            {continuing.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                이어지는 활동
                {continuing.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className="rounded-full border border-dashed border-line-2 bg-surface px-2.5 py-0.5 text-xs text-ink-2"
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
            {starts.map((a) => {
              const s = spans.get(a.id)!;
              return (
                <ActivityCard key={a.id} activity={a} selected={a.id === selectedId} onSelect={onSelect}>
                  <span className="grid grid-cols-12 gap-0.5" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => {
                      const on = first + i >= s.start && first + i <= s.end;
                      return (
                        <i
                          key={i}
                          className={cn("h-[5px] rounded-[2px]", on ? "bg-leaf" : "bg-line")}
                          style={
                            on && a.period.ongoing
                              ? {
                                  background:
                                    "repeating-linear-gradient(135deg, var(--leaf) 0 2px, var(--leaf-soft) 2px 4px)",
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </span>
                </ActivityCard>
              );
            })}
          </section>
        );
      })}

      {undated.length > 0 && (
        <section className="grid gap-2" aria-label="기간을 모르는 활동">
          <div className="py-1.5 text-sm font-semibold">기간을 모르는 활동</div>
          {undated.map((a) => (
            <ActivityCard key={a.id} activity={a} selected={a.id === selectedId} onSelect={onSelect} />
          ))}
        </section>
      )}
    </div>
  );
}

function ActivityCard({
  activity: a,
  selected,
  onSelect,
  children,
}: {
  activity: ActivitySummary;
  selected: boolean;
  onSelect: (id: number) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(a.id)}
      className={cn(
        "grid w-full gap-1.5 rounded-lg border bg-surface px-3.5 py-3 text-left",
        selected ? "border-leaf shadow-[0_0_0_1px_var(--leaf)]" : "border-line",
      )}
    >
      <span className="text-[15px] leading-snug font-semibold">{a.name}</span>
      <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-2">
        {a.period.start && periodText(a.period)}
        <span className="font-sans text-ink-3">경험 {a.experienceCount}</span>
      </span>
      {children}
    </button>
  );
}
