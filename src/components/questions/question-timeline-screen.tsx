"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ActivityDetailView } from "@/components/experience/activity-detail";
import { Timeline } from "@/components/experience/timeline";
import { questionMockActivities } from "@/lib/mock/questions";
import { monthNumber, spanOf, yearsOf, type Span } from "@/lib/period";
import { cn } from "@/lib/utils";

const ignore = () => {};

/** 문항 예시에서 연 활동도 같은 타임라인·세부를 쓴다. 실제 API·분석 hook은 마운트하지 않는다. */
export function QuestionTimelineScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const activities = useMemo(() => questionMockActivities(), []);
  const selected = activities.find(a => a.id === Number(params.get("activity")));
  const now = monthNumber(new Date());
  const summaries = activities.map(({ experiences, ...a }) => ({ ...a, experienceCount: experiences.length }));
  const spans = new Map<number, Span>();
  for (const a of summaries) { const span = spanOf(a.period, now); if (span) spans.set(a.id, span); }
  const navigate = (id?: number) => {
    const next = new URLSearchParams({ questionMock: "1" });
    if (id !== undefined) next.set("activity", String(id));
    const from = params.get("fromQuestion");
    if (from) next.set("fromQuestion", from);
    router.replace(`/?${next.toString()}`);
    window.scrollTo(0, 0);
  };

  return <div className="flex min-h-dvh flex-1 flex-col bg-canvas lg:h-dvh">
    <AppHeader hideOnMobile={!!selected} timelineHref="/?questionMock=1" />
    <div role="note" className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4.5 py-2 text-xs text-muted lg:px-7">
      <span>문항 목 예시의 타임라인 · 읽기 전용이며 실제 기록을 불러오거나 바꾸지 않아요.</span>
      <Link href="/questions" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">문항 결과로 돌아가기</Link>
    </div>
    <div className={cn("flex-1 lg:grid lg:min-h-0", selected && "lg:grid-cols-[minmax(0,1fr)_440px]")}>
      <main className={cn("min-w-0 px-4.5 py-6 lg:overflow-auto lg:px-8 lg:py-8", selected && "hidden lg:block")}>
        <h1 className="m-0 text-[26px] font-bold tracking-[-0.4px]">내 경험</h1>
        <Timeline activities={summaries} spans={spans} years={yearsOf([...spans.values()])} selectedId={selected?.id ?? null}
          onSelect={navigate} dragging={null} onDropExperience={ignore} onPeriodChange={ignore} readOnly />
      </main>
      {selected && <aside aria-label="활동 세부" className="min-h-dvh min-w-0 bg-canvas lg:min-h-0 lg:overflow-auto lg:border-l lg:border-hairline">
        <ActivityDetailView key={selected.id} summary={{ ...selected, experienceCount: selected.experiences.length }} state={{ status: "ready", activity: selected }} now={now}
          readOnly onClose={() => navigate()} onRetry={ignore} onActivitySaved={ignore} onExperienceSaved={ignore}
          onExperienceAdded={ignore} onExperienceDelete={ignore} onExperienceMove={ignore} onDragChange={ignore} draggingId={null} />
      </aside>}
    </div>
  </div>;
}
