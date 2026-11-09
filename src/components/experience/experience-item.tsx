"use client";

// 경험 하나 — 이 화면의 주인공. 상자 없이 구분선, 근거는 접어 둔다 (SPEC S-08 · DESIGN.md 「경험」)
import { BookmarkSimpleIcon, CaretDownIcon, CheckIcon, DotsSixVerticalIcon, DotsThreeIcon, PencilSimpleIcon, QuotesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { COMPETENCIES, type Actor, type Experience, type SourceStatus } from "@/lib/api/types";
import { CitationList } from "./citation-list";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActorField, CompetencyField, ExperienceContentField } from "./inline-edit";
import { ExperienceMcpChange } from "./experience-mcp-change";
import { SAVE_ERROR, useExperienceSave } from "./experience-save";
import { MENU_ITEM, MenuCheckBox, ProfileMenuItems, ProfileShareNote, useProfileShare } from "./profile-toggle";
import { SupplementList } from "./supplement-list";
import { UsedInChip, UsedInList } from "./used-in";

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

/** 활동 세부의 경험 줄 — 원문 확인 · 내가 입력은 부가 정보라 근거 옆에 아이콘만 둔다(글자는 툴팁 · 읽기 프로그램).
 *  「확인 필요」는 사용자가 할 일이 있어 꼬리표 그대로(FE#293) */
export function SourceStatusIcon({ status }: { status: SourceStatus }) {
  if (status === "NEEDS_REVIEW") return <SourceStatusMark status={status} />;
  const confirmed = status === "SOURCE_CONFIRMED";
  const Icon = confirmed ? CheckIcon : PencilSimpleIcon;
  return (
    <span title={confirmed ? "원문 확인 — 자료 원문에서 확인한 경험이에요" : "내가 입력 — 직접 쓰거나 고친 경험이에요"} className={cn("inline-flex items-center", confirmed && "text-evidence")}>
      <Icon className="size-[1.15em]" weight={confirmed ? "bold" : "regular"} aria-hidden="true" />
      <span className="sr-only">{confirmed ? "원문 확인" : "내가 입력"}</span>
    </span>
  );
}

// BE 전환 기간에만 필드 누락 시 기존 규칙을 사용한다.
const isAiCompetency = (e: Pick<Experience, "competenciesBy" | "sourceStatus">) =>
  e.competenciesBy === undefined ? e.sourceStatus !== "USER_ENTERED" : e.competenciesBy === "AI";

/** 수행 주체 · 출처 상태 · 역량 — AI 표시는 부가 정보라 맨 뒤. 고칠 수 있는 줄(edit)에선 출처 상태를 빼고 근거 옆 아이콘으로(FE#293) */
export function ExperienceMeta({ experience: e, aiLabel = "AI", edit }: {
  experience: Pick<Experience, "actor" | "competencies" | "competenciesBy" | "sourceStatus" | "origin">;
  aiLabel?: string;
  /** 주면 수행 주체 · 역량을 눌러 그 자리에서 고친다 (S-10) */
  edit?: { experience: Experience; onSaved: (experience: Experience) => void };
}) {
  const sep = <span className="text-hairline">·</span>;
  const aiMark = isAiCompetency(e) && <span
    className="ml-1 inline-block rounded-[4px] border border-hairline px-1 align-[1px] text-xs leading-[15px] font-bold tracking-[0.02em]"
    title="AI 가 붙인 역량 — 해석이에요"
  >
    {aiLabel}
  </span>;
  return (
    <>
      {edit ? <ActorField experience={edit.experience} onSaved={edit.onSaved} /> : <span>{ACTOR[e.actor]}</span>}
      {e.origin?.type === "ANSWER" ? <>{sep}<Link href={`/questions?question=${e.origin.questionId}`} className="min-w-0 break-words underline-offset-3 hover:underline">내가 쓴 지원서 · {e.origin.organization || "지원처 미입력"} · {e.origin.questionText}</Link></>
        : !edit && <>{sep}<SourceStatusMark status={e.sourceStatus} /></>}
      {edit ? <>{sep}<CompetencyField experience={edit.experience} aiMark={aiMark} onSaved={edit.onSaved} /></> : e.competencies.length > 0 && (
        <>
          {sep}
          <span>
            {e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}
            {aiMark}
          </span>
        </>
      )}
    </>
  );
}

/** 미리 보기의 속성 목록 — 한 줄에 몰지 않고 칸마다 나눈다. 역량이 AI 해석이면 그 칸에만 적는다 */
export function ExperienceProperties({ experience: e, period }: {
  experience: Pick<Experience, "actor" | "competencies" | "competenciesBy" | "sourceStatus" | "origin">;
  period: string;
}) {
  const rows: [string, React.ReactNode][] = [
    ["기간", <span key="period" className="tabular-nums">{period}</span>],
    ["수행", ACTOR[e.actor]],
    ["출처", <SourceStatusMark key="source" status={e.sourceStatus} />],
  ];
  if (e.competencies.length > 0) rows.push(["역량", <>
    {e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}
    {isAiCompetency(e) && <span className="ml-1.5 text-xs text-muted">AI 해석</span>}
  </>]);
  return (
    <dl className="m-0 grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 py-1 text-note">
      {rows.map(([label, value]) => <div key={label} className="contents">
        <dt className="text-muted">{label}</dt>
        <dd className="m-0 min-w-0 break-words text-body">{value}</dd>
      </div>)}
    </dl>
  );
}

type Props = {
  readOnly?: boolean;
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
  /** 메뉴 「다른 경험과 합치기」(S-70) — 같은 활동에 다른 경험이 없으면 undefined 로 숨긴다 */
  onMerge?: (experience: Experience) => void;
  /** PC — 손잡이를 끌어 타임라인의 다른 활동 위에 놓는다 (S-12) */
  onDragChange: (experience: Experience | null) => void;
  dragging: boolean;
};

export function ExperienceItem({ experience, citationsOpen, onToggleCitations, onShowCitations, onSaved, onDelete, onMove, onMerge, onDragChange, dragging, readOnly = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [usedInOpen, setUsedInOpen] = useState(false);
  const e = experience;
  const share = useProfileShare(e, onSaved);
  const save = useExperienceSave(e, (saved) => onSaved({ ...e, saved }));
  const usedIn = e.usedIn ?? [];
  const n = e.citations.length;
  const citeBtn =
    "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-note font-semibold text-evidence hover:bg-evidence-soft";
  return (
    <li id={`experience-${e.id}`} className={cn("group relative grid gap-1.5 border-b border-hairline py-4", dragging && "opacity-40")}>
      {!editing && !readOnly && (
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
      {usedIn.length > 0 && <div className="flex">
        <UsedInChip usedIn={usedIn} open={usedInOpen} onToggle={() => setUsedInOpen((v) => !v)} controls={`used-in-${e.id}`} />
      </div>}
      {usedInOpen && usedIn.length > 0 && <UsedInList usedIn={usedIn} id={`used-in-${e.id}`} />}
      <div className="flex items-start gap-2">
          <ExperienceContentField experience={e} readOnly={readOnly} onEditingChange={setEditing}
            onSaved={(result) => onSaved({ ...result, usedIn: result.usedIn ?? e.usedIn })} />
          {!readOnly && <>
          {/* 저장 · 프로필에 넣기는 「…」 메뉴 안(FE#272 · FE#293). 저장한 경험은 표시만 — 누르는 건 메뉴에서 */}
          {save.saved && !editing && <span title="저장한 경험이에요" className="flex h-11 shrink-0 items-center text-ink">
            <BookmarkSimpleIcon className="size-4" weight="fill" aria-hidden="true" /><span className="sr-only">저장함</span>
          </span>}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label={`경험 메뉴: ${e.content}`}><DotsThreeIcon /></Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              {/* 순서: 켜고 끄는 것(저장 · 프로필) → 옮기기 · 합치기 → 지우기. 본문 고치기는 본문을 누르면 돼서 메뉴에 없다(FE#293) */}
              <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-md border border-hairline bg-canvas p-1 shadow-float">
                <DropdownMenu.CheckboxItem checked={save.saved} disabled={save.busy} onSelect={() => void save.toggle()} className={MENU_ITEM}><MenuCheckBox />저장</DropdownMenu.CheckboxItem>
                <ProfileMenuItems share={share} />
                <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                <DropdownMenu.Item onSelect={() => onMove(e)} className={MENU_ITEM}>다른 활동으로 옮기기</DropdownMenu.Item>
                {onMerge && <DropdownMenu.Item onSelect={() => onMerge(e)} className={MENU_ITEM}>다른 경험과 합치기</DropdownMenu.Item>}
                <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                <DropdownMenu.Item onSelect={() => onDelete(e)} className={cn(MENU_ITEM, "text-error")}>지우기</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root></>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted">
        <ExperienceMeta experience={e} edit={readOnly ? undefined : { experience: e, onSaved: (result) => onSaved({ ...result, usedIn: result.usedIn ?? e.usedIn }) }} />
        <span className="ml-auto inline-flex items-center gap-1.5">
        {!readOnly && e.origin?.type !== "ANSWER" && <SourceStatusIcon status={e.sourceStatus} />}
        {n === 0 ? (
          <span className="text-muted">근거 없음</span>
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
        </span>
      </div>
      {<ExperienceMcpChange experience={e} readOnly={readOnly} onSaved={onSaved} />}
      {!readOnly && <ProfileShareNote share={share} />}
      {!readOnly && save.error && <p role="alert" className="m-0 text-note font-medium text-error">{SAVE_ERROR}</p>}
      {citationsOpen && (
        <div className="mt-1.5 hidden lg:block">
          <CitationList citations={e.citations} readOnly={readOnly} />
        </div>
      )}
      {(readOnly ? <SupplementList supplements={e.supplements ?? []} /> : <SupplementList supplements={e.supplements ?? []}
        onSaved={(s) => onSaved({ ...e, supplements: (e.supplements ?? []).map((x) => x.id === s.id ? s : x) })}
        onDeleted={(id) => onSaved({ ...e, supplements: (e.supplements ?? []).filter((x) => x.id !== id) })} />)}
    </li>
  );
}
