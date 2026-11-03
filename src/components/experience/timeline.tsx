"use client";

// 연도별 타임라인 — 활동 줄 목록 + 오른쪽 얇은 기간 띠(그해 1–12월). 겹침은 띠끼리 견줘 읽는다 (SPEC S-07 · DESIGN.md 「활동 줄」)
// PC 는 이름 옆에 띠, 모바일은 이름 아래에 띠
import { useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActivitySummary, Experience, Period } from "@/lib/api/types";
import { groupYear, periodText, type Span } from "@/lib/period";

type Props = {
  activities: ActivitySummary[];
  spans: Map<number, Span>;
  years: number[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** PC 끌어다 놓기 — 세부에서 끌고 있는 경험. 그 경험의 활동이 아닌 줄이 놓을 곳이 된다 (S-12) */
  dragging: Experience | null;
  onDropExperience: (experience: Experience, toActivityId: number) => void;
};

/** 줄마다 넘기는 끌어다 놓기 상태 */
type Drop = {
  dragging: Experience | null;
  overId: number | null;
  setOverId: (id: number | null) => void;
  onDrop: (experience: Experience, toActivityId: number) => void;
};

const rowLayout = "lg:grid-cols-[minmax(0,1fr)_264px] lg:items-center lg:gap-6";

export function Timeline({ activities, spans, years, selectedId, onSelect, dragging, onDropExperience }: Props) {
  const [overId, setOverId] = useState<number | null>(null);
  const drop: Drop = { dragging, overId: dragging ? overId : null, setOverId, onDrop: onDropExperience };

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
                    drop={drop}
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
                    drop={drop}
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
                drop={drop}
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
  drop,
}: {
  activity: ActivitySummary;
  selected: boolean;
  onSelect: (id: number) => void;
  drop: Drop;
  /** 앞 해에서 이어진 활동 — 흐린 줄로 이름 · 「N년부터 이어짐」 · 띠만 */
  continuing?: boolean;
  sub: ReactNode;
  band?: ReactNode;
}) {
  const droppable = drop.dragging != null && drop.dragging.activityId !== activity.id;
  const over = droppable && drop.overId === activity.id;
  const dragOver = (e: DragEvent) => {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!over) drop.setOverId(activity.id);
  };
  return (
    <li
      className="border-b border-hairline-soft"
      onDragOver={dragOver}
      onDragLeave={(e) => {
        if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) drop.setOverId(null);
      }}
      onDrop={(e) => {
        if (!droppable || !drop.dragging) return;
        e.preventDefault();
        drop.setOverId(null);
        drop.onDrop(drop.dragging, activity.id);
      }}
      data-drop-target={droppable || undefined}
    >
      <button
        type="button"
        onClick={() => onSelect(activity.id)}
        aria-pressed={selected}
        className={cn(
          "-mx-2.5 grid w-[calc(100%+20px)] gap-1.5 rounded-sm px-2.5 text-left transition-colors",
          rowLayout,
          continuing ? "py-2" : "py-3.5",
          over
            ? "bg-surface-strong outline-2 -outline-offset-2 outline-ink outline-dashed"
            : selected ? "bg-primary-soft" : "hover:bg-surface-soft",
          droppable && !over && "outline-1 -outline-offset-1 outline-hairline outline-dashed",
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
            {over ? <span className="font-medium text-ink">여기에 놓으면 이 활동으로 옮겨요</span> : sub}
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
