"use client";

// 경험 하나 — 이 화면의 주인공. 상자 없이 구분선, 근거는 접어 둔다 (SPEC S-08 · DESIGN.md 「경험」)
import { CaretDownIcon, CheckIcon, DotsSixVerticalIcon, DotsThreeIcon, PencilSimpleIcon, QuotesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { COMPETENCIES, type Actor, type Experience, type SourceStatus } from "@/lib/api/types";
import { CitationList } from "./citation-list";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExperienceEditor } from "./experience-editor";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };

/**
 * 출처 상태 — 지우지 않고 낮춘다(ETC#19). 색만이 아니라 아이콘 · 글자로.
 * 원문 확인은 작은 체크 하나(글자는 읽기 도구 · 툴팁), 내가 입력은 흐린 글자, 「확인 필요」만 색이 있는 꼬리표
 */
export function SourceStatusMark({ status }: { status: SourceStatus }) {
  if (status === "SOURCE_CONFIRMED") {
    return (
      <span className="inline-flex items-center text-evidence" title="원문에서 확인한 경험이에요">
        <CheckIcon className="size-[1.15em]" weight="bold" aria-hidden="true" />
        <span className="sr-only">원문 확인</span>
      </span>
    );
  }
  if (status === "USER_ENTERED") {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-soft">
        <PencilSimpleIcon className="size-[1.15em]" aria-hidden="true" />
        내가 입력
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-review-line bg-review-soft py-px pr-2.5 pl-2 text-xs font-semibold text-review">
      <WarningCircleIcon className="size-[1.15em]" aria-hidden="true" />
      확인 필요
    </span>
  );
}

/**
 * 출처 상태 · 수행 주체 · 역량.
 * 「나」는 기본이라 숨기고 팀 · 알 수 없음만 적는다. 역량은 해시태그 — AI 가 붙인 건 점선, 내가 고른 건 실선(ETC#19)
 */
export function ExperienceMeta({ experience: e }: { experience: Experience }) {
  const byAi = e.sourceStatus !== "USER_ENTERED";
  return (
    <>
      <SourceStatusMark status={e.sourceStatus} />
      {e.actor !== "ME" && <span>{ACTOR[e.actor]}</span>}
      {e.competencies.length > 0 && (
        <span
          className="inline-flex flex-wrap gap-1"
          title={byAi ? "AI 가 붙인 역량이에요 — 해석이라 고칠 수 있어요" : undefined}
        >
          {byAi && <span className="sr-only">AI 가 붙인 역량:</span>}
          {e.competencies.map((c) => (
            <span
              key={c}
              className={cn(
                "rounded-full px-2 py-px text-xs font-medium",
                byAi ? "border border-dashed border-muted-soft text-body" : "border border-hairline bg-surface-soft text-body",
              )}
            >
              #{COMPETENCIES[c]}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

type Props = {
  experience: Experience;
  citationsOpen: boolean;
  /** PC — 경험 아래에 근거를 펼친다 */
  onToggleCitations: () => void;
  /** 모바일 — 하단 시트로 근거를 띄운다 */
  onShowCitations: () => void;
  onSaved: (experience: Experience) => void;
  onDelete: (experience: Experience) => void;
  /** 메뉴 「다른 활동으로 옮기기」 — 모바일 · 끌기 어려운 곳 (S-12) */
  onMove: (experience: Experience) => void;
  /** PC — 손잡이를 끌어 타임라인의 다른 활동 위에 놓는다 (S-12) */
  onDragChange: (experience: Experience | null) => void;
  dragging: boolean;
};

export function ExperienceItem({ experience, citationsOpen, onToggleCitations, onShowCitations, onSaved, onDelete, onMove, onDragChange, dragging }: Props) {
  const [editing, setEditing] = useState(false);
  const e = experience;
  const n = e.citations.length;
  const citeBtn =
    "ml-auto inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-evidence hover:bg-evidence-soft";
  return (
    <li className={cn("group relative grid gap-1.5 border-b border-hairline py-4", dragging && "opacity-40")}>
      {!editing && (
        <span
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(e.id));
            const li = ev.currentTarget.parentElement;
            if (li) ev.dataTransfer.setDragImage(li, 16, 16);
            onDragChange(e);
          }}
          onDragEnd={() => onDragChange(null)}
          title="끌어서 타임라인의 다른 활동에 놓으면 옮겨져요"
          aria-hidden="true"
          data-testid={`drag-${e.id}`}
          className="absolute top-4.5 -left-6 hidden h-7 w-5 cursor-grab items-center justify-center rounded-sm text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-strong active:cursor-grabbing lg:flex"
        >
          <DotsSixVerticalIcon className="size-4" />
        </span>
      )}
      {editing ? <ExperienceEditor experience={e} onCancel={() => setEditing(false)} onSaved={(result) => { onSaved(result); setEditing(false); }} /> : (
        <div className="flex items-start gap-2">
          <p className="m-0 flex-1 whitespace-pre-wrap text-base leading-relaxed text-ink">{e.content}</p>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`경험 수정: ${e.content}`}>수정</Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label={`경험 메뉴: ${e.content}`}><DotsThreeIcon /></Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-32 rounded-md border border-hairline bg-canvas p-1 shadow-float">
                <DropdownMenu.Item onSelect={() => setEditing(true)} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm outline-none focus:bg-surface-soft">고치기</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => onMove(e)} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm outline-none focus:bg-surface-soft">다른 활동으로 옮기기</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => onDelete(e)} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm text-error outline-none focus:bg-surface-soft">지우기</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted">
        <ExperienceMeta experience={e} />
        {n === 0 ? (
          <span className="ml-auto text-muted-soft">근거 없음</span>
        ) : (
          <>
            <button
              type="button"
              className={cn(citeBtn, "hidden lg:inline-flex")}
              aria-expanded={citationsOpen}
              onClick={onToggleCitations}
            >
              <QuotesIcon className="size-[1.15em]" aria-hidden="true" />
              근거 {n}
              <CaretDownIcon
                className={cn("size-[1.15em] transition-transform", citationsOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            <button type="button" className={cn(citeBtn, "lg:hidden")} onClick={onShowCitations}>
              <QuotesIcon className="size-[1.15em]" aria-hidden="true" />
              근거 {n}
            </button>
          </>
        )}
      </div>
      {citationsOpen && (
        <div className="mt-1.5 hidden lg:block">
          <CitationList citations={e.citations} />
        </div>
      )}
    </li>
  );
}
