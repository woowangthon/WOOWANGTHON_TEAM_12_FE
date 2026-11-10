"use client";

// 수정 이력(S-80 · ADR-013 · revision-api.md) — 언제 · 누가(나 / 외부 AI) · 무엇이 바뀌었나, 줄마다 「이 수정 전으로」.
// 「최근 수정」(헤더 — 전체)과 「수정 이력」(경험 · 활동 메뉴, 답칸 줄 — 그 항목만)이 같이 쓴다.
// 줄은 세로선 타임라인에 접어 두고 한 줄 요약만 보인다 — 펼치면 바뀐 부분만 강조한 글 · 짧은 값 · 되돌리기(FE#413)
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowsClockwiseIcon, CaretDownIcon, ClockCounterClockwiseIcon, RobotIcon, UserIcon } from "@phosphor-icons/react";
import { diff } from "@/components/questions/draft-match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { timestamp } from "@/components/connections/mcp-changes";
import { ApiError } from "@/lib/api/errors";
import { mcpClientName } from "@/lib/api/mcp";
import { fetchRevisions, restoreRevision, type RestoreResult, type Revision, type RevisionTarget, type RevisionTargetType } from "@/lib/api/revisions";
import { COMPETENCIES, type Actor, type SourceStatus } from "@/lib/api/types";
import { periodText } from "@/lib/period";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };
const SOURCE: Record<SourceStatus, string> = { SOURCE_CONFIRMED: "원문 확인", USER_ENTERED: "내가 입력", NEEDS_REVIEW: "확인 필요" };

/** 되돌리기 전에 알릴 것 — 무엇이 돌아가나 */
const RESTORE_NOTE: Record<RevisionTargetType, string> = {
  EXPERIENCE: "본문 · 수행 주체 · 역량 · 출처 상태가 이 수정 전으로 돌아가요. 근거 · 보완은 그대로예요.",
  ACTIVITY: "이름 · 기간이 이 수정 전으로 돌아가요. 분류 · 계기는 그대로예요.",
  ANSWER: "그때 글이 답칸에 들어가요. 다 쓴 답은 「다 썼어요」를 다시 눌러야 바뀌어요.",
};

/** 그 항목으로 가는 주소 — 지운 항목은 갈 곳이 없다. 이름은 줄 머리에 있으니 링크는 짧게 */
function targetLink(r: Revision): { href: string; label: string } | null {
  if (r.target.deleted) return null;
  if (r.targetType === "EXPERIENCE") return { href: `/experience?experience=${r.targetId}`, label: "그 경험 보기" };
  if (r.targetType === "ACTIVITY") return { href: `/experience?activity=${r.targetId}`, label: "그 활동 보기" };
  return { href: `/questions?question=${r.targetId}`, label: "그 답 보기" };
}

function targetName(r: Revision) {
  if (r.targetType === "EXPERIENCE") return `경험 · ${r.target.activityName ?? "활동"}`;
  if (r.targetType === "ACTIVITY") return `활동 · ${r.after.name ?? r.before.name ?? ""}`;
  return `지원서 · ${r.target.organization || "지원처 미입력"} · ${r.target.questionText ?? "문항"}`;
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const TEXT_KEY = { EXPERIENCE: "content", ACTIVITY: "name", ANSWER: "text" } as const;
const TEXT_NAME: Record<RevisionTargetType, string> = { EXPERIENCE: "본문", ACTIVITY: "이름", ANSWER: "답" };
/** 받침이 있으면 「을」 — 역량을 · 수행 주체를 */
const object = (word: string) => { const c = word.charCodeAt(word.length - 1) - 0xac00; return `${word}${c >= 0 && c < 11172 && c % 28 ? "을" : "를"}`; };

/** 짧은 값(주체 · 역량 · 출처 · 기간) 중 바뀐 것 — [이름, 전, 뒤] */
function fieldChanges({ before: b, after: a, targetType }: Revision): [string, string, string][] {
  const lines: [string, string, string][] = [];
  if (targetType === "EXPERIENCE") {
    if (b.actor && a.actor && b.actor !== a.actor) lines.push(["수행 주체", ACTOR[b.actor], ACTOR[a.actor]]);
    if (!same(b.competencies, a.competencies)) lines.push(["역량", (b.competencies ?? []).map(c => COMPETENCIES[c]).join(" · ") || "없음", (a.competencies ?? []).map(c => COMPETENCIES[c]).join(" · ") || "없음"]);
    if (b.sourceStatus && a.sourceStatus && b.sourceStatus !== a.sourceStatus) lines.push(["출처 상태", SOURCE[b.sourceStatus], SOURCE[a.sourceStatus]]);
  }
  if (targetType === "ACTIVITY" && b.period && a.period && !same(b.period, a.period)) lines.push(["기간", periodText(b.period), periodText(a.period)]);
  return lines;
}

const blank = (s: string) => s !== "" && !s.trim();
const word = (c: string | undefined) => !!c && !/\s/.test(c);

/** 바뀐 곳 — diff() 는 글자 단위라 「맡았|다」처럼 낱말 가운데서 끊긴다. 낱말 안에서 시작 · 끝나면 그 낱말 끝까지 넓힌다 */
function wordDiff(b: string, a: string) {
  const d = diff(b, a);
  let start = d.start, endB = d.end, endA = a.length - (b.length - d.end);
  if (word(b[start - 1]) && ((start < endB && word(b[start])) || (start < endA && word(a[start])))) while (word(b[start - 1])) start--;
  if (word(b[endB]) && ((endB > start && word(b[endB - 1])) || (endA > start && word(a[endA - 1])))) while (word(b[endB])) { endB++; endA++; }
  return { start, end: endB, inserted: a.slice(start, endA) };
}

/** 줄 머리의 한 줄 요약 — 무엇을 어떻게 바꿨나. 본문을 고치면 출처 상태는 늘 같이 바뀌니 그땐 요약에 넣지 않는다(펼치면 보인다) */
function summary(r: Revision) {
  if (r.kind === "RESTORE") return r.targetType === "ANSWER" ? "그때 답을 답칸에 되돌렸어요 · 임시 글" : "이 수정 전으로 되돌렸어요";
  if (r.kind === "CONFIRM") return "답을 다 썼어요";
  if (r.kind === "DRAFT_OVERWRITE") return "초안을 답칸에 넣었어요";
  const key = TEXT_KEY[r.targetType], name = TEXT_NAME[r.targetType];
  const b = r.before[key] ?? "", a = r.after[key] ?? "";
  const fields = fieldChanges(r).map(f => f[0]);
  if (b === a) return fields.length ? `${object(fields.join(" · "))} 바꿨어요` : "고쳤어요";
  const d = wordDiff(b, a), removed = b.slice(d.start, d.end);
  const text = !(removed + d.inserted).trim() ? `${name} 띄어쓰기를 고쳤어요`
    : !removed ? `${name}에 글을 더했어요` : !d.inserted ? `${name}에서 글을 지웠어요` : `${object(name)} 고쳤어요`;
  const rest = fields.filter(f => f !== "출처 상태");
  return rest.length ? `${text} · ${rest.join(" · ")}도 바뀜` : text;
}

/** 바뀐 곳 앞뒤로 남길 글자 수 — 긴 글은 그 밖을 「…」로 접는다 */
const CONTEXT = 60;

/** 글 차이 — 한 글 안에서 지운 곳은 취소선, 더한 곳은 초록 바탕. 띄어쓰기만 바뀌어도 보이게 빈칸에 폭을 준다 */
function TextDiff({ before, after }: { before: string; after: string }) {
  const d = wordDiff(before, after);
  let head = before.slice(0, d.start), tail = before.slice(d.end);
  const removed = before.slice(d.start, d.end);
  if (head.length > CONTEXT) head = `…${head.slice(-CONTEXT)}`;
  if (tail.length > CONTEXT) tail = `${tail.slice(0, CONTEXT)}…`;
  return <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-body">
    {head}
    {removed && <del className={cn("bg-surface-soft text-muted decoration-muted", blank(removed) && "px-1")}><span className="sr-only">지운 글: </span>{removed}</del>}
    {d.inserted && <ins className={cn("bg-added-soft text-ink no-underline", blank(d.inserted) && "px-1", removed && "ml-1")}><span className="sr-only">더한 글: </span>{d.inserted}</ins>}
    {tail}
  </p>;
}

function restoreError(e: unknown) {
  if (e instanceof ApiError && e.code === "NOTHING_TO_RESTORE") return "지금 값이 이미 이 수정 전과 같아요.";
  if (e instanceof ApiError && e.code === "REVISION_TARGET_DELETED") return "지운 항목이라 되돌릴 수 없어요.";
  if (e instanceof ApiError && e.code === "REVISION_NOT_FOUND") return "이 기록을 찾지 못했어요. 목록을 새로 불러와 주세요.";
  return e instanceof ApiError && e.code !== "INVALID_RESPONSE" ? `되돌리지 못했어요. ${e.message}` : "되돌리지 못했어요. 다시 시도해 주세요.";
}

/** 이력 한 줄 — 세로선 위 아이콘(나 / 외부 AI) · 접힌 머리(요약 · 대상 · 누가 · 언제). 펼치면 차이 · 짧은 값 · 되돌리기 */
function Row({ revision: r, all, latest, last, defaultOpen, beforeRestore, onRestored, onNavigate }: {
  revision: Revision; all: boolean; latest: boolean; last: boolean; defaultOpen: boolean;
  beforeRestore?: () => Promise<void>; onRestored: (result: RestoreResult) => void; onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = all ? targetLink(r) : null;
  const ai = r.by === "EXTERNAL_AI";
  const who = ai ? mcpClientName(r.client ?? "외부 AI") : "나";
  const key = TEXT_KEY[r.targetType];
  const before = r.before[key] ?? "", after = r.after[key] ?? "";
  const fields = fieldChanges(r);

  async function restore() {
    setBusy(true); setError(null);
    try {
      await beforeRestore?.();
      onRestored(await restoreRevision(r.id));
      setAsking(false);
    } catch (e) { setError(restoreError(e)); } finally { setBusy(false); }
  }

  return <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 pb-2">
    {!last && <span aria-hidden="true" className="absolute top-10 bottom-0 left-4 w-px -translate-x-1/2 bg-hairline" />}
    <span aria-hidden="true" title={who} className={cn("mt-1.5 flex size-8 items-center justify-center rounded-full", ai ? "bg-review-soft text-review" : "bg-surface-soft text-muted")}>
      {ai ? <RobotIcon className="size-4" /> : <UserIcon className="size-4" />}
    </span>
    <div className="min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={cn("flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink", open && "bg-surface-soft")}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{summary(r)}</span>
          <span className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 text-note text-muted">
            {all && <span className="min-w-0 truncate">{targetName(r)}{r.target.deleted && " · 지운 항목"}</span>}
            {all && <span aria-hidden="true">·</span>}
            <span>{who}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={r.createdAt}>{timestamp(r.createdAt)}</time>
          </span>
        </span>
        {latest && !all && !r.target.deleted && <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">현재</span>}
        <CaretDownIcon aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-2 grid gap-3 rounded-sm border border-hairline-soft p-3">
        {before !== after && <TextDiff before={before} after={after} />}
        {fields.length > 0 && <div className="grid gap-1">
          {fields.map(([label, x, y]) => <p key={label} className="m-0 text-sm text-body"><span className="text-muted">{label}</span> {x} → <strong className="font-semibold text-ink">{y}</strong></p>)}
        </div>}
        {r.target.deleted ? <p className="m-0 text-note text-muted">지운 항목이라 그 항목으로 가거나 되돌릴 수 없어요.</p>
          : asking ? <div className="grid gap-2 rounded-sm bg-surface-soft p-3">
            <p className="m-0 text-sm text-body">이 수정 전으로 되돌릴까요? {RESTORE_NOTE[r.targetType]}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => void restore()}>{busy ? "되돌리는 중…" : error ? "다시 시도" : "되돌리기"}</Button>
              <Button className="min-h-11 lg:min-h-10" variant="secondary" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>취소</Button>
            </div>
          </div>
          : <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11 lg:min-h-9" variant="secondary" size="sm" onClick={() => setAsking(true)}><ArrowsClockwiseIcon />이 수정 전으로</Button>
            {link && <Link href={link.href} onClick={onNavigate} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-surface-soft px-3 text-xs font-medium text-body hover:text-ink lg:min-h-9">{link.label}<ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>}
          </div>}
        {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      </div>}
    </div>
  </li>;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; revisions: Revision[]; nextCursor: string | null };

/** 이력 목록 — target 이 없으면 전체(최근 수정). 「더 보기」로 넘긴다 */
export function RevisionList({ target, beforeRestore, onRestored, onNavigate }: {
  target: RevisionTarget | null;
  /** 되돌리기 직전 — 답칸은 기다리던 자동 저장을 먼저 보낸다 */
  beforeRestore?: () => Promise<void>;
  onRestored?: (result: RestoreResult) => void;
  /** 줄의 항목 링크를 눌렀을 때 — 창을 닫는다 */
  onNavigate?: () => void;
}) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [more, setMore] = useState<"idle" | "busy" | "error">("idle");
  const [outcome, setOutcome] = useState<ReactNode>(null);
  const type = target?.type, id = target?.id;

  const load = useCallback(() => fetchRevisions(type && id != null ? { type, id } : null, null).then(
    page => setState({ status: "ready", ...page }),
    (e: unknown) => setState({ status: "error", message: e instanceof ApiError && e.code === "API_NOT_CONFIGURED" ? "목 모드에는 수정 이력이 없어요. 서버에 저장한 것만 기록돼요."
      : e instanceof ApiError && e.code !== "INVALID_RESPONSE" ? e.message : "수정 이력을 불러오지 못했어요." }),
  ), [type, id]);
  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    if (state.status !== "ready" || !state.nextCursor) return;
    setMore("busy");
    try {
      const page = await fetchRevisions(target, state.nextCursor);
      setState(s => s.status === "ready" ? { status: "ready", revisions: [...s.revisions, ...page.revisions.filter(r => !s.revisions.some(x => x.id === r.id))], nextCursor: page.nextCursor } : s);
      setMore("idle");
    } catch { setMore("error"); }
  }

  function restored(result: RestoreResult) {
    onRestored?.(result);
    setOutcome(target ? (result.revision.targetType === "ANSWER" ? "되돌렸어요. 답칸에 그때 글을 넣었어요 — 「다 썼어요」를 눌러야 확정돼요." : "되돌렸어요.")
      : <>되돌렸어요. 열어 둔 화면에는 새로 불러오면 보여요. <button type="button" className="font-medium underline underline-offset-3" onClick={() => window.location.reload()}>새로 불러오기</button></>);
    setMore("idle");
    void load();
  }

  if (state.status === "loading") return <p role="status" className="m-0 py-4 text-sm text-muted">수정 이력을 불러오고 있어요…</p>;
  if (state.status === "error") return <div role="alert" className="grid justify-items-start gap-3 py-4">
    <p className="m-0 text-sm text-error">{state.message}</p>
    <Button size="sm" className="min-h-11 lg:min-h-9" onClick={() => { setState({ status: "loading" }); void load(); }}><ArrowsClockwiseIcon />다시 시도</Button>
  </div>;
  return <div className="min-w-0">
    {outcome && <p role="status" className="m-0 mb-1 rounded-sm bg-surface-soft px-3 py-2 text-sm text-body">{outcome}</p>}
    {state.revisions.length === 0
      ? <p className="m-0 py-4 text-sm text-body">{target ? "아직 고친 기록이 없어요. 고치면 바뀌기 전 값이 여기에 남아요." : "아직 고친 기록이 없어요. 경험 · 활동 · 답을 고치면 여기에 모여요."}</p>
      : <ul className="m-0 list-none p-0 pt-2">{state.revisions.map((r, i) => <Row key={r.id} revision={r} all={!target} latest={i === 0} last={i === state.revisions.length - 1} defaultOpen={!!target && i === 0} beforeRestore={beforeRestore} onRestored={restored} onNavigate={onNavigate} />)}</ul>}
    {state.nextCursor && <div className="grid justify-items-start gap-2 pt-2">
      {more === "error" && <p role="alert" className="m-0 text-sm text-error">더 불러오지 못했어요.</p>}
      <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" disabled={more === "busy"} onClick={() => void loadMore()}>{more === "busy" ? "불러오는 중…" : more === "error" ? "다시 시도" : "더 보기"}</Button>
    </div>}
  </div>;
}

/** 헤더의 「최근 수정」 — 시안 6 「모두 저장됨」 자리(구분선 뒤). 저장은 고칠 때마다 바로 되고 답칸은 자기 줄에 저장 상태가 있어
 *  「모두 저장됨」이라고 단정하지 않는다. 좁은 화면은 아이콘만 */
export function RecentRevisionsButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" data-slot="recent-revisions" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={compact ? "최근 수정" : undefined} title="최근 수정 — 경험 · 활동 · 답을 고친 기록"
      className={compact ? "flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink"
        : "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"}>
      <ClockCounterClockwiseIcon aria-hidden="true" className={compact ? "size-5" : "size-4"} />
      {!compact && "최근 수정"}
    </button>
    <RevisionDialog open={open} onOpenChange={setOpen} target={null} title="최근 수정"
      description="경험 · 활동 · 지원서 답을 고친 기록이에요. 외부 AI 가 고친 경험도 같이 보여요." />
  </>;
}

/** 이력 창 — PC 는 가운데 창, 좁은 화면은 아래 시트(Dialog 가 폭으로 바꾼다) */
export function RevisionDialog({ open, onOpenChange, title, description, ...list }: Parameters<typeof RevisionList>[0] & {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="content-start gap-2 lg:max-w-2xl">
      <DialogTitle className="pr-10">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      {open && <RevisionList {...list} onNavigate={() => { list.onNavigate?.(); onOpenChange(false); }} />}
    </DialogContent>
  </Dialog>;
}
