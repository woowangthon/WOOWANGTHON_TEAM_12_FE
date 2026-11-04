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
import { fetchActivities, fetchActivity, isMockMode, mergeActivities, moveExperience, updateActivity, type MockAnalysis, type MockMode } from "@/lib/api/experience";
import type { ActivitySummary, Experience, Period } from "@/lib/api/types";
import { monthNumber, periodText, spanOf, yearsOf, type Span } from "@/lib/period";
import { ActivityDetailView, type DetailState } from "./activity-detail";
import { MergeActivityDialog, MoveExperienceDialog } from "./regroup-dialogs";
import { Timeline } from "./timeline";
import { useExperienceDeletion } from "./use-experience-deletion";
import { QuestionTimelineScreen } from "@/components/questions/question-timeline-screen";

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
  // 문항 목에서 이동한 경우 실제 API·진행 중인 자료 분석을 호출하지 않는다.
  return params.get("questionMock") === "1" ? <QuestionTimelineScreen /> : <TimelineWorkspace />;
}

function TimelineWorkspace() {
  const params = useSearchParams();
  const mock = toMockMode(params.get("mock"));
  const mockAnalysis = toMockAnalysis(params.get("analysis"));
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; alert: boolean } | null>(null);
  const [dragging, setDragging] = useState<Experience | null>(null);
  const [moving, setMoving] = useState<Experience | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const selectedRef = useRef<number | null>(null);
  const listScrollY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadList = (mode: MockMode) => {
    const request = ++listRequest.current;
    return fetchActivities(mode).then(
      (activities) => {
        if (request !== listRequest.current) return null;
        setList({ status: "ready", activities, now: monthNumber(new Date()) });
        return activities;
      },
      (e: Error) => {
        if (request === listRequest.current) setList({ status: "error", message: e.message });
        return null;
      },
    );
  };

  useEffect(() => {
    loadList(mock);
  }, [mock]);

  const showToast = (text: string, alert = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, alert });
    toastTimer.current = setTimeout(() => setToast(null), alert ? 7000 : 4000);
  };

  const loadDetail = (id: number) => {
    const request = ++detailRequest.current;
    setDetail({ status: "loading" });
    fetchActivity(id).then(
      (activity) => request === detailRequest.current && setDetail({ status: "ready", activity }),
      (e: Error) => request === detailRequest.current && setDetail({ status: "error", message: e.message }),
    );
  };

  const analysis = useAnalysisJob(async (job) => {
    const activities = await loadList(mock);
    if (!activities) {
      showToast("분석은 완료됐지만 활동을 불러오지 못했어요. 다시 시도해 주세요.");
      return;
    }
    const current = activities.find((a) => a.id === selectedRef.current);
    const next = current?.id ?? (isMockMode() ? undefined : job.activityIds.find((id) => activities.some((a) => a.id === id)));
    if (next != null) {
      selectedRef.current = next;
      setSelectedId(next);
      loadDetail(next);
    }
    // 활동 0개는 기존의 빈 결과 화면 · 띠로 알린다.
    if (job.activityIds.length) showToast(isMockMode()
      ? `목 분석 결과 활동 ${job.activityIds.length}개예요. 서버에 저장된 결과가 아니에요.`
      : `분석이 완료됐어요. 활동 ${job.activityIds.length}개를 확인해 보세요.`);
  });
  const view = analysisView(analysis.tracked);

  const select = (id: number) => {
    selectedRef.current = id;
    if (selectedId == null) listScrollY.current = window.scrollY;
    setSelectedId(id);
    loadDetail(id);
    window.scrollTo(0, 0); // 모바일 — 세부는 전체 화면이라 맨 위부터
  };

  const close = () => {
    selectedRef.current = null;
    ++detailRequest.current;
    setSelectedId(null);
    requestAnimationFrame(() => window.scrollTo(0, listScrollY.current));
  };

  const activitySaved = (activity: ActivitySummary) => {
    ++listRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === activity.id ? activity : a) } : prev);
    setDetail((prev) => prev.status === "ready" && prev.activity.id === activity.id ? { ...prev, activity: { ...prev.activity, name: activity.name, period: activity.period } } : prev);
  };

  /** 타임라인 띠 끝을 끌어 기간 바꾸기(S-17) — 바로 반영하고, 실패하면 원래 기간으로 돌린 뒤 알린다 */
  const periodDragged = (activity: ActivitySummary, period: Period) => {
    const apply = (p: Period) => {
      ++listRequest.current;
      setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === activity.id ? { ...a, period: p } : a) } : prev);
      setDetail((prev) => prev.status === "ready" && prev.activity.id === activity.id ? { ...prev, activity: { ...prev.activity, period: p } } : prev);
    };
    apply(period);
    updateActivity(activity.id, { period }).then(
      (saved) => {
        activitySaved(saved);
        showToast(`「${saved.name}」 기간을 ${periodText(saved.period)}(으)로 바꿨어요.`);
      },
      (e: Error) => {
        apply(activity.period);
        showToast(`기간을 바꾸지 못해서 원래대로 돌려 놨어요. ${e.message}`, true);
      },
    );
  };

  const experienceSaved = (experience: Experience) => {
    setDetail((prev) => prev.status === "ready" && prev.activity.id === experience.activityId ? { ...prev, activity: { ...prev.activity, experiences: prev.activity.experiences.map((e) => e.id === experience.id ? experience : e) } } : prev);
  };

  const experienceAdded = (experience: Experience) => {
    if (selectedRef.current === experience.activityId) ++detailRequest.current;
    ++listRequest.current;
    setDetail((prev) => prev.status === "ready" && prev.activity.id === experience.activityId
      ? { ...prev, activity: { ...prev.activity, experiences: [...prev.activity.experiences, experience] } } : prev);
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === experience.activityId ? { ...a, experienceCount: a.experienceCount + 1 } : a) } : prev);
  };

  const shiftCount = (counts: Record<number, number>) =>
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id in counts ? { ...a, experienceCount: a.experienceCount + counts[a.id] } : a) } : prev);

  /** 경험 옮기기(S-12) — 바로 반영하고, 실패하면 원래 자리로 돌린 뒤 알린다 */
  const moveTo = (experience: Experience, toId: number) => {
    setDragging(null);
    setMoving(null);
    const fromId = experience.activityId;
    if (fromId === toId) return;
    const toName = list.status === "ready" ? list.activities.find((a) => a.id === toId)?.name : undefined;
    const index = detail.status === "ready" && detail.activity.id === fromId ? detail.activity.experiences.findIndex((e) => e.id === experience.id) : -1;
    ++listRequest.current;
    if (detail.status === "ready") ++detailRequest.current;
    setDetail((prev) => prev.status === "ready" && prev.activity.id === fromId
      ? { ...prev, activity: { ...prev.activity, experiences: prev.activity.experiences.filter((e) => e.id !== experience.id) } } : prev);
    shiftCount({ [fromId]: -1, [toId]: 1 });
    moveExperience(experience.id, toId).then(
      (moved) => {
        // 그새 옮겨 간 활동을 열었으면 뒤에 붙인다(계약: 옮겨 온 경험은 뒤에)
        setDetail((prev) => prev.status === "ready" && prev.activity.id === moved.activityId && !prev.activity.experiences.some((e) => e.id === moved.id)
          ? { ...prev, activity: { ...prev.activity, experiences: [...prev.activity.experiences, moved] } } : prev);
        showToast(toName ? `「${toName}」(으)로 옮겼어요.` : "다른 활동으로 옮겼어요.");
      },
      (e: Error) => {
        ++listRequest.current;
        shiftCount({ [fromId]: 1, [toId]: -1 });
        setDetail((prev) => {
          if (prev.status !== "ready" || prev.activity.id !== fromId || prev.activity.experiences.some((x) => x.id === experience.id)) return prev;
          const experiences = [...prev.activity.experiences];
          experiences.splice(index < 0 ? experiences.length : Math.min(index, experiences.length), 0, experience);
          return { ...prev, activity: { ...prev.activity, experiences } };
        });
        showToast(`옮기지 못해서 원래 활동에 돌려 놨어요. ${e.message}`, true);
      },
    );
  };

  /** 활동 합치기(S-13) — 확인 창에서 응답을 기다린다. 실패하면 던져서 창에 이유를 남기고 화면은 그대로 둔다 */
  const merge = async (keepId: number, fromId: number) => {
    const kept = await mergeActivities(keepId, fromId);
    ++listRequest.current;
    ++detailRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.filter((a) => a.id !== fromId)
      .map((a) => a.id === keepId ? { ...a, name: kept.name, period: kept.period, experienceCount: kept.experiences.length } : a) } : prev);
    selectedRef.current = keepId;
    setSelectedId(keepId);
    setDetail({ status: "ready", activity: kept });
    setMergeOpen(false);
    showToast(`활동을 합쳤어요. 「${kept.name}」에 경험 ${kept.experiences.length}개가 모였어요.`);
  };

  const deletion = useExperienceDeletion((experience) => {
    ++listRequest.current;
    if (selectedRef.current === experience.activityId) ++detailRequest.current;
    setDetail((prev) => prev.status === "ready" && prev.activity.id === experience.activityId
      ? { ...prev, activity: { ...prev.activity, experiences: prev.activity.experiences.filter((e) => e.id !== experience.id) } } : prev);
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === experience.activityId ? { ...a, experienceCount: a.experienceCount - 1 } : a) } : prev);
    // 다른 활동을 보고 있어도 삭제는 계속된다. 진행 중이던 GET 이 삭제 전 응답을 덮지 않게 다시 조회한다.
    if (selectedRef.current === experience.activityId && detail.status !== "ready") loadDetail(experience.activityId);
  });

  const hiddenIds = new Set(deletion.pending.map((item) => item.experience.id));
  const visibleDetail: DetailState = detail.status === "ready"
    ? { ...detail, activity: { ...detail.activity, experiences: detail.activity.experiences.filter((e) => !hiddenIds.has(e.id)) } } : detail;
  const ready = useMemo(() => list.status === "ready" ? { ...list, activities: list.activities.map((a) => ({
    ...a, experienceCount: Math.max(0, a.experienceCount - deletion.pending.filter((item) => item.experience.activityId === a.id).length),
  })) } : null, [list, deletion.pending]);
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
      <AppHeader hideOnMobile={!!selected} addSource={addSource} />
      <p className="m-0 border-b border-hairline px-4 py-2 text-xs text-muted" role="note">
        {isMockMode() ? "목 모드 · 예시 데이터이며 서버에 저장할 수 없어요." : "실제 API 모드 · 활동과 경험 수정은 서버에 저장해요."}
        {isMockMode() ? " 자료 넣기·분석도 목 기능이에요." : " 자료 넣기·분석 상태도 실제 API로 확인해요."}
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
                dragging={dragging}
                onDropExperience={moveTo}
                onPeriodChange={periodDragged}
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
              state={visibleDetail}
              now={ready.now}
              onClose={close}
              onRetry={() => loadDetail(selected.id)}
              onActivitySaved={activitySaved}
              onExperienceSaved={experienceSaved}
              onExperienceAdded={experienceAdded}
              onExperienceDelete={deletion.remove}
              onExperienceMove={setMoving}
              onDragChange={setDragging}
              draggingId={dragging?.id ?? null}
              onMergeRequest={ready.activities.length > 1 ? () => setMergeOpen(true) : undefined}
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

      <MoveExperienceDialog experience={moving} activities={ready?.activities ?? []} onClose={() => setMoving(null)} onPick={moveTo} />
      {selected && ready && (
        <MergeActivityDialog key={selected.id} activity={selected} activities={ready.activities} open={mergeOpen} onOpenChange={setMergeOpen} onMerge={merge} />
      )}

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mock={mockAnalysis}
        onSubmitted={(pending) => analysis.start(pending)}
      />

      {/* 알림 — ink 면 · 흰 글 (DESIGN.md 「떠 있는 것」) */}
      {(deletion.pending.length > 0 || deletion.error || toast) && (
        <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 grid w-max max-w-[calc(100%-32px)] -translate-x-1/2 gap-2 lg:bottom-6">
          {deletion.pending.map(({ experience, saving }) => (
            <div key={experience.id} role="status" className="flex items-center gap-3 rounded-sm bg-ink px-4 py-2 text-sm text-canvas shadow-float">
              <span>{saving ? "경험을 지우고 있어요…" : "경험을 지웠어요."}</span>
              {!saving && <>
                <button type="button" className="min-h-11 shrink-0 font-semibold underline" onClick={() => deletion.undo(experience.id)}>되돌리기</button>
                <button type="button" className="min-h-11 shrink-0" onClick={() => void deletion.confirm(experience.id)} aria-label="삭제 알림 닫기">닫기</button>
              </>}
            </div>
          ))}
          {deletion.error && <div role="alert" className="flex items-center gap-3 rounded-sm bg-ink px-4 py-2 text-sm text-canvas shadow-float">
            <span>{deletion.error}</span><button type="button" className="min-h-11 shrink-0" onClick={deletion.dismissError}>닫기</button>
          </div>}
          {toast && <div role={toast.alert ? "alert" : "status"} className="rounded-sm bg-ink px-4 py-3 text-sm text-canvas shadow-float">{toast.text}</div>}
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
