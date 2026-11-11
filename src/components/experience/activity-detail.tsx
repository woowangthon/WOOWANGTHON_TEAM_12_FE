"use client";

// 활동 세부 — 이름 · 기간 · 이 활동을 만든 자료 · 경험들 (SPEC S-08 · S-09 · DESIGN.md 「활동 세부」)
// PC 는 타임라인 옆 패널, 모바일은 전체 화면 + 근거는 하단 시트
import { useEffect, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, CaretLeftIcon, DotsThreeIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityDetail, ActivitySummary, Experience } from "@/lib/api/types";
import { durationText } from "@/lib/period";
import { CitationList, SourceFile } from "./citation-list";
import { ExperienceItem, ExperienceMeta } from "./experience-item";
import { ActivityCategoryField } from "./activity-category";
import { ActivityNameField, PeriodField } from "./inline-edit";
import { ActivityNote } from "./activity-note";
import { ActivityLinks } from "./activity-links";
import { ExperienceEditor } from "./experience-editor";
import { SourceFileButton } from "./source-viewer";
import { RevisionDialog } from "@/components/revisions/revision-list";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { ExportStatus, useMarkdownExport } from "@/components/export/markdown-export";
import { AnalysisButton, AnalysisCost } from "@/components/auth/analysis-cost";
import { fetchActivity, organizeStar } from "@/lib/api/experience";
import { needsStar, StarPanel } from "./star-slots";

const FIRST_COUNT = 3;
/** STAR 정리 중일 때 활동 세부를 다시 읽는 간격 — 작업 ID 가 없어 세부의 star.status 로 본다(계약) */
const STAR_POLL_MS = 3000;

export type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activity: ActivityDetail };

type Props = {
  readOnly?: boolean;
  summary: ActivitySummary;
  state: DetailState;
  now: number;
  onClose: () => void;
  onRetry: () => void;
  onActivitySaved: (activity: ActivitySummary) => void;
  onNoteSaved: (activity: ActivitySummary) => void;
  onCategorySaved: (activity: ActivitySummary) => void;
  onExperienceSaved: (experience: Experience) => void;
  onExperienceAdded: (experience: Experience) => void;
  /** 활동 세부를 통째로 바꾼다 — 「STAR 로 정리」 응답 · 정리 중 다시 읽기 */
  onActivityReplaced: (activity: ActivityDetail) => void;
  onExperienceDelete: (experience: Experience) => void;
  onExperienceMove: (experience: Experience) => void;
  /** 「다른 경험과 합치기」(S-70) — 경험이 둘 이상일 때만 메뉴에 보인다 */
  onExperienceMerge?: (experience: Experience) => void;
  onDragChange: (experience: Experience | null) => void;
  draggingId: number | null;
  /** 다른 활동이 없으면 undefined — 메뉴를 숨긴다 */
  onMergeRequest?: () => void;
  /** 「지우기」(S-88) — 확인 창은 부모가 연다 */
  onDeleteRequest?: () => void;
  /** 같은 활동 제안 줄(S-44 · FE#246) — 이 활동이 새 쪽이든 기존 쪽이든. 결정은 비교 창에서 */
  suggestions?: ReactNode;
  /** 이어진 활동(S-35)을 누르면 그 활동 세부로 간다 */
  onOpenActivity: (id: number) => void;
  /** 「자료 더하기」(S-60) — 없으면 버튼을 숨긴다 */
  onAddSource?: () => void;
  /** 다른 자료를 분석하는 동안은 막는다 */
  addSourceBusy?: boolean;
  /** 이 활동에 더한 자료의 분석 상태 */
  addSourceStatus?: ReactNode;
};

export function ActivityDetailView({ summary, state, now, onClose, onRetry, onActivitySaved, onNoteSaved, onCategorySaved, onExperienceSaved, onExperienceAdded, onActivityReplaced, onExperienceDelete, onExperienceMove, onExperienceMerge, onDragChange, draggingId, onMergeRequest, onDeleteRequest, suggestions, onOpenActivity, onAddSource, addSourceBusy, addSourceStatus, readOnly = false }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const exporter = useMarkdownExport();
  const activity = state.status === "ready" ? state.activity : null;
  const current = activity ?? summary;
  const period = current.period;
  const canAddSource = !!activity && !readOnly && !!onAddSource;
  const sources = activity
    ? [...new Map(activity.experiences.flatMap((e) => e.citations).map((c) => [c.sourceId, c.sourceName])).entries()]
    : [];

  return (
    <div className="flex min-h-full flex-col">
      {/* 모바일 — 내 경험으로 돌아가기(FE#518). 타임라인 · 서랍 어느 뷰에서 왔든 그 뷰로 — 닫기는 고른 활동만 지우고 목록 뷰는 그대로다 */}
      <div className="sticky top-11.25 z-10 flex h-14 items-center border-b border-hairline bg-canvas px-3 lg:hidden">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 lg:h-10 items-center gap-0.5 pr-2 text-ui font-medium text-ink"
        >
          <CaretLeftIcon className="size-[1.15em]" aria-hidden="true" />
          내 경험
        </button>
      </div>

      <header className="grid gap-2.5 border-b border-hairline px-4.5 pt-5 pb-4 lg:px-7 lg:pt-7 lg:pb-5">
        <div className="flex items-start gap-2">
          <ActivityNameField key={current.id} activity={{ ...summary, name: current.name, period }} readOnly={readOnly || !activity} onSaved={onActivitySaved} />
          {/* 활동이 하나여도 메뉴는 있다 — 수정 이력(S-80) · 지우기(S-88). 합치기만 둘 이상일 때 */}
          {activity && !readOnly && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-11 lg:size-9" aria-label="활동 메뉴"><DotsThreeIcon /></Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className={cn(MENU_CONTENT, "z-50 min-w-40")}>
                  {onMergeRequest && <DropdownMenu.Item onSelect={onMergeRequest} className={MENU_ITEM}>다른 활동과 합치기</DropdownMenu.Item>}
                  <DropdownMenu.Item onSelect={() => setHistoryOpen(true)} className={MENU_ITEM}>수정 이력</DropdownMenu.Item>
                  <DropdownMenu.Item disabled={exporter.busy} onSelect={() => void exporter.run({ scope: "activity", id: activity.id })} className={MENU_ITEM}>Markdown 으로 내보내기</DropdownMenu.Item>
                  {onDeleteRequest && <DropdownMenu.Item onSelect={onDeleteRequest} className={cn(MENU_ITEM, "text-error")}>지우기</DropdownMenu.Item>}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {/* 활동과 지금 속한 경험의 기록을 한 곳에서(FE#467 · BE#168). 되돌리면 연 세부 · 경험 줄이 그 자리에서 바뀐다(restore-bus) */}
          {activity && !readOnly && <RevisionDialog open={historyOpen} onOpenChange={setHistoryOpen} target={null} activityId={activity.id} title="수정 이력"
            description="이 활동의 이름 · 기간과 경험을 고친 기록이에요." />}
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onClose} aria-label="세부 닫기">
            <XIcon />
          </Button>
        </div>
        {activity && <ExportStatus exporter={exporter} target={{ scope: "activity", id: activity.id }} />}
        <ActivityCategoryField activity={summary} onSaved={onCategorySaved} readOnly={readOnly} />
        <p className="m-0 flex flex-wrap items-center gap-2.5 text-sm text-body tabular-nums">
          <PeriodField activity={{ ...summary, name: current.name, period }} readOnly={readOnly || !activity} onSaved={onActivitySaved}>
            <span className="text-muted">{durationText(period, now)}</span>
          </PeriodField>
        </p>
        {(sources.length > 0 || canAddSource) && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-note text-muted">
            {sources.map(([id, name]) => readOnly ? <SourceFile key={id} name={name} /> : <SourceFileButton key={id} sourceId={id} name={name} />)}
            {canAddSource && (
              <button
                type="button"
                onClick={onAddSource}
                disabled={addSourceBusy}
                className="min-h-8 rounded-full px-2 text-xs font-semibold text-muted hover:bg-surface-soft hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                + 자료 더하기
              </button>
            )}
            {canAddSource && addSourceBusy && <span>분석이 끝나면 더 넣을 수 있어요</span>}
          </p>
        )}
      </header>

      {!readOnly && suggestions}

      {addSourceStatus && <div className="px-4.5 lg:px-7">{addSourceStatus}</div>}

      {activity && <ActivityLinks key={`links-${activity.id}`} activity={activity} readOnly={readOnly} onOpenActivity={onOpenActivity} />}


      <div className="px-4.5 pt-2 pb-10 lg:px-7 lg:pb-8">
        {/* 경험 줄 자리 — 「이 활동에서 한 일」 머리 · 두 줄 글 · 아래 꼬리(FE#402) */}
        {state.status === "loading" && <div role="status" className="grid pt-4">
          <span className="sr-only">경험을 불러오고 있어요</span>
          <Skeleton className="mb-2 h-3.5 w-28" />
          {[0, 1].map(i => <div key={i} className="grid gap-2 border-b border-hairline py-4">
            <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-1 h-3 w-24" />
          </div>)}
        </div>}
        {state.status === "error" && (
          <div className="grid justify-items-start gap-3 pt-4">
            <p role="alert" className="m-0 text-sm font-medium text-error">{state.message}</p>
            <Button size="sm" onClick={onRetry}>
              <ArrowsClockwiseIcon />
              다시 시도
            </Button>
          </div>
        )}
        {activity && <ExperienceList key={activity.id} activity={activity} readOnly={readOnly} onSaved={onExperienceSaved} onAdded={onExperienceAdded} onReplaced={onActivityReplaced} onDelete={onExperienceDelete}
          onMove={onExperienceMove} onMerge={activity.experiences.length > 1 ? onExperienceMerge : undefined} onDragChange={onDragChange} draggingId={draggingId} />}
      </div>

      {/* 「그때의 나」는 경험보다 덜 중요해 경험 목록 아래(FE#293) */}
      {activity && <ActivityNote key={activity.id} activity={activity} readOnly={readOnly} onSaved={onNoteSaved} />}
    </div>
  );
}

/** 경험 아래 펼침은 한 패널에 하나 — 근거든 STAR 든(DESIGN.md 「경험 줄 — STAR 칸」) */
type Expanded = { id: number; kind: "citations" | "star" } | null;

/** 「STAR 로 정리」(S-95) — 활동 하나에 분석 1회. 정리 중이면 세부를 다시 읽어 star.status 를 따라간다 */
function useStarOrganize(activity: ActivityDetail, onReplaced: (activity: ActivityDetail) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzing = activity.experiences.some((e) => e.star?.status === "ANALYZING");
  useEffect(() => {
    if (!analyzing) return;
    let alive = true;
    const timer = setTimeout(() => {
      // 다시 읽기 실패는 다음 차례에 — 진행 표시는 그대로 둔다
      fetchActivity(activity.id).then((next) => { if (alive) onReplaced(next); }, () => {});
    }, STAR_POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [analyzing, activity, onReplaced]);
  const run = async () => {
    if (busy || analyzing) return;
    setBusy(true); setError(null);
    try { onReplaced(await organizeStar(activity.id)); }
    catch (e) { setError(`STAR 로 정리하지 못했어요. ${e instanceof Error ? e.message : "다시 시도해 주세요."}`); }
    finally { setBusy(false); }
  };
  return { run, busy: busy || analyzing, error };
}

function ExperienceList({ activity, onSaved, onAdded, onReplaced, onDelete, onMove, onMerge, onDragChange, draggingId, readOnly }: {
  readOnly: boolean;
  activity: ActivityDetail;
  onSaved: (experience: Experience) => void;
  onAdded: (experience: Experience) => void;
  onReplaced: (activity: ActivityDetail) => void;
  onDelete: (experience: Experience) => void;
  onMove: (experience: Experience) => void;
  onMerge?: (experience: Experience) => void;
  onDragChange: (experience: Experience | null) => void;
  draggingId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Expanded>(null);
  const [sheet, setSheet] = useState<Expanded>(null);
  const star = useStarOrganize(activity, onReplaced);
  const canOrganize = !readOnly && activity.experiences.some(needsStar);

  // 「확인 필요」는 할 일이 있어 맨 위로(FE#273). 연 순간의 상태로만 정한다 — 고치거나 맞아요를 눌러도 줄이 튀지 않게(이 목록은 활동마다 key 로 새로 그린다)
  const [reviewIds] = useState(() => new Set(activity.experiences.filter((e) => e.sourceStatus === "NEEDS_REVIEW").map((e) => e.id)));
  const experiences = [...activity.experiences.filter((e) => reviewIds.has(e.id)), ...activity.experiences.filter((e) => !reviewIds.has(e.id))];
  const visible = showAll ? experiences : experiences.slice(0, FIRST_COUNT);
  const rest = experiences.length - FIRST_COUNT;
  const sheetExp = sheet ? experiences.find((e) => e.id === sheet.id) : undefined;

  const toggle = (id: number, kind: "citations" | "star") =>
    setExpanded((prev) => prev?.id === id && prev.kind === kind ? null : { id, kind });
  const savedKeepingUsedIn = (prev: Experience) => (result: Experience) => onSaved({ ...result, usedIn: result.usedIn ?? prev.usedIn });

  return (
    <>
      {/* 안내는 접어 둔다 — 「확인 필요」 · 「누가 했나요?」 표시가 할 일을 보여 준다 */}
      <div className="flex items-center gap-0.5 pt-4 pb-1">
        <p className="m-0 text-note font-medium text-muted">이 활동에서 한 일 {experiences.length}</p>
        {experiences.length > 0 && <InfoTip label="이 활동에서 한 일">
          AI 가 자료에서 찾아 채운 기록이에요. 「확인 필요」는 원문과 맞는지 봐 주세요.{!readOnly && <> 다른 활동의 일이면 왼쪽 손잡이로 끌어 옮겨요.</>}
        </InfoTip>}
        {/* 경험 줄마다 두지 않고 목록 머리에 하나(DESIGN.md) — 정리할 경험이 있을 때만 */}
        {canOrganize && <span className="ml-auto inline-flex items-center gap-1.5">
          <AnalysisCost running={star.busy} />
          <AnalysisButton variant="secondary" size="sm" className="min-h-11 lg:min-h-8" running={star.busy} disabled={star.busy} onClick={() => void star.run()}>
            {star.busy ? "STAR 정리 중…" : "STAR 로 정리"}
          </AnalysisButton>
          <InfoTip label="STAR 로 정리" align="end">경험마다 근거 · 내 답을 상황 · 과제 · 행동 · 결과 칸에 나눠 둬요. 빈칸은 차곡이가 물어볼 거리예요.</InfoTip>
        </span>}
      </div>
      {star.error && <p role="alert" className="m-0 pb-1 text-note text-error">{star.error}</p>}
      <ul className="m-0 list-none p-0">
        {visible.map((e) => (
          <ExperienceItem
            key={e.id}
            readOnly={readOnly}
            experience={e}
            onSaved={onSaved}
            onDelete={onDelete}
            onMove={onMove}
            onMerge={onMerge}
            onDragChange={onDragChange}
            dragging={e.id === draggingId}
            citationsOpen={expanded?.id === e.id && expanded.kind === "citations"}
            onToggleCitations={() => toggle(e.id, "citations")}
            onShowCitations={() => setSheet({ id: e.id, kind: "citations" })}
            starOpen={expanded?.id === e.id && expanded.kind === "star"}
            onToggleStar={() => toggle(e.id, "star")}
            onShowStar={() => setSheet({ id: e.id, kind: "star" })}
            onOrganizeStar={() => void star.run()}
            organizingStar={star.busy}
          />
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full rounded-sm bg-surface-soft p-3 text-sm font-semibold text-ink hover:bg-surface-strong"
        >
          {showAll ? `처음 ${FIRST_COUNT}개만 보기` : `나머지 ${rest}개 더 보기`}
        </button>
      )}
      <div className="mt-4">
        {adding ? (
          <ExperienceEditor activityId={activity.id} onCancel={() => setAdding(false)} onSaved={(experience) => {
            onAdded(experience);
            setShowAll(true);
            setAdding(false);
          }} />
        ) : experiences.length === 0 ? (
          <EmptyExperiences onAdd={readOnly ? undefined : () => setAdding(true)} />
        ) : !readOnly && (
          <Button variant="ghost" className="w-full justify-start lg:h-9" onClick={() => { setShowAll(true); setAdding(true); }}><PlusIcon />경험 직접 추가</Button>
        )}
      </div>

      {/* 모바일 — 근거 · STAR 하단 시트 */}
      <Sheet open={sheetExp != null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[78dvh] gap-3 overflow-auto rounded-t-lg border-t-0 px-5 pt-2.5 pb-7 lg:hidden"
        >
          <span className="h-1 w-9 justify-self-center rounded-full bg-hairline self-center" aria-hidden="true" />
          {sheetExp && sheet?.kind === "star" && (
            <>
              <SheetHeader className="gap-2 p-0 pr-10">
                <SheetTitle className="line-clamp-2 text-title-md font-semibold">{sheetExp.content}</SheetTitle>
                <SheetDescription className="text-note text-muted">STAR 칸 — 빈칸은 차곡이가 물어볼 거리예요</SheetDescription>
              </SheetHeader>
              <StarPanel experience={sheetExp} onSaved={savedKeepingUsedIn(sheetExp)} onShowCitations={() => setSheet({ id: sheetExp.id, kind: "citations" })}
                onOrganize={() => void star.run()} organizing={star.busy} />
            </>
          )}
          {sheetExp && sheet?.kind === "citations" && (
            <>
              <SheetHeader className="gap-2 p-0 pr-10">
                <SheetTitle className="text-title-md font-semibold">근거 {sheetExp.citations.length}</SheetTitle>
                <SheetDescription className="text-ui leading-relaxed text-body">{sheetExp.content}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted">
                <ExperienceMeta experience={sheetExp} />
              </div>
              <CitationList citations={sheetExp.citations} readOnly={readOnly} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * 경험이 0개인 활동 (FE#22 · SPEC S-03). 원본에 활동 이름 · 기간만 있었거나, 사용자가 다 지우거나 옮겼을 때 —
 * 어느 쪽인지 알 수 없으니 「자료에서 못 찾았다」로 단정하지 않는다. 「자료에서 확인 안 됨」은 「경험 없음」이 아니다(SPEC §0)
 */
function EmptyExperiences({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-sm bg-surface-soft px-4 py-4">
      <p className="m-0 text-ui font-semibold text-ink">아직 이 활동에 적힌 경험이 없어요</p>
      <p className="m-0 text-sm leading-relaxed text-body">
        자료에 활동 이름 · 기간만 있었거나, 경험을 지우거나 다른 활동으로 옮겼을 수 있어요. 자료에서 찾지 못했다고 한 일이
        없는 건 아니에요 — 기억나는 일을 한 줄씩 적어 두면 여기에 쌓여요.
      </p>
      {onAdd && <Button variant="secondary" size="sm" className="mt-1" onClick={onAdd}>
        <PlusIcon />
        경험 직접 추가
      </Button>}
    </div>
  );
}
