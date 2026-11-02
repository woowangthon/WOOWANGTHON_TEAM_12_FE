"use client";

// 연도별 타임라인 — 활동 줄 목록 + 오른쪽 얇은 기간 띠(그해 1–12월). 겹침은 띠끼리 견줘 읽는다 (SPEC S-07 · DESIGN.md 「활동 줄」)
// PC 는 이름 옆에 띠, 모바일은 이름 아래에 띠
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActivitySummary, Period } from "@/lib/api/types";
import { groupYear, periodText, type Span } from "@/lib/period";

type Props = {
  activities: ActivitySummary[];
  spans: Map<number, Span>;
  years: number[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const rowLayout = "lg:grid-cols-[minmax(0,1fr)_264px] lg:items-center lg:gap-6";

export function Timeline({ activities, spans, years, selectedId, onSelect }: Props) {
  const dated = activities.filter((a) => spans.has(a.id)).map((a) => ({ item: a, span: spans.get(a.id)! }));
  const undated = activities.filter((a) => !spans.has(a.id));

  return (
    <div>
      {years.map((year) => {
        const { starts, continuing } = groupYear(year, dated);
        return (
          <section key={year} className="pt-7" aria-label={`${year}년`}>
            <YearHead label={String(year)} count={starts.length + continuing.length} showMonths />
            <ul className="m-0 list-none p-0">
              {starts.map(({ item, span }) => {
                const selected = item.id === selectedId;
                return (
                  <Row
                    key={item.id}
                    activity={item}
                    selected={selected}
                    onSelect={onSelect}
                    sub={
                      <>
                        <PeriodLabel period={item.period} />
                        <span className="ml-2.5">경험 {item.experienceCount}</span>
                      </>
                    }
                    band={<PeriodBand span={span} year={year} ongoing={item.period.ongoing} selected={selected} />}
                  />
                );
              })}
              {continuing.map(({ item, span }) => {
                const selected = item.id === selectedId;
                return (
                  <Row
                    key={item.id}
                    activity={item}
                    selected={selected}
                    onSelect={onSelect}
                    continuing
                    sub={`${Math.floor(span.start / 12)}년부터 이어짐`}
                    band={
                      <PeriodBand span={span} year={year} ongoing={item.period.ongoing} selected={selected} faint />
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {undated.length > 0 && (
        <section className="pt-7" aria-label="기간 모름">
          <YearHead label="기간 모름" count={undated.length} />
          <ul className="m-0 list-none p-0">
            {undated.map((a) => (
              <Row
                key={a.id}
                activity={a}
                selected={a.id === selectedId}
                onSelect={onSelect}
                sub={`경험 ${a.experienceCount}`}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function YearHead({ label, count, showMonths }: { label: string; count: number; showMonths?: boolean }) {
  return (
    <div className={cn("grid border-b border-ink pb-2 lg:items-end", rowLayout)}>
      <b className="text-[17px] font-semibold tabular-nums">
        {label}
        <small className="ml-2 text-[13px] font-medium text-muted">활동 {count}</small>
      </b>
      {showMonths && (
        <span className="hidden grid-cols-12 text-[11px] text-muted-soft tabular-nums lg:grid" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={cn(i % 3 === 0 && "text-muted")}>
              {i + 1}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Row({
  activity,
  selected,
  onSelect,
  continuing,
  sub,
  band,
}: {
  activity: ActivitySummary;
  selected: boolean;
  onSelect: (id: number) => void;
  /** 앞 해에서 이어진 활동 — 흐린 줄로 이름 · 「N년부터 이어짐」 · 띠만 */
  continuing?: boolean;
  sub: ReactNode;
  band?: ReactNode;
}) {
  return (
    <li className="border-b border-hairline-soft">
      <button
        type="button"
        onClick={() => onSelect(activity.id)}
        aria-pressed={selected}
        className={cn(
          "-mx-2.5 grid w-[calc(100%+20px)] gap-1.5 rounded-sm px-2.5 text-left transition-colors",
          rowLayout,
          continuing ? "py-2" : "py-3.5",
          selected ? "bg-primary-soft" : "hover:bg-surface-soft",
        )}
      >
        <span className="grid min-w-0 gap-0.5">
          <span
            className={cn(
              "leading-snug",
              continuing ? "text-sm font-medium text-muted lg:text-[15px]" : "text-base font-semibold lg:text-[17px]",
              selected && "text-primary-active",
            )}
          >
            {activity.name}
          </span>
          <span className={cn("text-muted tabular-nums", continuing ? "text-[13px]" : "text-[13px] lg:text-sm")}>
            {sub}
          </span>
        </span>
        {band}
      </button>
    </li>
  );
}

/** 「2024.09 – ● 진행 중」 */
function PeriodLabel({ period }: { period: Period }) {
  if (!period.ongoing || !period.start) return <>{periodText(period)}</>;
  return (
    <>
      {periodText({ start: period.start, end: null, ongoing: false })} –{" "}
      <span className="ml-0.5 inline-flex items-center gap-1.5 font-medium text-primary-active">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        진행 중
      </span>
    </>
  );
}

const ON = "color-mix(in srgb, var(--primary) 55%, var(--primary-soft))";
const ON_FAINT = "color-mix(in srgb, var(--primary) 25%, var(--primary-soft))";

/** 그해 1–12월 12칸. 활동한 달은 산호, 진행 중이면 마지막 칸을 흐리게 (DESIGN.md 「기간 띠」) */
function PeriodBand({
  span,
  year,
  ongoing,
  selected,
  faint,
}: {
  span: Span;
  year: number;
  ongoing: boolean;
  selected: boolean;
  faint?: boolean;
}) {
  const on = faint ? ON_FAINT : ON;
  const off = selected ? "var(--canvas)" : "var(--hairline-soft)";
  return (
    <span className="grid grid-cols-12 gap-0.5" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => {
        const month = year * 12 + i;
        const active = month >= span.start && month <= span.end;
        const fade = active && ongoing && month === span.end;
        const background = !active ? off : fade ? `linear-gradient(to right, ${on}, var(--primary-soft))` : on;
        return <i key={i} className="h-1.5 rounded-[2px]" style={{ background }} />;
      })}
    </span>
  );
}
