"use client";

// 경험 하나 — 이 화면의 주인공. 상자 없이 구분선, 근거는 접어 둔다 (SPEC S-08 · DESIGN.md 「경험」)
import { CaretDownIcon, CheckIcon, DotsThreeIcon, PencilSimpleIcon, QuotesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { COMPETENCIES, type Actor, type Experience, type SourceStatus } from "@/lib/api/types";
import { CitationList } from "./citation-list";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExperienceEditor } from "./experience-editor";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };

/** 출처 상태 — 색만이 아니라 아이콘 · 글자로. 색이 있는 꼬리표는 「확인 필요」 하나 */
export function SourceStatusMark({ status }: { status: SourceStatus }) {
  if (status === "SOURCE_CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-0.5 text-evidence">
        <CheckIcon className="size-[1.15em]" aria-hidden="true" />
        원문 확인
      </span>
    );
  }
  if (status === "USER_ENTERED") {
    return (
      <span className="inline-flex items-center gap-0.5">
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

/** 수행 주체 · 역량 · 출처 상태 */
export function ExperienceMeta({ experience: e }: { experience: Experience }) {
  const sep = <span className="text-hairline">·</span>;
  return (
    <>
      <span>{ACTOR[e.actor]}</span>
      {e.competencies.length > 0 && (
        <>
          {sep}
          <span>
            {e.sourceStatus !== "USER_ENTERED" && <span
              className="mr-1 inline-block rounded-[4px] border border-hairline px-1 align-[1px] text-[10px] leading-[15px] font-bold tracking-[0.02em]"
              title="AI 가 붙인 역량 — 해석이에요"
            >
              AI
            </span>}
            {e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}
          </span>
        </>
      )}
      {sep}
      <SourceStatusMark status={e.sourceStatus} />
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
};

export function ExperienceItem({ experience, citationsOpen, onToggleCitations, onShowCitations, onSaved, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const e = experience;
  const n = e.citations.length;
  const citeBtn =
    "ml-auto inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-evidence hover:bg-evidence-soft";
  return (
    <li className="grid gap-1.5 border-b border-hairline py-4">
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
