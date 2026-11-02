"use client";

// 첫 화면 — 연도별 타임라인 + 활동 세부 (SPEC F-03). PC 는 타임라인 옆 패널, 모바일은 목록 → 전체 화면 세부
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { FileTextIcon, PlusIcon, RotateCwIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchActivities, fetchActivity, type MockMode } from "@/lib/api/experience";
import type { ActivitySummary } from "@/lib/api/types";
import { monthNumber, spanOf, yearsOf, type Span } from "@/lib/period";
import { ActivityDetailView, type DetailState } from "./activity-detail";
import { TimelineDesktop } from "./timeline-desktop";
import { TimelineMobile } from "./timeline-mobile";

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

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:h-dvh">
      <AppHeader className={cn(selected && "hidden lg:flex")} />
      <div className={cn("flex-1 lg:grid lg:min-h-0", selected && "lg:grid-cols-[minmax(0,1fr)_420px]")}>
        <main className={cn("min-w-0 px-4 pt-4 pb-16 lg:overflow-auto lg:px-7 lg:pt-6 lg:pb-10", selected && "hidden lg:block")}>
          {list.status === "loading" && <p className="py-10 text-center text-sm text-ink-3">타임라인을 불러오고 있어요…</p>}
          {list.status === "error" && (
            <CenterCard
              title="타임라인을 불러오지 못했어요"
              body="잠시 뒤 다시 시도해 주세요. 넣어 둔 자료와 경험은 그대로 있어요."
              action={
                <Button size="lg" onClick={() => loadList(mock)} className="px-3.5 font-semibold">
                  <RotateCwIcon />
                  다시 시도
                </Button>
              }
            />
          )}
          {ready && ready.activities.length === 0 && <EmptyState />}
          {ready && timeline && ready.activities.length > 0 && (
            <>
              <div className="mb-3 flex items-baseline gap-2 lg:mb-4.5 lg:items-end lg:gap-4">
                <h1 className="m-0 text-[19px] leading-snug font-bold lg:text-[22px]">내 경험</h1>
                <span className="text-[13px] text-ink-3 lg:text-sm">
                  활동 {ready.activities.length}
                  <span className="hidden lg:inline">
                    {" "}
                    · 경험 {ready.activities.reduce((n, a) => n + a.experienceCount, 0)}
                  </span>
                </span>
                <Legend />
              </div>
              <div className="hidden lg:block">
                <TimelineDesktop
                  activities={ready.activities}
                  spans={timeline.spans}
                  years={timeline.years}
                  now={ready.now}
                  selectedId={selectedId}
                  onSelect={select}
                />
              </div>
              <div className="lg:hidden">
                <TimelineMobile
                  activities={ready.activities}
                  spans={timeline.spans}
                  years={timeline.years}
                  selectedId={selectedId}
                  onSelect={select}
                />
              </div>
            </>
          )}
        </main>

        {selected && ready && (
          <aside className="min-h-dvh min-w-0 bg-surface lg:min-h-0 lg:overflow-auto lg:border-l lg:border-line" aria-label="활동 세부">
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
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto hidden gap-3.5 text-xs text-ink-3 lg:flex">
      <span className="inline-flex items-center gap-1.5">
        <i className="h-2.5 w-5.5 rounded-[3px] border border-leaf bg-leaf-soft" />
        기간
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i
          className="h-2.5 w-5.5 rounded-[3px] border border-leaf"
          style={{ background: "repeating-linear-gradient(135deg, var(--leaf-soft) 0 4px, var(--surface) 4px 8px)" }}
        />
        진행 중
      </span>
    </div>
  );
}

function CenterCard({
  title,
  body,
  action,
  children,
}: {
  title: string;
  body: string;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid place-items-center py-6 lg:py-16">
      <div className="grid w-full max-w-[520px] justify-items-start gap-3.5 rounded-2xl border border-line bg-surface p-6 shadow-card lg:p-8">
        <div className="grid size-11 place-items-center rounded-xl bg-leaf-soft text-xl text-leaf-ink">
          <FileTextIcon aria-hidden="true" />
        </div>
        <h2 className="m-0 text-xl leading-snug font-bold text-balance lg:text-[22px]">{title}</h2>
        <p className="m-0 text-sm text-ink-2">{body}</p>
        {children}
        {action}
      </div>
    </div>
  );
}

/** 활동이 하나도 없을 때 — 「자료 넣기」로 이끈다 */
function EmptyState() {
  return (
    <CenterCard
      title="어떤 일을 해 왔나요?"
      body="프로젝트 README · 회고 · 활동 정리 노트를 그대로 넣어 주세요. 활동과 그 안에서 한 일을 찾아 연도별로 놓고, 어느 문장에서 찾았는지도 함께 붙여 둘게요."
      action={
        <>
          {/* 자료 넣기는 FE#6 에서 붙인다 */}
          <Button size="lg" disabled title="자료 넣기는 다음 작업(FE#6)에서 열려요" className="px-3.5 font-semibold">
            <PlusIcon />
            자료 넣기
          </Button>
          <p className="m-0 text-[13px] text-ink-3">한 번에 다 넣지 않아도 돼요. 생각날 때 하나씩 넣으면 타임라인에 쌓여요.</p>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {["README.md", "프로젝트 회고", "노션에서 복사한 활동 목록", ".md · .txt 또는 붙여넣기"].map((t) => (
          <span key={t} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs text-ink-2">
            {t}
          </span>
        ))}
      </div>
    </CenterCard>
  );
}
