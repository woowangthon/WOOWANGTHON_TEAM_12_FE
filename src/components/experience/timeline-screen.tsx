"use client";

// 첫 화면 — 연도별 타임라인 + 활동 세부 (SPEC F-03) · 자료 넣기 + 분석 상태 (F-01)
// PC 는 타임라인 옆 패널, 모바일은 목록 → 전체 화면 세부
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowsClockwiseIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AddSourceButton, AppHeader, type AddSourceProps } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { AnalysisBanner, AnalysisCenter, analysisView } from "@/components/source/analysis-status";
import { useAnalysisJob } from "@/components/source/use-analysis-job";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchActivities, fetchActivity, isMockMode, type MockAnalysis, type MockMode } from "@/lib/api/experience";
import type { ActivitySummary, Experience } from "@/lib/api/types";
import { monthNumber, spanOf, yearsOf, type Span } from "@/lib/period";
import { ActivityDetailView, type DetailState } from "./activity-detail";
import { Timeline } from "./timeline";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activities: ActivitySummary[]; now: number };

function toMockMode(value: string | null): MockMode {
  return value === "empty" || value === "error" ? value : null;
}
function toMockAnalysis(value: string | null): MockAnalysis {
  return value === "fail" || value === "empty" ? value : null;
}

export function TimelineScreen() {
  const params = useSearchParams();
  const mock = toMockMode(params.get("mock"));
  const mockAnalysis = toMockAnalysis(params.get("analysis"));
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const listScrollY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadList = (mode: MockMode) => {
    const request = ++listRequest.current;
    return fetchActivities(mode).then(
      (activities) => request === listRequest.current && setList({ status: "ready", activities, now: monthNumber(new Date()) }),
      (e: Error) => request === listRequest.current && setList({ status: "error", message: e.message }),
    );
  };

  useEffect(() => {
    loadList(mock);
  }, [mock]);

  const showToast = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const analysis = useAnalysisJob((job) => {
    if (!job.activityIds.length) return; // 활동 0개는 상태 화면 · 띠로 알린다
    if (isMockMode()) loadList(mock);
    showToast(`목 분석 결과 활동 ${job.activityIds.length}개예요. 서버에 저장된 결과가 아니에요.`);
  });
  const view = analysisView(analysis.tracked);

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
    ++detailRequest.current;
    setSelectedId(null);
    requestAnimationFrame(() => window.scrollTo(0, listScrollY.current));
  };

  const activitySaved = (activity: ActivitySummary) => {
    ++listRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === activity.id ? activity : a) } : prev);
    setDetail((prev) => prev.status === "ready" && prev.activity.id === activity.id ? { ...prev, activity: { ...prev.activity, name: activity.name, period: activity.period } } : prev);
  };

  const experienceSaved = (experience: Experience) => {
    setDetail((prev) => prev.status === "ready" && prev.activity.id === experience.activityId ? { ...prev, activity: { ...prev.activity, experiences: prev.activity.experiences.map((e) => e.id === experience.id ? experience : e) } } : prev);
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
  const addSource: AddSourceProps = { onClick: () => setAddOpen(true), busy: view === "analyzing" };
  const analysisActions = {
    onRetry: analysis.retry,
    onRecheck: analysis.recheck,
    onDismiss: analysis.dismiss,
    onAddSource: () => {
      analysis.dismiss();
      setAddOpen(true);
    },
  };

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas lg:h-dvh">
      <AppHeader className={cn(selected && "hidden lg:flex")} addSource={addSource} />
      <p className="m-0 border-b border-hairline px-4 py-2 text-xs text-muted" role="note">
        {isMockMode() ? "목 모드 · 예시 데이터이며 서버에 저장할 수 없어요." : "실제 API 모드 · 활동과 경험 수정은 서버에 저장해요."}
        {" 자료 넣기·분석은 BE #5 연동 전까지 목 기능이에요."}
      </p>
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
              body={list.message}
            >
              <Button onClick={() => loadList(mock)}>
                <ArrowsClockwiseIcon />
                다시 시도
              </Button>
            </CenterState>
          )}
          {ready && !hasActivities &&
            (view && analysis.tracked ? (
              <AnalysisCenter view={view} tracked={analysis.tracked} {...analysisActions} />
            ) : (
              <EmptyState addSource={addSource} />
            ))}
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
              {view && analysis.tracked && (
                <AnalysisBanner view={view} tracked={analysis.tracked} {...analysisActions} />
              )}
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
              onActivitySaved={activitySaved}
              onExperienceSaved={experienceSaved}
            />
          </aside>
        )}
      </div>

      {/* 모바일 — 「자료 넣기」는 오른쪽 아래 떠 있는 버튼 */}
      {hasActivities && !selected && (
        <AddSourceButton
          {...addSource}
          className="fixed right-4 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] rounded-full shadow-float lg:hidden"
        />
      )}

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mock={mockAnalysis}
        onSubmitted={(pending) => analysis.start(pending)}
      />

      {/* 알림 — ink 면 · 흰 글 (DESIGN.md 「떠 있는 것」) */}
      {toast && (
        <div
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-sm bg-ink px-4 py-3 text-sm text-canvas shadow-float lg:bottom-6"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** 활동이 하나도 없을 때 — 「자료 넣기」로 이끈다 */
function EmptyState({ addSource }: { addSource: AddSourceProps }) {
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
      <AddSourceButton {...addSource} />
      <p className="m-0 text-[13px] text-muted">한 번에 다 넣지 않아도 돼요. 생각날 때 하나씩 넣으면 쌓여요.</p>
    </CenterState>
  );
}
