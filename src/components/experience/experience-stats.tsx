"use client";

// 내 경험 통계(S-83) — 쌓인 블록(+출처 상태) · 분류 · 역량 제안(역량별 경험 수). 카드 세 장 한 줄(FE#365). 숫자는 모두 받은 활동 · 경험에서 센다(대회 규칙 1). AI 를 부르지 않는다
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

  const top = byCompetency.slice(0, 3);
  const rest = byCompetency.slice(3);
  const missing = (Object.keys(COMPETENCIES) as Competency[]).filter((c) => !competencyCounts.has(c)).map((c) => COMPETENCIES[c]);

  return (
    <section aria-label="내 경험 통계" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

      <Card title="역량 제안" info={<>경험에 붙은 역량을 많은 순으로 셌어요. 역량은 AI 해석이 섞여 있고, 경험 하나에 여러 개 붙을 수 있어요.</>}>
        {detailNote || <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="m-0 text-note text-muted">내세우기 좋은 역량</p>
            {top.length === 0 ? <p className="m-0 text-sm text-muted">아직 역량이 붙은 경험이 없어요.</p> : <>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {top.map(([c, n]) => (
                  <li key={c} className="rounded-full border border-hairline px-3.5 py-1.5 text-sm text-ink">{COMPETENCIES[c]} <b className="font-bold tabular-nums">{n}</b></li>
                ))}
              </ul>
              {(rest.length > 0 || noCompetency > 0) && (
                <p className="m-0 text-note text-muted tabular-nums">
                  {rest.length > 0 && <>그 밖에 {rest.map(([c, n]) => `${COMPETENCIES[c]} ${n}`).join(" · ")}</>}
                  {rest.length > 0 && noCompetency > 0 && " · "}
                  {noCompetency > 0 && `역량 없는 경험 ${noCompetency}개`}
                </p>
              )}
            </>}
          </div>
          {missing.length > 0 && (
            <div className="grid gap-2">
              <p className="m-0 text-note text-muted">아직 경험이 없는 역량</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p title={missing.join(" · ")} className="m-0 line-clamp-2 min-w-0 flex-1 basis-40 text-sm text-body">{missing.join(" · ")}</p>
                <AddSourceButton {...addSource} className="shrink-0" />
              </div>
            </div>
          )}
        </div>}
      </Card>
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
