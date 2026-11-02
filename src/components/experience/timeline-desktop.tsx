"use client";

// PC 타임라인 — 최근 연도가 위, 한 해는 1–12월 가로 칸. 겹치면 줄을 나눠 쌓고, 진행 중은 끝을 빗금으로 흐린다 (SPEC S-07)
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ActivitySummary } from "@/lib/api/types";
import { layoutYear, periodText, type Span, type YearBar } from "@/lib/period";

type Props = {
  activities: ActivitySummary[];
  spans: Map<number, Span>;
  years: number[];
  now: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

export function TimelineDesktop({ activities, spans, years, now, selectedId, onSelect }: Props) {
  const dated = activities.filter((a) => spans.has(a.id)).map((a) => ({ item: a, span: spans.get(a.id)! }));
  const undated = activities.filter((a) => !spans.has(a.id));

  return (
    <div>
      <div className="sticky top-0 z-[2] grid grid-cols-[64px_1fr] bg-paper py-1.5">
        <span />
        <ol className="m-0 grid list-none grid-cols-12 p-0 font-mono text-[11px] text-ink-3">
          {MONTHS.map((m) => (
            <li key={m} className="pl-1">
              {m}
            </li>
          ))}
        </ol>
      </div>

      {years.map((year) => {
        const { bars, laneCount } = layoutYear(year, dated);
        const nowInYear = Math.floor(now / 12) === year;
        return (
          <section key={year} className="grid grid-cols-[64px_1fr] border-t border-line pt-3.5 pb-4.5" aria-label={`${year}년`}>
            <div className="grid content-start gap-0.5">
              <b className="font-mono text-xl leading-none font-medium tracking-tight">{year}</b>
              <small className="text-xs text-ink-3">활동 {bars.length}</small>
            </div>
            <div
              className="relative grid grid-cols-12 gap-y-2"
              style={{
                gridTemplateRows: `repeat(${laneCount}, 44px)`,
                backgroundImage: "linear-gradient(to right, var(--line) 1px, transparent 1px)",
                backgroundSize: "calc(100% / 12) 100%",
              }}
            >
              {nowInYear && <NowLine month={(now % 12) + 1} />}
              {bars.map((bar) => (
                <Bar
                  key={bar.item.id}
                  bar={bar}
                  startYear={Math.floor(spans.get(bar.item.id)!.start / 12)}
                  selected={bar.item.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}

      {undated.length > 0 && (
        <section className="grid grid-cols-[64px_1fr] border-t border-line pt-3.5" aria-label="기간을 모르는 활동">
          <div className="text-xs leading-snug text-ink-3">
            기간을
            <br />
            모르는 활동
          </div>
          <div className="flex flex-wrap gap-2">
            {undated.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.id)}
                aria-pressed={a.id === selectedId}
                className={cn(
                  "rounded-[9px] border bg-surface px-3 py-2 text-left text-[13px] font-semibold",
                  a.id === selectedId ? "border-leaf bg-leaf-soft" : "border-dashed border-line-2",
                )}
              >
                {a.name}
                <small className="block text-[11px] font-normal text-ink-3">경험 {a.experienceCount}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NowLine({ month }: { month: number }) {
  return (
    <span
      className="pointer-events-none absolute -top-2.5 -bottom-3.5 w-0 border-l-[1.5px] border-dashed border-apricot"
      style={{ left: `${((month - 0.5) / 12) * 100}%` }}
      aria-hidden="true"
    >
      <span className="absolute -bottom-0.5 left-1 bg-paper px-0.5 py-px text-[10px] leading-none font-semibold whitespace-nowrap text-apricot-ink">
        지금
      </span>
    </span>
  );
}

const ONGOING_FILL =
  "linear-gradient(to right, var(--leaf-soft) 55%, transparent), repeating-linear-gradient(135deg, var(--leaf-soft) 0 5px, transparent 5px 10px)";

function Bar({
  bar,
  startYear,
  selected,
  onSelect,
}: {
  bar: YearBar<ActivitySummary>;
  startYear: number;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const a = bar.item;
  const ongoingHere = a.period.ongoing && !bar.continuesAfter;
  const style: CSSProperties = {
    gridColumn: `${bar.fromMonth} / ${bar.toMonth + 1}`,
    gridRow: bar.lane + 1,
  };
  if (bar.continuesBefore) Object.assign(style, { borderLeftStyle: "dashed", marginLeft: 0 });
  if (bar.continuesAfter || ongoingHere) Object.assign(style, { borderRightStyle: "dashed" });
  if (bar.continuesAfter) style.marginRight = 0;
  if (ongoingHere && !selected) style.background = ONGOING_FILL;

  const textOnBar = selected && !bar.narrow;
  return (
    <button
      type="button"
      onClick={() => onSelect(a.id)}
      aria-pressed={selected}
      title={`${a.name} · ${periodText(a.period)}`}
      style={style}
      className={cn(
        "relative mx-[3px] flex min-w-0 flex-col justify-center rounded-[9px] border px-2.5 text-left transition hover:-translate-y-px hover:shadow-card",
        bar.continuesBefore && "rounded-l-[2px]",
        bar.continuesAfter && "rounded-r-[2px]",
        selected ? "border-leaf bg-leaf text-leaf-on" : "border-leaf/55 bg-leaf-soft text-ink",
      )}
    >
      <span
        className={cn(
          "min-w-0",
          bar.narrow && "absolute top-1/2 w-max max-w-[220px] -translate-y-1/2 text-ink",
          bar.narrow === "right" && "left-[calc(100%+8px)]",
          bar.narrow === "left" && "right-[calc(100%+8px)] text-right",
        )}
      >
        <span
          className={cn(
            "block truncate text-[13px] leading-tight font-semibold",
            selected && bar.narrow && "text-leaf-ink",
          )}
        >
          {a.name}
        </span>
        <span className={cn("block truncate text-[11px] leading-tight", textOnBar ? "text-leaf-on/85" : "text-ink-2")}>
          {ongoingHere && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] font-semibold",
                textOnBar ? "text-leaf-on" : "text-leaf-ink",
              )}
            >
              <span className={cn("size-1.5 rounded-full", textOnBar ? "bg-leaf-on" : "bg-leaf")} />
              진행 중
            </span>
          )}
          {ongoingHere && " · "}
          {bar.continuesBefore && `${startYear}년부터 · `}
          경험 {a.experienceCount}
        </span>
      </span>
    </button>
  );
}
