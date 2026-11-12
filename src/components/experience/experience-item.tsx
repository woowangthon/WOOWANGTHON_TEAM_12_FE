"use client";

// 경험 하나 — 이 화면의 주인공. 상자 없이 구분선, 메타 · STAR · 근거 · 내 답은 접어 둔다 (SPEC S-08 · DESIGN.md 「경험」 · FE#541)
import { BookmarkSimpleIcon, CaretDownIcon, DotsSixVerticalIcon, DotsThreeIcon, QuotesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { COMPETENCIES, type Actor, type Experience, type SourceStatus, type Supplement } from "@/lib/api/types";
import { CitationList } from "./citation-list";
import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActorField, CompetencyField, ExperienceContentField } from "./inline-edit";
import { ExperienceMcpChange } from "./experience-mcp-change";
import { SAVE_ERROR, useExperienceSave } from "./experience-save";
import { MENU_ITEM, MenuCheckBox, ProfileMenuItems, ProfileShareNote, useProfileShare } from "./profile-toggle";
import { SupplementList } from "./supplement-list";
import { UsedInChip, UsedInList } from "./used-in";
import { hasStarSlots, StarPanel, StarStatus } from "./star-slots";
import { AiMark } from "@/components/ui/ai-mark";
import { MENU_CONTENT } from "@/components/ui/menu";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };

/** 출처 상태는 데이터에 남기고 「확인 필요」만 아이콘 · 글자로 보인다(ADR-018 · FE#513). */
export function SourceStatusMark({ status }: { status: SourceStatus }) {
  if (status !== "NEEDS_REVIEW") return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-review-line bg-review-soft py-px pr-2.5 pl-2 text-xs font-semibold text-review">
      <WarningCircleIcon className="size-[1.15em]" aria-hidden="true" />
      확인 필요
    </span>
  );
}

// BE 전환 기간에만 필드 누락 시 기존 규칙을 사용한다.
const isAiCompetency = (e: Pick<Experience, "competenciesBy" | "sourceStatus">) =>
  e.competenciesBy === undefined ? e.sourceStatus !== "USER_ENTERED" : e.competenciesBy === "AI";

type MetaFields = Pick<Experience, "actor" | "competencies" | "competenciesBy" | "sourceStatus" | "origin">;

/** 예외만 보이는 메타(FE#510) — 수행 주체는 팀 · 알 수 없음일 때만, 출처 상태는 확인 필요일 때만 */
export const hasQuietMeta = (e: MetaFields) =>
  e.actor !== "ME" || e.origin?.type === "ANSWER" || e.sourceStatus === "NEEDS_REVIEW" || e.competencies.length > 0;

/** 수행 주체 · 확인 필요 · 역량 — AI 표시는 맨 뒤. 고칠 수 있는 줄(edit)에선 확인 필요를 근거 옆에 둔다. */
export function ExperienceMeta({ experience: e, edit, noSource, quiet }: {
  experience: MetaFields;
  /** 확인 필요를 근거 옆에 따로 둘 때 — 꺼내기 답(FE#363) */
  noSource?: boolean;
  /** 예외만 보인다 — 나 · 원문 확인 · 내가 입력은 감춘다. 꺼내 쓸 경험 카드(FE#510). 고치는 줄(edit)엔 쓰지 않는다 */
  quiet?: boolean;
  /** 주면 수행 주체 · 역량을 눌러 그 자리에서 고친다 (S-10) */
  edit?: { experience: Experience; onSaved: (experience: Experience) => void };
}) {
  const aiMark = isAiCompetency(e) && <AiMark className="ml-1" title="AI 가 붙인 역량 — 해석이에요" />;
  const parts: React.ReactNode[] = [];
  if (edit) parts.push(<ActorField key="actor" experience={edit.experience} onSaved={edit.onSaved} />);
  else if (!quiet || e.actor !== "ME") parts.push(<span key="actor">{ACTOR[e.actor]}</span>);
  if (e.origin?.type === "ANSWER") parts.push(<Link key="origin" href={`/questions?question=${e.origin.questionId}`} className="min-w-0 break-words underline-offset-3 hover:underline">내가 쓴 지원서 · {e.origin.organization || "지원처 미입력"} · {e.origin.questionText}</Link>);
  if (!edit && !noSource && e.sourceStatus === "NEEDS_REVIEW") parts.push(<SourceStatusMark key="source" status={e.sourceStatus} />);
  if (edit) parts.push(<CompetencyField key="competency" experience={edit.experience} aiMark={aiMark} onSaved={edit.onSaved} />);
  else if (e.competencies.length > 0) parts.push(<span key="competency">
    {e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}
    {aiMark}
  </span>);
  return <>{parts.map((part, i) => <Fragment key={i}>{i > 0 && <span className="text-hairline">·</span>}{part}</Fragment>)}</>;
}

/** 미리 보기의 속성 목록 — 한 줄에 몰지 않고 칸마다 나눈다. 역량이 AI 해석이면 그 칸에만 적는다 */
export function ExperienceProperties({ experience: e, period }: {
  experience: Pick<Experience, "actor" | "competencies" | "competenciesBy" | "sourceStatus" | "origin">;
  period: string;
}) {
  const rows: [string, React.ReactNode][] = [
    ["기간", <span key="period" className="tabular-nums">{period}</span>],
    ["수행", ACTOR[e.actor]],
  ];
  if (e.sourceStatus === "NEEDS_REVIEW") rows.push(["출처", <SourceStatusMark key="source" status={e.sourceStatus} />]);
  if (e.competencies.length > 0) rows.push(["역량", <>
    {e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}
    {isAiCompetency(e) && <AiMark className="ml-1.5" title="AI 가 붙인 역량 — 해석이에요" />}
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
  /** PC — 이 줄을 아래로 펼쳤나(한 번에 한 경험 — FE#541) */
  open: boolean;
  /** PC — 줄 아래로 펼치고 접는다 */
  onToggle: () => void;
  /** 모바일 — 펼친 내용을 하단 시트로 띄운다 */
  onShowSheet: () => void;
  /** FAILED 「다시 시도」 — 활동 단위(계약) */
  onRetryStar?: () => void;
  retryingStar?: boolean;
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

/** STAR 칸을 채운 보완 ID — 그 보완은 STAR 칸에서만 보이고 고친다(FE#541 · experience-api.md 「STAR 칸」 sourceType · sourceId) */
const starSupplementIds = (e: Experience) => new Set(hasStarSlots(e.star)
  ? e.star.slots.flatMap((s) => s.sourceType === "SUPPLEMENT" && s.sourceId !== null ? [s.sourceId] : []) : []);

/** 보완을 고치거나 지운 결과를 경험에 반영한다 */
const supplementHandlers = (e: Experience, onSaved: (experience: Experience) => void) => ({
  onSaved: (s: Supplement) => onSaved({ ...e, supplements: (e.supplements ?? []).map((x) => x.id === s.id ? s : x) }),
  onDeleted: (id: number) => onSaved({ ...e, supplements: (e.supplements ?? []).filter((x) => x.id !== id) }),
});

/** 활동 세부의 경험 줄(FE#541). 접힌 줄엔 본문 + 예외만 — 수행 주체 팀 · 알 수 없음, 「확인 필요」, 지원서에 쓰임, 맞아요 대기 답.
 *  나 · 역량 · 근거 수 · STAR 점은 펼쳐야 보인다(ExperienceDetail). 본문을 누르면 그 자리 고치기, 펼침은 오른쪽 끝 꺾쇠 */
export function ExperienceItem({ experience, open, onToggle, onShowSheet, onRetryStar, retryingStar, onSaved, onDelete, onMove, onMerge, onDragChange, dragging, readOnly = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [usedInOpen, setUsedInOpen] = useState(false);
  const e = experience;
  const share = useProfileShare(e, onSaved);
  const save = useExperienceSave(e, (saved) => onSaved({ ...e, saved }));
  const usedIn = e.usedIn ?? [];
  const pendingAnswers = (e.supplements ?? []).filter((s) => s.mcpChange);
  // 팀 · 알 수 없음은 접힌 줄에서도 그 자리에서 고친다(알 수 없음은 「누가 했나요?」). 펼치면 펼친 칸에서 고치니 여기선 뺀다
  const exceptions: React.ReactNode[] = [];
  if (e.actor !== "ME" && !open) exceptions.push(readOnly ? <span key="actor">{ACTOR[e.actor]}</span> : <ActorField key="actor" experience={e} onSaved={onSaved} />);
  if (e.origin?.type === "ANSWER") exceptions.push(<Link key="origin" href={`/questions?question=${e.origin.questionId}`} className="min-w-0 break-words underline-offset-3 hover:underline">내가 쓴 지원서 · {e.origin.organization || "지원처 미입력"} · {e.origin.questionText}</Link>);
  if (e.sourceStatus === "NEEDS_REVIEW") exceptions.push(<SourceStatusMark key="source" status={e.sourceStatus} />);
  const caret = "size-11 shrink-0 text-muted hover:text-ink lg:size-10";
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
      <div className="flex items-start gap-1">
        <ExperienceContentField experience={e} readOnly={readOnly} onEditingChange={setEditing} onSaved={onSaved} />
        {!readOnly && <>
          {/* 저장 · 프로필에 넣기는 「…」 메뉴 안(FE#272 · FE#293). 저장한 경험은 표시만 — 누르는 건 메뉴에서 */}
          {save.saved && !editing && <span title="저장한 경험이에요" className="flex h-11 lg:h-10 shrink-0 items-center px-1 text-ink">
            <BookmarkSimpleIcon className="size-4" weight="fill" aria-hidden="true" /><span className="sr-only">저장함</span>
          </span>}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="size-11 lg:size-10" title="더 보기" aria-label={`경험 메뉴: ${e.content}`}><DotsThreeIcon /></Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              {/* 순서: 켜고 끄는 것(저장 · 프로필) → 옮기기 · 합치기 → 지우기. 본문 고치기는 본문을 누르면 돼서 메뉴에 없다(FE#293) */}
              <DropdownMenu.Content align="end" sideOffset={4} className={cn(MENU_CONTENT, "z-50 min-w-44")}>
                <DropdownMenu.CheckboxItem checked={save.saved} disabled={save.busy} onSelect={() => void save.toggle()} className={MENU_ITEM}><MenuCheckBox />저장</DropdownMenu.CheckboxItem>
                <ProfileMenuItems share={share} />
                <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                <DropdownMenu.Item onSelect={() => onMove(e)} className={MENU_ITEM}>다른 활동으로 옮기기</DropdownMenu.Item>
                {onMerge && <DropdownMenu.Item onSelect={() => onMerge(e)} className={MENU_ITEM}>다른 경험과 합치기</DropdownMenu.Item>}
                <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                <DropdownMenu.Item onSelect={() => onDelete(e)} className={cn(MENU_ITEM, "text-error")}>지우기</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>}
        {/* 펼침 — 본문 누르기(고치기)와 겹치지 않게 오른쪽 끝 꺾쇠만. PC 는 줄 아래, 모바일은 하단 시트 */}
        {!editing && <>
          <Button variant="ghost" size="icon" className={cn(caret, "hidden lg:inline-flex")} aria-expanded={open} aria-controls={`experience-detail-${e.id}`}
            title={open ? "접기" : "자세히"} aria-label={`${open ? "접기" : "자세히"}: ${e.content}`} onClick={onToggle}>
            <CaretDownIcon className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className={cn(caret, "lg:hidden")} title="자세히" aria-label={`자세히: ${e.content}`} onClick={onShowSheet}>
            <CaretDownIcon aria-hidden="true" />
          </Button>
        </>}
      </div>
      {exceptions.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted">
        {exceptions.map((part, i) => <Fragment key={i}>{i > 0 && <span className="text-hairline">·</span>}{part}</Fragment>)}
      </div>}
      <ExperienceMcpChange experience={e} readOnly={readOnly} onSaved={onSaved} />
      {!readOnly && <ProfileShareNote share={share} />}
      {!readOnly && save.error && <p role="alert" className="m-0 text-note font-medium text-error">{SAVE_ERROR}</p>}
      {/* 외부 AI 가 전한 답은 맞아요를 기다리는 예외라 접혀 있어도 보인다(S-56). 펼치면 펼친 자리에서 */}
      {!open && (readOnly ? <SupplementList supplements={pendingAnswers} />
        : <SupplementList supplements={pendingAnswers} {...supplementHandlers(e, onSaved)} />)}
      {open && <div id={`experience-detail-${e.id}`} className="mt-1.5 hidden lg:block">
        <ExperienceDetail experience={e} readOnly={readOnly} onSaved={onSaved} onRetryStar={onRetryStar} retryingStar={retryingStar} />
      </div>}
    </li>
  );
}

const SECTION = "m-0 text-xs font-semibold text-ink";

/** 펼친 경험 — 수행 주체 · 역량(고치기) → STAR 칸 → 근거 → 내 답(STAR 칸에 안 들어간 보완). PC 는 줄 아래, 모바일은 하단 시트 */
export function ExperienceDetail({ experience: e, readOnly = false, onSaved, onRetryStar, retryingStar }: {
  experience: Experience;
  readOnly?: boolean;
  onSaved: (experience: Experience) => void;
  onRetryStar?: () => void;
  retryingStar?: boolean;
}) {
  const citations = useRef<HTMLElement>(null);
  // 읽기 전용 화면엔 STAR 칸이 없으니 보완을 거르지 않는다
  const inStar = readOnly ? new Set<number>() : starSupplementIds(e);
  const answers = (e.supplements ?? []).filter((s) => !s.mcpChange && !inStar.has(s.id));
  const pending = (e.supplements ?? []).filter((s) => s.mcpChange);
  const n = e.citations.length;
  // 지원서 출처 · 확인 필요는 접힌 줄에 있다 — 여기선 수행 주체 · 역량만
  const meta = { ...e, origin: null };
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted">
      {readOnly ? <ExperienceMeta experience={meta} noSource /> : <ExperienceMeta experience={meta} edit={{ experience: e, onSaved }} />}
    </div>
    {!readOnly && (hasStarSlots(e.star)
      ? <StarPanel experience={e} onSaved={onSaved} onRetry={onRetryStar} retrying={retryingStar}
        onShowCitations={() => citations.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })} />
      : <StarStatus star={e.star} onRetry={onRetryStar} retrying={retryingStar} />)}
    <section ref={citations} aria-label={`근거 ${n}`} className="grid gap-2">
      <p className={cn(SECTION, "inline-flex items-center gap-1")}><QuotesIcon className="size-[1.15em] text-evidence" aria-hidden="true" />근거 {n}</p>
      {n === 0 ? <p className="m-0 text-note text-muted">근거 없음</p> : <CitationList citations={e.citations} readOnly={readOnly} />}
    </section>
    {/* 비어도 둔다 — 맞아요 · 되돌리기 결과 글이 이 목록 안에 남는다 */}
    {(readOnly ? <SupplementList supplements={pending} /> : <SupplementList supplements={pending} {...supplementHandlers(e, onSaved)} />)}
    {answers.length > 0 && <section aria-label="내 답" className="grid gap-2">
      <p className={SECTION}>내 답</p>
      {readOnly ? <SupplementList supplements={answers} /> : <SupplementList supplements={answers} {...supplementHandlers(e, onSaved)} />}
    </section>}
  </div>;
}
