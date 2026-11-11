"use client";

// 내 경험 서랍(S-83) — 쌓인 블록(+출처 상태) · 분류 · 나를 보여 주는 역량(역량별 경험 수) 카드 세 장 + 활동 폴더(FE#365 · FE#368). 숫자는 모두 받은 활동 · 경험에서 센다(대회 규칙 1). AI 를 부르지 않는다
import { InfoTip } from "@/components/ui/info-tip";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, FoldersIcon } from "@phosphor-icons/react";
import { AddSourceButton, type AddSourceProps } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { fetchActivity } from "@/lib/api/experience";
import { ACTIVITY_CATEGORIES, COMPETENCIES, type ActivityDetail, type ActivitySummary, type Competency, type SourceStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CATEGORY_KEYS, CategoryIcon, categoryOf } from "./activity-category";
import { ExperienceBlocks, experienceYears } from "./experience-blocks";
import { PeriodLabel } from "./timeline";

type DetailState = { status: "loading" } | { status: "ready"; details: ActivityDetail[]; failed: number };

// 블록 색은 분류라서 출처 상태엔 색을 쓰지 않는다 — 「확인 필요」만 블록과 같은 점선 표시(FE#371)
const SOURCE: { value: SourceStatus; label: string }[] = [
  { value: "SOURCE_CONFIRMED", label: "원문 확인" },
  { value: "USER_ENTERED", label: "내가 입력" },
  { value: "NEEDS_REVIEW", label: "확인 필요" },
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
      <CenterState icon={<FoldersIcon />} title="아직 쌓인 경험이 없어요" body="자료를 넣으면 경험 하나가 블록 하나로 쌓이고, 여기서 연도 · 분류별로 한눈에 볼 수 있어요.">
        <AddSourceButton {...addSource} />
      </CenterState>
    );
  }

  const loadingDetails = state.status === "loading";
  // 출처 상태 줄 자리 — 글 한 줄 높이의 뼈대(FE#402). 역량 카드는 아래에서 칩 자리를 따로 그린다
  const detailNote = loadingDetails
    ? <div role="status" className="flex h-5 items-center"><span className="sr-only">경험 내용을 불러오고 있어요</span><Skeleton className="h-3.5 w-56 max-w-full" /></div>
    : state.failed > 0 && (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-note text-error">
        활동 {state.failed}개의 경험을 불러오지 못해 그만큼 빠져 있어요.
        <Button variant="secondary" size="sm" onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }}><ArrowsClockwiseIcon />다시 시도</Button>
      </div>
    );

  const missing = (Object.keys(COMPETENCIES) as Competency[]).filter((c) => !competencyCounts.has(c)).map((c) => COMPETENCIES[c]);

  return (
    <div className="@container mt-5 grid gap-10">
    {/* 폭은 화면이 아니라 이 자리 기준 — 활동 세부가 열려 좁아지면 쌓인 블록이 한 줄, 아래 두 장(FE#371) */}
    <section aria-label="쌓인 경험 요약" className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
      <Card className="@2xl:col-span-2 @5xl:col-span-1" title="쌓인 블록" info="활동 시작 연도별 경험 수예요. 블록 하나가 경험 하나이고, 점선은 확인이 필요한 경험이에요.">
        <ExperienceBlocks years={years} size="md" perColumn={8} className="min-h-20 flex-1 content-end" />
        <div className="mt-3">
          {detailNote || <>
            <ul aria-label="출처 상태별" className="m-0 flex list-none flex-wrap items-center gap-y-1 p-0 text-note text-muted">
              {bySource.map((s, i) => (
                <li key={s.value} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true" className="mx-2 h-3 w-px bg-hairline" />}
                  {s.value === "NEEDS_REVIEW" && <span aria-hidden="true" className="inline-block h-2 w-3.5 rounded-sm outline-1 outline-offset-1 outline-dashed outline-review-line" />}
                  {/* 확인 필요는 눌러서 그 경험이 있는 활동으로 — 따로 링크 줄을 두지 않아 카드가 낮다 */}
                  {s.value === "NEEDS_REVIEW" && reviewFirst && s.count > 0
                    ? <button type="button" onClick={() => onOpenActivity(reviewFirst.id)} title="확인할 경험 보기"
                      className="cursor-pointer underline-offset-3 hover:text-ink hover:underline">{s.label} <b className="font-semibold text-ink tabular-nums">{s.count}</b></button>
                    : <>{s.label} <b className="font-semibold text-ink tabular-nums">{s.count}</b></>}
                </li>
              ))}
            </ul>
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
        {loadingDetails ? <div aria-hidden="true" className="grid gap-2">
          <Skeleton className="h-3.5 w-20" />
          <div className="flex flex-wrap gap-2">{["w-24", "w-20", "w-28"].map(w => <Skeleton key={w} className={cn("h-8 rounded-full", w)} />)}</div>
        </div> : detailNote || <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="m-0 text-note text-muted">많이 해 본 역량</p>
            {byCompetency.length === 0 ? <p className="m-0 text-sm text-muted">아직 역량이 붙은 경험이 없어요.</p> : <CompetencyChips counts={byCompetency} />}
          </div>
          {missing.length > 0 && (
            <div className="grid gap-2">
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
    // items-center — 칩이 「+N」 버튼 높이로 늘어나지 않게(접어도 펼쳐도 같은 높이)
    <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {shown.map(([c, n], i) => (
        <li key={c} className={cn("rounded-full border px-3 py-1 text-sm", i < 3 ? "border-hairline text-ink" : "border-transparent bg-surface-soft text-body")}>
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
const SORTS: [Sort, string][] = [["latest", "최신순"], ["oldest", "오래된순"]];

/** 활동 폴더 — 활동 하나가 폴더 하나. 구역 이름은 「활동」만 — 앱 이름 「내 서랍」 · 탭 「서랍」과 겹치지 않게(FE#462 후속). 누르면 활동 세부(S-08). 시작을 모르는 활동은 순서와 상관없이 맨 뒤 */
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
        <h2 id="activity-drawer" className="m-0 text-base font-bold text-ink">활동 <span className="font-normal text-muted tabular-nums">{activities.length}</span></h2>
        {/* 칩 모양 고르기 — 다른 칩형 선택 메뉴와 같은 부품 */}
        <Select<Sort> variant="chip" aria-label="활동 정렬" value={sort} onChange={(next) => { if (next) setSort(next); }}
          options={SORTS.map(([value, label]) => ({ value, label }))} />
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-4 p-0 @xl:gap-x-5 @xl:gap-y-6 @3xl:grid-cols-3 @5xl:grid-cols-4">
        {sorted.map((a) => {
          const category = categoryOf(a) ?? undefined;
          return (
            <li key={a.id} data-category={category}>
              <button type="button" onClick={() => onOpenActivity(a.id)}
                className="group relative block w-full cursor-pointer pt-4 text-left">
                {/* 폴더 탭 */}
                <span aria-hidden="true" className="absolute top-0 left-0 h-8 w-2/5 rounded-t-md bg-category-soft [clip-path:polygon(0_0,72%_0,100%_100%,0_100%)]" />
                {/* 마우스를 올리면 폴더가 살짝 열린다 — 뒤판 · 빈 종이 · 앞판. 앞판은 아래 끝을 고정하고 위쪽만 앞으로 기울며 조금 넓어지고 내려온다.
                    종이는 위로 올라오지 않고 뒤판 안에서만 보여 바탕(흰색)과 섞이지 않는다.
                    앞판은 네 모서리가 다 둥글고, 왼쪽 위 빈틈은 뒤판(모서리 없음)이 메운다. 「움직임 줄이기」에선 움직이지 않는다(motion-safe) */}
                <span className="relative block">
                  <span aria-hidden="true" className="absolute inset-0 rounded-md rounded-tl-none bg-category-soft" />
                  <span aria-hidden="true" className="absolute inset-x-4 top-0.5 h-6 rounded-sm bg-canvas opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out group-hover:opacity-100" />
                  <span className="relative flex aspect-[5/3] min-h-28 origin-bottom flex-col rounded-md bg-category-soft p-4 @xl:p-5 motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:ease-out group-hover:shadow-mode group-hover:[transform:perspective(900px)_rotateX(-8deg)_scaleY(0.92)] group-focus-visible:outline-2 group-focus-visible:outline-ink">
                    <span className="truncate text-sm font-bold text-ink @xl:text-base">{a.name}</span>
                    <span className="mt-1 text-xs text-category-ink tabular-nums @xl:text-sm">경험 {a.experienceCount}</span>
                    <span className="mt-auto pt-4 text-xs text-body tabular-nums sm:pt-6 @xl:text-sm"><PeriodLabel period={a.period} /></span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Card({ title, info, aside, className, children }: { title: string; info?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className={cn("flex min-w-0 flex-col rounded-md border border-hairline bg-canvas p-4.5 lg:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
    <ul className="m-0 grid list-none gap-3 p-0">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <span className="flex items-baseline justify-between gap-2 text-sm text-body">
            {r.label}
            <span className="shrink-0 text-muted tabular-nums" title={total > 0 ? `${Math.round((r.count / total) * 100)}%` : undefined}>{r.count}개</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-soft" aria-hidden="true">
            {r.count > 0 && total > 0 && <span className="block h-full" style={{ width: `${(r.count / total) * 100}%` }}>{r.bar}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
