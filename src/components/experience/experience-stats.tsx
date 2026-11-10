"use client";

// 내 경험 통계(S-83) — 쌓인 블록(+출처 상태) · 분류 · 나를 보여 주는 역량(역량별 경험 수) 카드 세 장 + 활동 서랍(FE#365 · FE#368). 숫자는 모두 받은 활동 · 경험에서 센다(대회 규칙 1). AI 를 부르지 않는다
import { InfoTip } from "@/components/ui/info-tip";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, ChartPieSliceIcon } from "@phosphor-icons/react";
import { AddSourceButton, type AddSourceProps } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { fetchActivity } from "@/lib/api/experience";
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityDetail, type ActivitySummary, type Competency, type SourceStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CATEGORY_KEYS, CategoryIcon, categoryOf } from "./activity-category";
import { ExperienceBlocks, experienceYears } from "./experience-blocks";
import { PeriodLabel } from "./timeline";

type DetailState = { status: "loading" } | { status: "ready"; details: ActivityDetail[]; failed: number };

const SOURCE: { value: SourceStatus; label: string; bar: string }[] = [
  { value: "SOURCE_CONFIRMED", label: "원문 확인", bar: "bg-evidence" },
  { value: "USER_ENTERED", label: "내가 입력", bar: "bg-ink" },
  { value: "NEEDS_REVIEW", label: "확인 필요", bar: "border border-dashed border-review bg-review-line" },
];

type Props = {
  activities: ActivitySummary[];
  /** 활동 세부에서 경험을 고치거나 옮긴 뒤 바뀐다 — 경험 내용(출처 상태 · 역량)을 다시 읽는다 */
  version: number;
  /** 지우기를 되돌릴 수 있는 동안 숨겨 둔 경험 */
  hiddenIds: Set<number>;
  addSource: AddSourceProps;
  onOpenActivity: (id: number) => void;
};

export function ExperienceStats({ activities, version, hiddenIds, addSource, onOpenActivity }: Props) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const ids = activities.map((a) => `${a.id}:${a.experienceCount}`).join(",");

  // 출처 상태 · 역량은 활동 세부에만 있다 — 활동마다 한 번씩 읽는다(홈 쌓인 블록과 같은 길)
  useEffect(() => {
    let stale = false;
    const targets = ids ? ids.split(",").map((s) => Number(s.split(":")[0])) : [];
    Promise.allSettled(targets.map((id) => fetchActivity(id))).then((results) => {
      if (stale) return;
      setState({ status: "ready", details: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])), failed: results.filter((r) => r.status === "rejected").length });
    });
    return () => { stale = true; };
  }, [ids, version, attempt]);

  const details = state.status === "ready" ? state.details : null;
  const total = activities.reduce((n, a) => n + a.experienceCount, 0);
  const years = useMemo(() => experienceYears(activities, details, hiddenIds), [activities, details, hiddenIds]);

  const byCategory = [...CATEGORY_KEYS, null].map((c) => ({
    key: c ?? "NONE",
    label: c ? ACTIVITY_CATEGORIES[c] : "미분류",
    icon: c && <CategoryIcon category={c} />,
    category: c,
    count: activities.filter((a) => categoryOf(a) === c).reduce((n, a) => n + a.experienceCount, 0),
  }));

  const experiences = (details ?? []).flatMap((d) => d.experiences).filter((e) => !hiddenIds.has(e.id));
  const bySource = SOURCE.map((s) => ({ ...s, count: experiences.filter((e) => e.sourceStatus === s.value).length }));
  const competencyCounts = new Map<Competency, number>();
  for (const e of experiences) for (const c of e.competencies) competencyCounts.set(c, (competencyCounts.get(c) ?? 0) + 1);
  const byCompetency = [...competencyCounts].sort((a, b) => b[1] - a[1]);
  const noCompetency = experiences.filter((e) => e.competencies.length === 0).length;
  const reviewFirst = (details ?? []).find((d) => d.experiences.some((e) => e.sourceStatus === "NEEDS_REVIEW" && !hiddenIds.has(e.id)));

  if (total === 0) {
    return (
      <CenterState icon={<ChartPieSliceIcon />} title="아직 쌓인 경험이 없어요" body="자료를 넣으면 경험 하나가 블록 하나로 쌓이고, 여기서 연도 · 분류별로 한눈에 볼 수 있어요.">
        <AddSourceButton {...addSource} />
      </CenterState>
    );
  }

  const detailNote = state.status === "loading"
    ? <p role="status" className="m-0 text-note text-muted">경험 내용을 불러오고 있어요…</p>
    : state.failed > 0 && (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-note text-error">
        활동 {state.failed}개의 경험을 불러오지 못해 그만큼 빠져 있어요.
        <Button variant="secondary" size="sm" onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }}><ArrowsClockwiseIcon />다시 시도</Button>
      </div>
    );

  const missing = (Object.keys(COMPETENCIES) as Competency[]).filter((c) => !competencyCounts.has(c)).map((c) => COMPETENCIES[c]);

  return (
    <div className="mt-5 grid gap-10">
    <section aria-label="내 경험 통계" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="쌓인 블록" info="활동 시작 연도별 경험 수예요. 블록 하나가 경험 하나이고, 점선은 확인이 필요한 경험이에요.">
        <ExperienceBlocks years={years} size="md" className="min-h-32 flex-1 content-end" />
        <div className="mt-4">
          {detailNote || <>
            <ul aria-label="출처 상태별" className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-note text-muted">
              {bySource.map((s) => (
                <li key={s.value} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("inline-block h-2 w-3.5 rounded-sm", s.bar)} />
                  {s.label} <b className="font-semibold text-ink tabular-nums">{s.count}</b>
                </li>
              ))}
            </ul>
            {reviewFirst && <Button variant="link" className="mt-1 h-auto px-0" onClick={() => onOpenActivity(reviewFirst.id)}>확인할 경험 보기</Button>}
          </>}
        </div>
      </Card>

      <Card title="분류별" info="활동에 붙은 분류로 그 안의 경험을 셌어요. 분류는 활동 세부에서 골라요."
        aside={<span className="text-sm text-muted tabular-nums"><b className="mr-0.5 text-3xl font-bold tracking-[-0.5px] text-ink">{total}</b>개의 경험이 차곡차곡</span>}>
        <Bars total={total} rows={byCategory.filter((r) => r.category || r.count > 0).map((r) => ({
          key: r.key, count: r.count,
          label: <span data-category={r.category ?? undefined} className="inline-flex items-center gap-1.5">{r.icon}{r.label}</span>,
          bar: <span data-category={r.category ?? undefined} className="block h-full bg-category" />,
        }))} />
      </Card>

      <Card title="나를 보여 주는 역량" info={<>경험에 붙은 역량을 많은 순으로 셌어요. 역량은 AI 해석이 섞여 있고, 경험 하나에 여러 개 붙을 수 있어요{noCompetency ? ` · 역량 없는 경험 ${noCompetency}개` : ""}.</>}>
        {detailNote || <div className="grid gap-5">
          <div className="grid gap-2.5">
            <p className="m-0 text-note text-muted">많이 해 본 역량</p>
            {byCompetency.length === 0 ? <p className="m-0 text-sm text-muted">아직 역량이 붙은 경험이 없어요.</p> : <CompetencyChips counts={byCompetency} />}
          </div>
          {missing.length > 0 && (
            <div className="grid gap-2.5">
              <p className="m-0 text-note text-muted">아직 경험이 없는 역량</p>
              <p title={missing.join(" · ")} className="m-0 line-clamp-2 text-sm text-body">{missing.join(" · ")}</p>
            </div>
          )}
        </div>}
      </Card>
    </section>

    <ActivityDrawer activities={activities} onOpenActivity={onOpenActivity} />
    </div>
  );
}

/** 많이 해 본 역량 — 위 3개만 펴 두고 나머지는 「+N」으로 접는다(FE#368) */
function CompetencyChips({ counts }: { counts: [Competency, number][] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? counts : counts.slice(0, 3);
  const hidden = counts.length - 3;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {shown.map(([c, n], i) => (
        <li key={c} className={cn("rounded-full border px-3.5 py-1.5 text-sm", i < 3 ? "border-hairline text-ink" : "border-transparent bg-surface-soft text-body")}>
          {COMPETENCIES[c]} <b className="font-bold tabular-nums">{n}</b>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
            className="min-h-11 cursor-pointer rounded-full px-3 text-sm text-muted tabular-nums hover:bg-surface-soft hover:text-ink lg:min-h-9">
            {open ? "접기" : `+${hidden}`}
          </button>
        </li>
      )}
    </ul>
  );
}

type Sort = "latest" | "oldest";

/** 활동 서랍 — 활동 하나가 폴더 하나. 누르면 활동 세부(S-08). 시작을 모르는 활동은 순서와 상관없이 맨 뒤 */
function ActivityDrawer({ activities, onOpenActivity }: { activities: ActivitySummary[]; onOpenActivity: (id: number) => void }) {
  const [sort, setSort] = useState<Sort>("latest");
  const sorted = [...activities].sort((a, b) => {
    const x = a.period.start, y = b.period.start;
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return sort === "latest" ? y.localeCompare(x) : x.localeCompare(y);
  });
  return (
    <section aria-labelledby="activity-drawer" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="activity-drawer" className="m-0 text-base font-bold text-ink">활동 서랍 <span className="font-normal text-muted tabular-nums">{activities.length}</span></h2>
        <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as Sort)}
          className="min-h-11 cursor-pointer rounded-full bg-surface-soft px-3.5 text-note text-body lg:min-h-9">
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>
      <ul className="m-0 grid list-none gap-x-5 gap-y-4 p-0 sm:gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
        {sorted.map((a) => {
          const category = categoryOf(a) ?? undefined;
          return (
            <li key={a.id} data-category={category}>
              <button type="button" onClick={() => onOpenActivity(a.id)}
                className="group relative block w-full cursor-pointer pt-4 text-left">
                {/* 폴더 탭 */}
                <span aria-hidden="true" className="absolute top-0 left-0 h-8 w-2/5 rounded-t-md bg-category-soft [clip-path:polygon(0_0,72%_0,100%_100%,0_100%)]" />
                <span className="relative flex min-h-28 flex-col sm:min-h-40 rounded-md rounded-tl-none bg-category-soft p-5 transition-transform group-hover:-translate-y-0.5 group-focus-visible:outline-2 group-focus-visible:outline-ink">
                  <span className="truncate text-base font-bold text-ink">{a.name}</span>
                  <span className="mt-1 text-sm text-category-ink tabular-nums">경험 {a.experienceCount}</span>
                  <span className="mt-auto pt-4 text-sm sm:pt-6 text-body tabular-nums"><PeriodLabel period={a.period} /></span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Card({ title, info, aside, children }: { title: string; info?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex min-w-0 flex-col rounded-md border border-hairline bg-canvas p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5"><h2 className="m-0 text-base font-bold text-ink">{title}</h2>{info && <InfoTip label={title}>{info}</InfoTip>}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** 가로 막대 — 길이는 전체 대비 비율, 숫자 · 이름을 글자로 같이 보여 색 없이도 읽힌다 */
function Bars({ total, rows }: { total: number; rows: { key: string; label: ReactNode; count: number; bar: ReactNode }[] }) {
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1.5">
          <span className="flex items-baseline justify-between gap-2 text-sm text-body">
            {r.label}
            <span className="shrink-0 text-muted tabular-nums" title={total > 0 ? `${Math.round((r.count / total) * 100)}%` : undefined}>{r.count}개</span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-soft" aria-hidden="true">
            {r.count > 0 && total > 0 && <span className="block h-full" style={{ width: `${(r.count / total) * 100}%` }}>{r.bar}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
