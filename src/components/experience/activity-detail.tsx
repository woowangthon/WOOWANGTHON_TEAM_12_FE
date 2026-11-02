"use client";

// 활동 세부 — 이름 · 기간 · 경험들 (SPEC S-08 · S-09). PC 는 타임라인 옆 패널, 모바일은 전체 화면 + 근거는 하단 시트
import { useState } from "react";
import { ChevronLeftIcon, CircleHelpIcon, RotateCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityDetail, ActivitySummary, SourceStatus } from "@/lib/api/types";
import { durationText, periodText } from "@/lib/period";
import { ActorChip, STATUS, StatusBadge } from "./badges";
import { CitationList } from "./citation-list";
import { ExperienceCard } from "./experience-card";

const FIRST_COUNT = 3;

export type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activity: ActivityDetail };

type Props = {
  summary: ActivitySummary;
  state: DetailState;
  now: number;
  onClose: () => void;
  onRetry: () => void;
};

export function ActivityDetailView({ summary, state, now, onClose, onRetry }: Props) {
  const activity = state.status === "ready" ? state.activity : null;
  const period = activity?.period ?? summary.period;

  return (
    <div className="flex min-h-full flex-col">
      {/* 모바일 — 타임라인으로 돌아가기 */}
      <div className="sticky top-0 z-10 flex min-h-13 items-center border-b border-line bg-surface px-3 lg:hidden">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-0.5 rounded-md py-1 pr-2 text-sm text-ink-2"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          타임라인
        </button>
      </div>

      <header className="grid gap-2 border-b border-line bg-surface px-4 pt-5 pb-3.5 lg:sticky lg:top-0 lg:z-10 lg:px-5.5">
        <div className="flex items-start gap-2">
          <h2 className="m-0 flex-1 text-xl leading-snug font-bold text-balance lg:text-[19px]">
            {activity?.name ?? summary.name}
          </h2>
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onClose} aria-label="세부 닫기">
            <XIcon />
          </Button>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[13px] text-ink-2">
          {periodText(period)}
          <span className="font-sans text-ink-3">{durationText(period, now)}</span>
        </p>
        {activity && <StatusSummary activity={activity} />}
      </header>

      <div className="grid gap-3 px-4 pt-4 pb-7 lg:px-5.5">
        {state.status === "loading" && <p className="text-sm text-ink-3">경험을 불러오고 있어요…</p>}
        {state.status === "error" && (
          <div className="grid justify-items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3.5 text-sm text-danger-ink">
            <p className="m-0">이 활동의 경험을 불러오지 못했어요.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCwIcon />
              다시 시도
            </Button>
          </div>
        )}
        {activity && <ExperienceList key={activity.id} activity={activity} />}
      </div>
    </div>
  );
}

function StatusSummary({ activity }: { activity: ActivityDetail }) {
  const counts = new Map<SourceStatus, number>();
  for (const e of activity.experiences) counts.set(e.sourceStatus, (counts.get(e.sourceStatus) ?? 0) + 1);
  const order: SourceStatus[] = ["SOURCE_CONFIRMED", "USER_ENTERED", "NEEDS_REVIEW"];
  return (
    <p className="m-0 flex flex-wrap gap-2.5 text-xs text-ink-3">
      {order
        .filter((s) => counts.get(s))
        .map((s) => {
          const { label, Icon } = STATUS[s];
          return (
            <span key={s} className="inline-flex items-center gap-1">
              <Icon />
              {label} {counts.get(s)}
            </span>
          );
        })}
    </p>
  );
}

function ExperienceList({ activity }: { activity: ActivityDetail }) {
  const [showAll, setShowAll] = useState(false);
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [sheetId, setSheetId] = useState<number | null>(null);

  const { experiences } = activity;
  const visible = showAll ? experiences : experiences.slice(0, FIRST_COUNT);
  const rest = experiences.length - FIRST_COUNT;
  const sources = [...new Set(experiences.flatMap((e) => e.citations.map((c) => c.sourceName)))];
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
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-ink-3">
        <span>이 활동에서 한 일 {experiences.length}</span>
        <span>자료 {sources.length ? sources.join(", ") : "없음"}</span>
      </div>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {visible.map((e) => (
          <ExperienceCard
            key={e.id}
            experience={e}
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
          className="w-full rounded-lg border border-dashed border-line-2 p-2.5 text-[13px] font-semibold text-ink-2 hover:bg-paper"
        >
          {showAll ? `처음 ${FIRST_COUNT}개만 보기` : `나머지 ${rest}개 더 보기`}
        </button>
      )}
      <p className="m-0 flex items-start gap-1.5 pt-1 text-xs leading-normal text-ink-3">
        <CircleHelpIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          AI 가 자료에서 찾은 결과예요. 「확인 필요」는 원문과 맞는지 한번 봐 주세요. 자료에 없다고 경험이 없는 건
          아니에요.
        </span>
      </p>

      {/* 모바일 — 근거 하단 시트 */}
      <Sheet open={sheetExp != null} onOpenChange={(open) => !open && setSheetId(null)}>
        <SheetContent side="bottom" className="max-h-[75dvh] gap-3 overflow-auto rounded-t-2xl px-4.5 pb-6 lg:hidden">
          {sheetExp && (
            <>
              <SheetHeader className="p-0 pt-4 pr-10">
                <SheetTitle className="text-base font-bold">근거 {sheetExp.citations.length}</SheetTitle>
                <SheetDescription className="text-ink-2">{sheetExp.content}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-1.5">
                <ActorChip actor={sheetExp.actor} />
                <StatusBadge status={sheetExp.sourceStatus} />
              </div>
              <CitationList citations={sheetExp.citations} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
