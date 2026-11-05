"use client";

// 첫 화면 — 연도별 타임라인 + 활동 세부 (SPEC F-03) · 자료 넣기 + 분석 상태 (F-01)
// PC 는 타임라인 옆 패널, 모바일은 목록 → 전체 화면 세부
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowsClockwiseIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AddSourceButton, AppHeader, type AddSourceProps } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { AnalysisBanner, AnalysisCenter, analysisView } from "@/components/source/analysis-status";
import { hasPendingAnalysis, useAnalysisJob } from "@/components/source/use-analysis-job";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dismissMergeSuggestion, fetchActivities, fetchActivity, isMockMode, mergeActivities, moveExperience, updateActivity, type MockAnalysis, type MockMode } from "@/lib/api/experience";
import type { ActivitySummary, Experience, Period } from "@/lib/api/types";
import { monthNumber, periodText, spanOf, yearsOf, type Span } from "@/lib/period";
import { ActivityDetailView, type DetailState } from "./activity-detail";
import { MergeActivityDialog, MoveExperienceDialog } from "./regroup-dialogs";
import { Timeline } from "./timeline";
import { useExperienceDeletion } from "./use-experience-deletion";
import { SupplementSourceContext, supplementSource } from "./supplement-list";
import { fetchQuestions } from "@/lib/api/questions";
import { HomeEntrance } from "@/components/home/home-entrance";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activities: ActivitySummary[]; now: number };

type PeriodSave = { confirmed: Period; latest: Period; pending: Period | null; running: boolean };

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
  const [toast, setToast] = useState<{ text: string; alert: boolean } | null>(null);
  const [dragging, setDragging] = useState<Experience | null>(null);
  const [moving, setMoving] = useState<Experience | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const selectedRef = useRef<number | null>(null);
  const listScrollY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const periodSaves = useRef(new Map<number, PeriodSave>());
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    const deactivate = () => {
      active.current = false;
      ++listRequest.current;
      ++detailRequest.current;
      clearTimeout(toastTimer.current);
      setToast(null);
    };
    return () => deactivate();
  }, []);

  const loadList = (mode: MockMode) => {
    const request = ++listRequest.current;
    return fetchActivities(mode).then(
      (activities) => {
        if (request !== listRequest.current) return null;
        setList({ status: "ready", activities: activities.map((a) => ({ ...a, period: periodSaves.current.get(a.id)?.latest ?? a.period })), now: monthNumber(new Date()) });
        return activities;
      },
      (e: Error) => {
        if (request === listRequest.current) setList({ status: "error", message: e.message });
        return null;
      },
    );
  };

  // 보완의 출처 「OO 문항에서 답함」 — 문항에서 답한 보완이 있는 활동을 처음 열 때 문항 목록을 한 번 읽는다.
  // 못 읽으면 「되묻기에 답함」으로 둔다(표시 문구만 달라진다)
  const [sourceOf, setSourceOf] = useState<ReturnType<typeof supplementSource>>(() => () => null);
  const sourceRequested = useRef(false);
  const needsSource = detail.status === "ready" && detail.activity.experiences.some((e) => e.supplements?.some((s) => s.questionId !== null));
  useEffect(() => {
    if (!needsSource || sourceRequested.current || isMockMode()) return;
    sourceRequested.current = true;
    fetchQuestions()
      .then((questions) => setSourceOf(() => supplementSource(new Map(questions.map((q) => [q.id, q.organization])))))
      .catch(() => { sourceRequested.current = false; });
  }, [needsSource]);

  const showToast = (text: string, alert = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, alert });
    toastTimer.current = setTimeout(() => setToast(null), alert ? 7000 : 4000);
  };

  const loadDetail = (id: number) => {
    const request = ++detailRequest.current;
    setDetail({ status: "loading" });
    fetchActivity(id).then(
      (activity) => request === detailRequest.current && setDetail({ status: "ready", activity: { ...activity, period: periodSaves.current.get(id)?.latest ?? activity.period } }),
      (e: Error) => request === detailRequest.current && setDetail({ status: "error", message: e.message }),
    );
  };

  // 지원 화면의 「타임라인에서 활동 보기」(?activity=7&fromQuestion=41) — 처음 불러온 뒤 그 활동을 연다
  const linkedActivity = Number(params.get("activity"));
  const fromQuestion = Number(params.get("fromQuestion")) || null;
  useEffect(() => {
    loadList(mock).then((activities) => {
      if (activities?.some((a) => a.id === linkedActivity) && selectedRef.current == null) {
        selectedRef.current = linkedActivity;
        setSelectedId(linkedActivity);
        loadDetail(linkedActivity);
      }
    });
    // 처음 한 번만 — 그 뒤엔 사용자가 고른 활동을 따른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  // 다른 화면(지원)의 「자료 넣기」(?add=1, FE#64) — 자료 넣기 창을 연다. 새로고침에 다시 열리지 않게 주소에서 지운다.
  // 분석이 아직 돌고 있으면 이 화면의 「자료 넣기」처럼 막고 이유만 알린다
  useEffect(() => {
    if (params.get("add") !== "1") return;
    const timer = setTimeout(() => {
      if (hasPendingAnalysis()) showToast("지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요.");
      else setAddOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("add");
      window.history.replaceState(null, "", url);
    }, 0);
    return () => clearTimeout(timer);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const suggestedCount = activities.filter((a) => job.activityIds.includes(a.id) && a.mergeSuggestion).length;
    if (job.activityIds.length) showToast((isMockMode()
      ? `목 분석 결과 활동 ${job.activityIds.length}개예요. 서버에 저장된 결과가 아니에요.`
      : `분석이 완료됐어요. 활동 ${job.activityIds.length}개를 확인해 보세요.`)
      + (suggestedCount ? ` 기존 활동과 같아 보이는 활동 ${suggestedCount}개가 있어요.` : ""));
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
    const queued = periodSaves.current.get(activity.id);
    if (queued && !queued.running) {
      queued.confirmed = queued.latest = activity.period;
    }
    ++listRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === activity.id ? activity : a) } : prev);
    setDetail((prev) => prev.status === "ready" && prev.activity.id === activity.id ? { ...prev, activity: { ...prev.activity, name: activity.name, period: activity.period } } : prev);
  };

  /** 띠는 즉시 반영한다. 같은 활동은 한 요청씩 보내고, 대기 중 변경은 마지막 것만 저장한다(#62). */
  const periodDragged = (activity: ActivitySummary, period: Period) => {
    const apply = (p: Period) => {
      ++listRequest.current;
      setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === activity.id ? { ...a, period: p } : a) } : prev);
      setDetail((prev) => prev.status === "ready" && prev.activity.id === activity.id ? { ...prev, activity: { ...prev.activity, period: p } } : prev);
    };
    apply(period);
    let queue = periodSaves.current.get(activity.id);
    if (!queue) {
      queue = { confirmed: activity.period, latest: period, pending: null, running: false };
      periodSaves.current.set(activity.id, queue);
    }
    queue.latest = queue.pending = period;
    if (queue.running) return;
    queue.running = true;
    const current = queue;
    void (async () => {
      // 언마운트 뒤에도 이미 받은 마지막 의도까지 저장하되, 화면·알림에는 접근하지 않는다.
      while (current.pending && periodSaves.current.get(activity.id) === current) {
        const next = current.pending;
        current.pending = null;
        try {
          const saved = await updateActivity(activity.id, { period: next });
          if (periodSaves.current.get(activity.id) !== current) return;
          current.confirmed = saved.period;
          // 응답 전체로 화면을 덮지 않는다. 이름·경험 수와 최신 드래그를 보존한다.
          if (!current.pending && active.current) showToast(`「${activity.name}」 기간을 ${periodText(saved.period)}(으)로 바꿨어요.`);
        } catch (e) {
          if (periodSaves.current.get(activity.id) !== current) return;
          current.pending = null;
          current.latest = current.confirmed;
          if (active.current) {
            apply(current.confirmed);
            showToast(`기간을 바꾸지 못해서 마지막으로 저장된 기간으로 돌려 놨어요. ${e instanceof Error ? e.message : "다시 시도해 주세요."}`, true);
          }
        }
      }
      current.running = false;
    })();
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
    periodSaves.current.delete(keepId);
    periodSaves.current.delete(fromId);
    ++listRequest.current;
    ++detailRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.filter((a) => a.id !== fromId)
      .map((a) => a.id === keepId ? { ...a, name: kept.name, period: kept.period, experienceCount: kept.experiences.length, mergeSuggestion: kept.mergeSuggestion }
        : a.mergeSuggestion?.activityId === fromId ? { ...a, mergeSuggestion: null } : a) } : prev);
    selectedRef.current = keepId;
    setSelectedId(keepId);
    setDetail({ status: "ready", activity: kept });
    setMergeOpen(false);
    showToast(`활동을 합쳤어요. 「${kept.name}」에 경험 ${kept.experiences.length}개가 모였어요.`);
  };

  const dismissSuggestion = async (id: number) => {
    const previousDetailRequest = detailRequest.current;
    await dismissMergeSuggestion(id);
    ++listRequest.current;
    const reopened = selectedRef.current === id && previousDetailRequest !== detailRequest.current;
    if (selectedRef.current === id) ++detailRequest.current;
    setList((prev) => prev.status === "ready" ? { ...prev, activities: prev.activities.map((a) => a.id === id ? { ...a, mergeSuggestion: null } : a) } : prev);
    setDetail((prev) => prev.status === "ready" && prev.activity.id === id ? { ...prev, activity: { ...prev.activity, mergeSuggestion: null } } : prev);
    if (reopened) loadDetail(id);
    showToast("두 활동을 따로 두었어요.");
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
        {fromQuestion && <> <Link href={`/questions?question=${fromQuestion}`} className="font-medium text-ink underline underline-offset-4">지원 화면으로 돌아가기</Link></>}
      </p>
      <div className={cn("flex-1 lg:grid lg:min-h-0", selected && "lg:grid-cols-[minmax(0,1fr)_440px]")}>
        <main
          className={cn(
            "min-w-0 px-4.5 pt-4.5 pb-24 lg:overflow-auto lg:px-8 lg:pt-8 lg:pb-16",
            selected && "hidden lg:block",
          )}
        >
          <HomeEntrance sourceBusy={view === "analyzing"} mockAnalysis={mockAnalysis} onSourceSubmitted={analysis.start} />
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
            <SupplementSourceContext value={sourceOf}>
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
              onSuggestedMerge={merge}
              onSuggestionDismiss={dismissSuggestion}
              onMergeRequest={ready.activities.length > 1 ? () => setMergeOpen(true) : undefined}
            />
            </SupplementSourceContext>
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
