"use client";

import Link from "next/link";
import { Popover } from "radix-ui";
import { ClockCounterClockwiseIcon, FileTextIcon, StackIcon } from "@phosphor-icons/react";
import { Mascot } from "@/components/questions/chagok-panel";
import { Button } from "@/components/ui/button";
import { thisTimeLastYear } from "@/lib/home-overview";
import { periodText } from "@/lib/period";
import type { HomeOverview } from "./use-home-overview";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/sidebar-layout";

export function HomeMascot({ overview, onRefresh }: { overview: HomeOverview; onRefresh: () => void }) {
  const { desktop } = useSidebar();
  const total = overview.activities?.reduce((n, a) => n + a.experienceCount, 0);
  const review = overview.details?.flatMap(a => a.experiences.filter(e => e.sourceStatus === "NEEDS_REVIEW").map(e => ({ activityId: a.id, experience: e })));
  const years = new Map<string, { id: number; name: string; count: number }[]>();
  overview.activities?.forEach(a => {
    const year = a.period.start?.slice(0, 4) ?? "기간 모름";
    years.set(year, [...(years.get(year) ?? []), { id: a.id, name: a.name, count: a.experienceCount }]);
  });
  return <>
    <Popover.Root>
      <Popover.Trigger asChild><button type="button" aria-label="차곡이 — 쌓인 경험 보기" className="rounded-md p-1.5 transition-transform hover:-translate-y-0.5 hover:-rotate-3 hover:bg-surface-soft"><Mascot size={68} /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content side={desktop ? "right" : "bottom"} align="center" sideOffset={12} collisionPadding={16} aria-label="쌓인 블록" className="z-40 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-hairline bg-canvas p-4 text-ink shadow-float">
        {overview.activityError ? <p className="m-0 text-sm text-error">{overview.activityError} <Button variant="link" onClick={onRefresh}>다시 시도</Button></p>
          : total === undefined ? <p role="status" className="m-0 text-sm text-muted">경험을 불러오고 있어요…</p>
          : <Link href="/experience" className="flex items-end gap-3" aria-label={`쌓인 경험 ${total}개 — 내 경험 보기`}>
            <span className="flex max-h-52 min-h-16 min-w-0 flex-1 items-end gap-3 overflow-auto py-1">
              {[...years].sort(([a], [b]) => a.localeCompare(b)).map(([year, activities], index) => <span key={year} className="flex shrink-0 flex-col items-center gap-1.5">
                <span className="flex min-h-8 flex-col-reverse gap-0.5" aria-label={`${year} 경험 ${activities.reduce((n, a) => n + a.count, 0)}개`}>
                  {activities.flatMap(a => Array.from({ length: a.count }, (_, i) => {
                    const experience = overview.details?.find(d => d.id === a.id)?.experiences[i];
                    return <i key={`${a.id}-${i}`} title={experience?.content ?? `${a.name}의 경험`} className={cn("block h-1.5 w-5 rounded-sm even:translate-x-0.5", ["bg-mark", "bg-record-green", "bg-record-pink"][index % 3], experience?.sourceStatus === "NEEDS_REVIEW" && "outline-1 outline-offset-1 outline-dashed outline-review-line")} />;
                  }))}
                </span>
                <small className="text-xs text-muted">{year}</small>
              </span>)}
            </span>
            <span className="shrink-0 self-center text-right text-xs leading-relaxed text-muted"><b className="text-2xl text-ink">{total}</b>개의 경험이<br />차곡차곡</span>
          </Link>}
        {total === 0 && <p className="mt-2 mb-0 text-note text-muted">자료를 넣으면 경험 하나가 블록 하나로 쌓여요.</p>}
        <p className="mt-3 mb-0 text-note leading-relaxed text-muted">활동 시작 연도별 경험 수예요. 점선은 확인이 필요한 경험이에요.</p>
        {overview.detailError && <p className="mt-2 mb-0 text-note text-error">{overview.detailError} <Button variant="link" onClick={onRefresh}>다시 시도</Button></p>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <h1 className="m-0 text-hero-sm leading-snug font-bold tracking-[-1px] lg:text-hero">어떤 경험을 꺼내볼까요?</h1>
    <div className="text-sm text-muted">
      {overview.activityError ? <span>{overview.activityError} <Button variant="link" onClick={onRefresh}>다시 시도</Button></span>
        : total === undefined ? "쌓인 경험을 불러오고 있어요…"
        : <>경험 {total}개가 쌓여 있어요{review && !overview.detailError && <> · <Link href={review.length ? `/experience?activity=${review[0].activityId}` : "/experience"} title="확인할 경험 보기" className="underline-offset-4 hover:underline">확인할 것 {review.length}</Link></>}</>}
    </div>
  </>;
}

export function ContinueCards({ overview, onRefresh, onNewApplication }: { overview: HomeOverview; onRefresh: () => void; onNewApplication: () => void }) {
  const recent = overview.applications?.filter(a => a.questions.length).toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)[0];
  const last = overview.activities?.find(a => a.id === overview.lastViewedId);
  const past = overview.now && overview.details && !overview.detailError ? thisTimeLastYear(overview.details, overview.now) : null;
  const card = "group flex min-w-0 flex-col items-start gap-1.5 rounded-md border border-hairline bg-canvas/80 px-4.5 py-4 text-left transition-colors hover:border-muted-soft";
  return <section aria-label="이어서" className="mx-auto mt-12 max-w-[980px] lg:mt-[7vh]">
    <h2 className="mt-0 mb-3 text-note font-semibold text-muted">이어서</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      {overview.applicationError ? <div className={card}><FileTextIcon className="size-6 text-record-pink" /><span className="text-note text-error">{overview.applicationError}</span><Button variant="link" onClick={onRefresh}>다시 시도</Button></div>
        : overview.applications === null ? <div role="status" className={card}><span className="text-sm text-muted">최근 지원을 불러오고 있어요…</span></div>
        : recent ? <Link href={`/questions?question=${recent.questions[0].id}`} className={card}><FileTextIcon className="size-6 text-record-pink" /><span className="text-xs text-muted">최근 지원</span><b className="text-sm leading-relaxed font-semibold">{recent.organization || "지원처 이름 없음"}</b><small className="text-xs text-muted">문항 {recent.questions.length}개 · 분석 중 {recent.questions.filter(q => q.status === "ANALYZING").length}개</small></Link>
        : <button type="button" className={card} onClick={onNewApplication}><FileTextIcon className="size-6 text-record-pink" /><span className="text-xs text-muted">지원 시작하기</span><b className="text-sm leading-relaxed font-semibold">지원 문항을 붙여 넣어 보세요</b><small className="text-note text-muted">어떤 경험을 꺼내 쓸지 찾아요</small></button>}
      <Link href={last ? `/experience?activity=${last.id}` : "/experience"} className={card}><StackIcon className="size-6 text-record-green" /><span className="text-xs text-muted">{last ? "마지막으로 연 활동" : "내 경험 이어 보기"}</span><b className="text-sm leading-relaxed font-semibold">{last?.name ?? "쌓인 경험을 둘러보세요"}</b><small className={cn(last ? "text-xs" : "text-note", "text-muted")}>{last ? `경험 ${last.experienceCount}개 · ${periodText(last.period)}` : "활동과 그 안에서 한 일을 한눈에"}</small></Link>
      {overview.detailError || overview.activityError ? <div className={card}><ClockCounterClockwiseIcon className="size-6 text-mark" /><span className="text-note text-error">지난 경험을 불러오지 못했어요.</span><Button variant="link" onClick={onRefresh}>다시 시도</Button></div>
        : <Link href={past ? `/experience?activity=${past.id}` : "/experience"} className={card}><ClockCounterClockwiseIcon className="size-6 text-mark" /><span className="text-xs text-muted">1년 전 이맘때</span><b className="line-clamp-2 text-sm leading-relaxed font-semibold">{past?.experiences[0].content ?? (overview.details === null ? "지난 경험을 불러오고 있어요…" : "그때의 경험을 돌아보세요")}</b><small className={cn(past ? "text-xs" : "text-note", "text-muted")}>{past ? `${past.name} · ${periodText(past.period)}` : "같은 달의 활동이 없으면 내 경험에서 찾아보세요"}</small></Link>}
    </div>
  </section>;
}
