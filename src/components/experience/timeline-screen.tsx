"use client";

// 첫 화면 — 연도별 타임라인 + 활동 세부 (SPEC F-03). PC 는 타임라인 옆 패널, 모바일은 목록 → 전체 화면 세부
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowsClockwiseIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AddSourceButton, AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchActivities, fetchActivity, type MockMode } from "@/lib/api/experience";
import type { ActivitySummary } from "@/lib/api/types";
import { monthNumber, spanOf, yearsOf, type Span } from "@/lib/period";
import { ActivityDetailView, type DetailState } from "./activity-detail";
import { Timeline } from "./timeline";

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; activities: ActivitySummary[]; now: number };

function toMockMode(value: string | null): MockMode {
  return value === "empty" || value === "error" ? value : null;
}

export function TimelineScreen() {
  const mock = toMockMode(useSearchParams().get("mock"));
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const detailRequest = useRef(0);
  const listScrollY = useRef(0);

  const loadList = (mode: MockMode) =>
    fetchActivities(mode).then(
      (activities) => setList({ status: "ready", activities, now: monthNumber(new Date()) }),
      () => setList({ status: "error" }),
    );

  useEffect(() => {
    loadList(mock);
  }, [mock]);

  const loadDetail = (id: number) => {
    const request = ++detailRequest.current;
    setDetail({ status: "loading" });
    fetchActivity(id).then(
      (activity) => request === detailRequest.current && setDetail({ status: "ready", activity }),
      (e: Error) => request === detailRequest.current && setDetail({ status: "error", message: e.message }),
    );
  };

  const select = (id: number) => {
    if (selectedId == null) listScrollY.current = window.scrollY;
    setSelectedId(id);
    loadDetail(id);
    window.scrollTo(0, 0); // 모바일 — 세부는 전체 화면이라 맨 위부터
  };

  const close = () => {
    setSelectedId(null);
    requestAnimationFrame(() => window.scrollTo(0, listScrollY.current));
  };

  const ready = list.status === "ready" ? list : null;
  const timeline = useMemo(() => {
    if (!ready) return null;
    const spans = new Map<number, Span>();
    for (const a of ready.activities) {
      const s = spanOf(a.period, ready.now);
      if (s) spans.set(a.id, s);
    }
    return { spans, years: yearsOf([...spans.values()]) };
  }, [ready]);

  const selected = ready?.activities.find((a) => a.id === selectedId) ?? null;
  const hasActivities = !!ready && ready.activities.length > 0;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas lg:h-dvh">
      <AppHeader className={cn(selected && "hidden lg:flex")} />
      <div className={cn("flex-1 lg:grid lg:min-h-0", selected && "lg:grid-cols-[minmax(0,1fr)_440px]")}>
        <main
          className={cn(
            "min-w-0 px-4.5 pt-4.5 pb-24 lg:overflow-auto lg:px-8 lg:pt-8 lg:pb-16",
            selected && "hidden lg:block",
          )}
        >
          {list.status === "loading" && <p className="py-10 text-center text-sm text-muted">타임라인을 불러오고 있어요…</p>}
          {list.status === "error" && (
            <CenterState
              icon={<WarningCircleIcon className="text-error" />}
              title="타임라인을 불러오지 못했어요"
              body="넣어 둔 자료와 경험은 그대로 있어요. 잠시 뒤 다시 시도해 주세요."
            >
              <Button onClick={() => loadList(mock)}>
                <ArrowsClockwiseIcon />
                다시 시도
              </Button>
            </CenterState>
          )}
          {ready && !hasActivities && <EmptyState />}
          {ready && timeline && hasActivities && (
            <>
              <div className="flex items-baseline gap-3">
                <h1 className="m-0 text-2xl font-bold tracking-[-0.4px] lg:text-[26px]">내 경험</h1>
                <span className="text-sm text-muted tabular-nums">
                  활동 {ready.activities.length}
                  <span className="hidden lg:inline">
                    {" "}
                    · 경험 {ready.activities.reduce((n, a) => n + a.experienceCount, 0)}
                  </span>
                </span>
              </div>
              <Timeline
                activities={ready.activities}
                spans={timeline.spans}
                years={timeline.years}
                selectedId={selectedId}
                onSelect={select}
              />
            </>
          )}
        </main>

        {selected && ready && (
          <aside
            className="min-h-dvh min-w-0 bg-canvas lg:min-h-0 lg:overflow-auto lg:border-l lg:border-hairline"
            aria-label="활동 세부"
          >
            <ActivityDetailView
              key={selected.id}
              summary={selected}
              state={detail}
              now={ready.now}
              onClose={close}
              onRetry={() => loadDetail(selected.id)}
            />
          </aside>
        )}
      </div>

      {/* 모바일 — 「자료 넣기」는 오른쪽 아래 떠 있는 버튼 */}
      {hasActivities && !selected && (
        <AddSourceButton className="fixed right-4 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] rounded-full shadow-float lg:hidden" />
      )}
    </div>
  );
}

/** 가운데 정렬 덩어리 하나, 아이콘은 하나만 (DESIGN.md 「상태 화면」) */
function CenterState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-2 py-16 lg:py-24">
      <div className="grid w-full max-w-[480px] justify-items-center gap-3.5 text-center">
        <span className="text-[34px] text-ink [&_svg]:size-[1em]">{icon}</span>
        <h2 className="m-0 text-[21px] leading-snug font-[650] tracking-[-0.3px] text-balance">{title}</h2>
        <p className="m-0 text-[15px] text-body">{body}</p>
        {children}
      </div>
    </div>
  );
}

/** 활동이 하나도 없을 때 — 「자료 넣기」로 이끈다 */
function EmptyState() {
  return (
    <CenterState
      icon={<PlusIcon />}
      title="어떤 일을 해 왔나요?"
      body="프로젝트 README · 회고 · 활동 정리 노트를 그대로 넣어 주세요. 활동과 그 안에서 한 일을 찾아 연도별로 정리해 둘게요."
    >
      <div className="flex flex-wrap justify-center gap-1.5">
        {["README.md", "프로젝트 회고", "노션에서 복사한 활동 목록", ".md · .txt · 붙여넣기"].map((t) => (
          <span key={t} className="rounded-full border border-hairline px-2.5 py-0.5 text-[13px] text-muted">
            {t}
          </span>
        ))}
      </div>
      <AddSourceButton />
      <p className="m-0 text-[13px] text-muted">한 번에 다 넣지 않아도 돼요. 생각날 때 하나씩 넣으면 쌓여요.</p>
    </CenterState>
  );
}
