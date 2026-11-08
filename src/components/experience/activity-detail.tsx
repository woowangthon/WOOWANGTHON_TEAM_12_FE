"use client";

// 활동 세부 — 이름 · 기간 · 이 활동을 만든 자료 · 경험들 (SPEC S-08 · S-09 · DESIGN.md 「활동 세부」)
// PC 는 타임라인 옆 패널, 모바일은 전체 화면 + 근거는 하단 시트
import { useRef, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, CaretLeftIcon, DotsThreeIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityDetail, ActivitySummary, Experience } from "@/lib/api/types";
import { durationText } from "@/lib/period";
import { CitationList, SourceFile } from "./citation-list";
import { ExperienceItem, ExperienceMeta } from "./experience-item";
import { ActivityCategoryField } from "./activity-category";
import { ActivityNameField, PeriodField, type InlineEditHandle } from "./inline-edit";
import { ActivityNote } from "./activity-note";
import { ActivityLinks } from "./activity-links";
import { ActivityActorDecision } from "./activity-actor";
import { ExperienceEditor } from "./experience-editor";
import { MergeSuggestionView } from "./merge-suggestion";
import { SourceFileButton } from "./source-viewer";

const FIRST_COUNT = 3;

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
  onExperienceDelete: (experience: Experience) => void;
  onExperienceMove: (experience: Experience) => void;
  /** 「다른 경험과 합치기」(S-70) — 경험이 둘 이상일 때만 메뉴에 보인다 */
  onExperienceMerge?: (experience: Experience) => void;
  onDragChange: (experience: Experience | null) => void;
  draggingId: number | null;
  /** 다른 활동이 없으면 undefined — 메뉴를 숨긴다 */
  onMergeRequest?: () => void;
  onSuggestedMerge?: (keepId: number, fromId: number) => Promise<void>;
  onSuggestionDismiss?: (id: number) => Promise<void>;
  /** 이어진 활동(S-35)을 누르면 그 활동 세부로 간다 */
  onOpenActivity: (id: number) => void;
  /** 「자료 더하기」(S-60) — 없으면 버튼을 숨긴다 */
  onAddSource?: () => void;
  /** 다른 자료를 분석하는 동안은 막는다 */
  addSourceBusy?: boolean;
  /** 이 활동에 더한 자료의 분석 상태 */
  addSourceStatus?: ReactNode;
};

export function ActivityDetailView({ summary, state, now, onClose, onRetry, onActivitySaved, onNoteSaved, onCategorySaved, onExperienceSaved, onExperienceAdded, onExperienceDelete, onExperienceMove, onExperienceMerge, onDragChange, draggingId, onMergeRequest, onSuggestedMerge, onSuggestionDismiss, onOpenActivity, onAddSource, addSourceBusy, addSourceStatus, readOnly = false }: Props) {
  const nameEdit = useRef<InlineEditHandle>(null);
  // 메뉴가 닫힌 뒤에 칸을 연다 — 열린 메뉴가 포커스를 붙잡고 있어서
  const editFromMenu = useRef(false);
  const activity = state.status === "ready" ? state.activity : null;
  const current = activity ?? summary;
  const period = current.period;
  const canAddSource = !!activity && !readOnly && !!onAddSource;
  const sources = activity
    ? [...new Map(activity.experiences.flatMap((e) => e.citations).map((c) => [c.sourceId, c.sourceName])).entries()]
    : [];

  return (
    <div className="flex min-h-full flex-col">
      {/* 모바일 — 타임라인으로 돌아가기 */}
      <div className="sticky top-11.25 z-10 flex h-14 items-center border-b border-hairline bg-canvas px-3 lg:hidden">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center gap-0.5 pr-2 text-ui font-medium text-ink"
        >
          <CaretLeftIcon className="size-[1.15em]" aria-hidden="true" />
          타임라인
        </button>
      </div>

      <header className="grid gap-2.5 border-b border-hairline px-4.5 pt-5 pb-4 lg:px-7 lg:pt-7 lg:pb-5">
        <div className="flex items-start gap-2">
          <ActivityNameField key={current.id} activity={{ ...summary, name: current.name, period }} readOnly={readOnly || !activity} onSaved={onActivitySaved} editRef={nameEdit} />
          {activity && onMergeRequest && !readOnly && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-11 lg:size-9" aria-label="활동 메뉴"><DotsThreeIcon /></Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} onCloseAutoFocus={(e) => { if (!editFromMenu.current) return; e.preventDefault(); editFromMenu.current = false; nameEdit.current?.open(); }} className="z-50 min-w-40 rounded-md border border-hairline bg-canvas p-1 shadow-float">
                  <DropdownMenu.Item onSelect={() => { editFromMenu.current = true; }} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm outline-none focus:bg-surface-soft">이름 고치기</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={onMergeRequest} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm outline-none focus:bg-surface-soft">다른 활동과 합치기</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onClose} aria-label="세부 닫기">
            <XIcon />
          </Button>
        </div>
        <ActivityCategoryField activity={summary} onSaved={onCategorySaved} readOnly={readOnly} />
        <p className="m-0 flex flex-wrap items-center gap-2.5 text-sm text-body tabular-nums">
          <PeriodField activity={{ ...summary, name: current.name, period }} readOnly={readOnly || !activity} onSaved={onActivitySaved}>
            <span className="text-muted">{durationText(period, now)}</span>
          </PeriodField>
        </p>
        {(sources.length > 0 || canAddSource) && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-note text-muted">
            {sources.length > 0 && "이 활동을 만든 자료"}
            {sources.map(([id, name]) => readOnly ? <SourceFile key={id} name={name} /> : <SourceFileButton key={id} sourceId={id} name={name} />)}
            {canAddSource && (
              <button
                type="button"
                onClick={onAddSource}
                disabled={addSourceBusy}
                title={addSourceBusy ? "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요" : undefined}
                className="min-h-8 rounded-full px-2 text-xs font-semibold text-muted hover:bg-surface-soft hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                + 자료 더하기
              </button>
            )}
          </p>
        )}
      </header>

      {addSourceStatus && <div className="px-4.5 lg:px-7">{addSourceStatus}</div>}

      {activity && <ActivityNote key={activity.id} activity={activity} readOnly={readOnly} onSaved={onNoteSaved} />}
      {activity && <ActivityLinks key={`links-${activity.id}`} activity={activity} readOnly={readOnly} onOpenActivity={onOpenActivity} />}

      {activity?.mergeSuggestion && !readOnly && onSuggestedMerge && onSuggestionDismiss && (
        <MergeSuggestionView key={`${activity.id}-${activity.mergeSuggestion.activityId}`} activity={activity} suggestion={activity.mergeSuggestion} onMerge={onSuggestedMerge} onDismiss={onSuggestionDismiss} />
      )}

      <div className="px-4.5 pt-2 pb-10 lg:px-7 lg:pb-8">
        {state.status === "loading" && <p className="pt-4 text-sm text-muted">경험을 불러오고 있어요…</p>}
        {state.status === "error" && (
          <div className="grid justify-items-start gap-3 pt-4">
            <p role="alert" className="m-0 text-sm font-medium text-error">{state.message}</p>
            <Button size="sm" onClick={onRetry}>
              <ArrowsClockwiseIcon />
              다시 시도
            </Button>
          </div>
        )}
        {activity && !readOnly && <ActivityActorDecision key={`actor-${activity.id}`} activity={activity} onSaved={onExperienceSaved} />}
        {activity && <ExperienceList key={activity.id} activity={activity} readOnly={readOnly} onSaved={onExperienceSaved} onAdded={onExperienceAdded} onDelete={onExperienceDelete}
          onMove={onExperienceMove} onMerge={activity.experiences.length > 1 ? onExperienceMerge : undefined} onDragChange={onDragChange} draggingId={draggingId} />}
      </div>
    </div>
  );
}

function ExperienceList({ activity, onSaved, onAdded, onDelete, onMove, onMerge, onDragChange, draggingId, readOnly }: {
  readOnly: boolean;
  activity: ActivityDetail;
  onSaved: (experience: Experience) => void;
  onAdded: (experience: Experience) => void;
  onDelete: (experience: Experience) => void;
  onMove: (experience: Experience) => void;
  onMerge?: (experience: Experience) => void;
  onDragChange: (experience: Experience | null) => void;
  draggingId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [sheetId, setSheetId] = useState<number | null>(null);

  const { experiences } = activity;
  const visible = showAll ? experiences : experiences.slice(0, FIRST_COUNT);
  const rest = experiences.length - FIRST_COUNT;
  const sheetExp = experiences.find((e) => e.id === sheetId);

  const toggle = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <p className="m-0 pt-4 pb-1 text-note font-medium text-muted">이 활동에서 한 일 {experiences.length}</p>
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
            citationsOpen={openIds.has(e.id)}
            onToggleCitations={() => toggle(e.id)}
            onShowCitations={() => setSheetId(e.id)}
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
          <Button variant="ghost" className="w-full justify-start" onClick={() => { setShowAll(true); setAdding(true); }}><PlusIcon />경험 직접 추가</Button>
        )}
      </div>
      {/* 경험이 0개면 빈 상태 안내가 같은 말을 하므로 숨긴다 (FE#22) */}
      {experiences.length > 0 && <p className="m-0 mt-5 hidden text-note leading-relaxed text-muted lg:block">
        AI 가 자료에서 찾아 채운 기록이에요. 「확인 필요」는 원문과 맞는지 한번 봐 주세요. 자료에서 찾지 못했다고 경험이
        없는 건 아니에요. {!readOnly && <>다른 활동의 일이면 경험 왼쪽 손잡이를 끌어 타임라인의 그 활동에 놓아 주세요.</>}
      </p>}

      {/* 모바일 — 근거 하단 시트 */}
      <Sheet open={sheetExp != null} onOpenChange={(open) => !open && setSheetId(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[78dvh] gap-3 overflow-auto rounded-t-lg border-t-0 px-5 pt-2.5 pb-7 lg:hidden"
        >
          <span className="h-1 w-9 justify-self-center rounded-full bg-hairline self-center" aria-hidden="true" />
          {sheetExp && (
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
