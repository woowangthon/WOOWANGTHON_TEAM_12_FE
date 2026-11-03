"use client";

// 연도별 타임라인 — 활동 줄 목록 + 오른쪽 얇은 기간 띠(그해 1–12월). 겹침은 띠끼리 견줘 읽는다 (SPEC S-07 · DESIGN.md 「활동 줄」)
// PC 는 이름 옆에 띠, 모바일은 이름 아래에 띠
import { useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActivitySummary, Experience, Period } from "@/lib/api/types";
import { groupYear, periodText, type Span } from "@/lib/period";

type Edge = "start" | "end";

type Props = {
  /** 문항 목에서 여는 타임라인은 조회만 허용한다. */
  readOnly?: boolean;
  activities: ActivitySummary[];
  spans: Map<number, Span>;
  years: number[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** PC 끌어다 놓기 — 세부에서 끌고 있는 경험. 그 경험의 활동이 아닌 줄이 놓을 곳이 된다 (S-12) */
  dragging: Experience | null;
  onDropExperience: (experience: Experience, toActivityId: number) => void;
  /** PC — 기간 띠 끝을 끌어 기간을 고친다 (S-17). 놓았을 때 한 번 부른다 */
  onPeriodChange: (activity: ActivitySummary, period: Period) => void;
};

/** 끈 쪽 끝만 「YYYY-MM」 으로 바꾼다. 종료가 비어 있던(한 달짜리) 활동의 시작을 끌면 원래 시작을 종료로 남긴다 */
function movedPeriod(period: Period, edge: Edge, month: number): Period {
  const value = `${String(Math.floor(month / 12)).padStart(4, "0")}-${String((month % 12) + 1).padStart(2, "0")}`;
  if (edge === "end") return { ...period, end: value };
  return { ...period, start: value, end: period.end ?? (period.ongoing ? null : period.start) };
}

/** 줄마다 넘기는 끌어다 놓기 상태 */
type Drop = {
  dragging: Experience | null;
  overId: number | null;
  setOverId: (id: number | null) => void;
  onDrop: (experience: Experience, toActivityId: number) => void;
};

const rowLayout = "lg:grid-cols-[minmax(0,1fr)_264px] lg:items-center lg:gap-6";

export function Timeline({ activities, spans, years, selectedId, onSelect, dragging, onDropExperience, onPeriodChange, readOnly = false }: Props) {
  const [overId, setOverId] = useState<number | null>(null);
  const drop: Drop = { dragging, overId: dragging ? overId : null, setOverId, onDrop: onDropExperience };
  // 띠 끝을 끄는 동안의 미리보기 — 놓기 전엔 저장하지 않는다
  const [preview, setPreview] = useState<{ id: number; span: Span; period: Period } | null>(null);

  const edgeHandler = (item: ActivitySummary, span: Span) => (edge: Edge, month: number | null, done: boolean) => {
    if (month == null) return setPreview(null);
    const next = edge === "start" ? { start: Math.min(month, span.end), end: span.end } : { start: span.start, end: Math.max(month, span.start) };
    const changed = next.start !== span.start || next.end !== span.end;
    const period = movedPeriod(item.period, edge, edge === "start" ? next.start : next.end);
    if (!done) return setPreview(changed ? { id: item.id, span: next, period } : null);
    setPreview(null);
    if (changed) onPeriodChange(item, period);
  };
  const shown = (id: number, span: Span) => (preview?.id === id ? preview.span : span);
  const previewSub = (id: number) =>
    preview?.id === id ? <span className="font-medium text-ink">바꿀 기간 {periodText(preview.period)}</span> : null;

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
                      previewSub(item.id) ?? (
                        <>
                          <PeriodLabel period={item.period} />
                          <span className="ml-2.5">{experienceCountText(item.experienceCount)}</span>
                        </>
                      )
                    }
                    band={<PeriodBand id={item.id} span={shown(item.id, span)} year={year} ongoing={item.period.ongoing} selected={selected} onEdge={readOnly ? undefined : edgeHandler(item, span)} />}
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
                    sub={previewSub(item.id) ?? `${Math.floor(span.start / 12)}년부터 이어짐`}
                    band={
                      <PeriodBand id={item.id} span={shown(item.id, span)} year={year} ongoing={item.period.ongoing} selected={selected} faint onEdge={readOnly ? undefined : edgeHandler(item, span)} />
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
                sub={experienceCountText(a.experienceCount)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 경험 0개는 실패가 아니다 — 0 이라는 숫자 대신 「아직 없음」으로. 색은 더하지 않는다(DESIGN.md — 색 꼬리표는 「확인 필요」 하나) (FE#22) */
function experienceCountText(count: number) {
  return count === 0 ? "경험 아직 없음" : `경험 ${count}`;
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
      className="group/row border-b border-hairline-soft"
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

/** 그해 1–12월 12칸. 활동한 달은 산호, 진행 중이면 마지막 칸을 흐리게 (DESIGN.md 「기간 띠」)
 *  PC 는 줄에 마우스를 올리면 그해 안에 있는 시작 · 종료 끝에 손잡이가 나와 끌 수 있다 (S-17) */
function PeriodBand({
  id,
  span,
  year,
  ongoing,
  selected,
  faint,
  onEdge,
}: {
  id: number;
  span: Span;
  year: number;
  ongoing: boolean;
  selected: boolean;
  faint?: boolean;
  /** month 가 null 이면 끌기 취소 */
  onEdge?: (edge: Edge, month: number | null, done: boolean) => void;
}) {
  const first = year * 12;
  const on = faint ? ON_FAINT : ON;
  const off = selected ? "var(--canvas)" : "var(--hairline-soft)";
  const inYear = (month: number) => month >= first && month <= first + 11;

  // 손잡이의 부모가 띠다. 끄는 중인지는 포인터 캡처로 안다
  const monthAt = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    return first + Math.min(11, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 12)));
  };

  const handle = (edge: Edge) => (
    <span
      key={edge}
      aria-hidden="true"
      data-testid={`band-${edge}-${id}-${year}`}
      title={edge === "start" ? "끌어서 시작 달 바꾸기" : "끌어서 끝 달 바꾸기"}
      className={cn(
        "absolute top-1/2 hidden h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center lg:flex",
        "opacity-0 group-hover/row:opacity-100",
      )}
      style={{ left: `${(((edge === "start" ? span.start : span.end + 1) - first) / 12) * 100}%` }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation(); // 띠 끝을 누른 건 세부 열기가 아니다
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onEdge?.(edge, monthAt(e), false);
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onEdge?.(edge, monthAt(e), true);
      }}
      onPointerCancel={() => onEdge?.(edge, null, true)}
    >
      <i className="h-4 w-1 rounded-full bg-primary-active shadow-[0_0_0_2px_var(--canvas)]" />
    </span>
  );

  return (
    <span className="relative grid grid-cols-12 gap-0.5">
      {Array.from({ length: 12 }, (_, i) => {
        const month = first + i;
        const active = month >= span.start && month <= span.end;
        const fade = active && ongoing && month === span.end;
        const background = !active ? off : fade ? `linear-gradient(to right, ${on}, var(--primary-soft))` : on;
        return <i key={i} className="h-1.5 rounded-[2px]" style={{ background }} aria-hidden="true" />;
      })}
      {onEdge && inYear(span.start) && handle("start")}
      {onEdge && !ongoing && inYear(span.end) && handle("end")}
    </span>
  );
}
