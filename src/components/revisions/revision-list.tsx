"use client";

// 수정 이력(S-80 · ADR-013 · revision-api.md) — 언제 · 누가(나 / 외부 AI) · 무엇이 바뀌었나, 줄마다 「이때로 되돌리기」.
// 되돌리기는 그 줄에 보이는 그때 값(after)으로 — 「수정 전으로」는 처음 넣은 초안 줄에서 답칸을 비웠다(FE#430).
// 맨 처음 값(첫 수정 전)은 항목 이력 맨 아래 「처음 값」 줄, 지금 값과 같은 줄에는 버튼을 두지 않는다.
// 「최근 수정」(헤더 — 전체)과 「수정 이력」(경험 · 활동 메뉴, 답칸 줄 — 그 항목만)이 같이 쓴다.
// 줄은 세로선 타임라인에 접어 두고 한 줄 요약만 보인다 — 펼치면 바뀐 부분만 강조한 글 · 짧은 값 · 되돌리기(FE#413)
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRightIcon, ArrowsClockwiseIcon, CaretDownIcon, ClockCounterClockwiseIcon, FlagIcon, RobotIcon, UserIcon, XIcon } from "@phosphor-icons/react";
import { diff } from "@/components/questions/draft-match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/sidebar-layout";
import { timestamp } from "@/components/connections/mcp-changes";
import { ApiError } from "@/lib/api/errors";
import { mcpClientName } from "@/lib/api/mcp";
import { fetchRevisions, restoreRevision, type RestoreResult, type RestoreTo, type Revision, type RevisionTarget, type RevisionTargetType } from "@/lib/api/revisions";
import { COMPETENCIES, type Actor, type SourceStatus } from "@/lib/api/types";
import { periodText } from "@/lib/period";
import { beforeRestore as beforeRestoreAll, publishRestored } from "./restore-bus";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };
const SOURCE: Record<SourceStatus, string> = { SOURCE_CONFIRMED: "원문 확인", USER_ENTERED: "내가 입력", NEEDS_REVIEW: "확인 필요" };

/** 되돌리기 전에 알릴 것 — 무엇이 돌아가나 */
const RESTORE_NOTE: Record<RevisionTargetType, string> = {
  EXPERIENCE: "본문 · 수행 주체 · 역량 · 출처 상태가 그때 값으로 돌아가요. 근거 · 보완은 그대로예요.",
  ACTIVITY: "이름 · 기간이 그때 값으로 돌아가요. 분류 · 계기는 그대로예요.",
  ANSWER: "그때 글이 답칸에 들어가요. 다 쓴 답은 「다 썼어요」를 다시 눌러야 바뀌어요.",
};

/** 그 항목으로 가는 주소 — 지운 항목은 갈 곳이 없다. 이름은 줄 머리에 있으니 링크는 짧게 */
function targetLink(r: Revision): { href: string; label: string } | null {
  if (r.target.deleted) return null;
  if (r.targetType === "EXPERIENCE") return { href: `/experience?experience=${r.targetId}`, label: "그 경험 보기" };
  if (r.targetType === "ACTIVITY") return { href: `/experience?activity=${r.targetId}`, label: "그 활동 보기" };
  return { href: `/questions?question=${r.targetId}`, label: "그 답 보기" };
}

/** 본문 앞부분 — 한 활동에 경험이 여럿이어도 어느 경험인지 알게(FE#433). 그때 값(after) 기준, 비면 before.
 *  좁은 폭에서 줄 끝이 잘려도 남게 활동 이름보다 앞에 둔다 */
const SNIPPET = 20;
function snippet(text: string | undefined) {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > SNIPPET ? `${s.slice(0, SNIPPET).trimEnd()}…` : s;
}

function targetName(r: Revision) {
  if (r.targetType === "EXPERIENCE") {
    const s = snippet(r.after.content || r.before.content);
    return `경험${s ? ` 「${s}」` : ""} · ${r.target.activityName ?? "활동"}`;
  }
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
  if (r.kind === "RESTORE") return r.targetType === "ANSWER" ? "그때 답을 답칸에 되돌렸어요 · 임시 글" : "예전 값으로 되돌렸어요";
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
  if (e instanceof ApiError && e.code === "NOTHING_TO_RESTORE") return "지금 값이 이미 이때와 같아요.";
  if (e instanceof ApiError && e.code === "REVISION_TARGET_DELETED") return "지운 항목이라 되돌릴 수 없어요.";
  if (e instanceof ApiError && e.code === "REVISION_NOT_FOUND") return "이 기록을 찾지 못했어요. 목록을 새로 불러와 주세요.";
  return e instanceof ApiError && e.code !== "INVALID_RESPONSE" ? `되돌리지 못했어요. ${e.message}` : "되돌리지 못했어요. 다시 시도해 주세요.";
}

/** 이력 한 줄 — 세로선 위 아이콘(나 / 외부 AI) · 접힌 머리(요약 · 대상 · 누가 · 언제). 펼치면 차이 · 짧은 값 · 되돌리기 */
function Row({ revision: r, all, current, badge, last, defaultOpen, beforeRestore, onRestored, onNavigate }: {
  /** current — 이 줄의 값이 지금 값과 같다(되돌릴 것이 없다). badge — 그중 가장 새 줄에만 「현재」 */
  revision: Revision; all: boolean; current: boolean; badge: boolean; last: boolean; defaultOpen: boolean;
  beforeRestore?: BeforeRestore; onRestored: (result: RestoreResult) => void; onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const link = all ? targetLink(r) : null;
  const ai = r.by === "EXTERNAL_AI";
  const who = ai ? mcpClientName(r.client ?? "외부 AI") : "나";
  const key = TEXT_KEY[r.targetType];
  const before = r.before[key] ?? "", after = r.after[key] ?? "";
  const fields = fieldChanges(r);

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
        {badge && !r.target.deleted && <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">현재</span>}
        <CaretDownIcon aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-2 grid gap-3 rounded-sm border border-hairline-soft p-3">
        {before !== after && <TextDiff before={before} after={after} />}
        {fields.length > 0 && <div className="grid gap-1">
          {fields.map(([label, x, y]) => <p key={label} className="m-0 text-sm text-body"><span className="text-muted">{label}</span> {x} → <strong className="font-semibold text-ink">{y}</strong></p>)}
        </div>}
        {r.target.deleted ? <p className="m-0 text-note text-muted">지운 항목이라 그 항목으로 가거나 되돌릴 수 없어요.</p>
          : current ? <p className="m-0 text-note text-muted">{badge ? "지금 값이에요. 되돌리려면 아래에서 돌아갈 때를 골라 주세요." : "지금 값과 같아요."}</p>
          : <RestoreAction revision={r} to="AFTER" label="이때로 되돌리기" question="이때 값으로 되돌릴까요?" beforeRestore={beforeRestore} onRestored={onRestored}>
            {link && <Link href={link.href} onClick={onNavigate} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-surface-soft px-3 text-xs font-medium text-body hover:text-ink lg:min-h-9">{link.label}<ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>}
          </RestoreAction>}
      </div>}
    </div>
  </li>;
}

type BeforeRestore = (revision: Revision) => Promise<unknown> | void;

/** 되돌리기 버튼 → 확인 → 실행. 실패하면 같은 자리에서 다시 시도 */
function RestoreAction({ revision: r, to, label, question, beforeRestore, onRestored, children }: {
  revision: Revision; to: RestoreTo; label: string; question: string;
  beforeRestore?: BeforeRestore; onRestored: (result: RestoreResult) => void; children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true); setError(null);
    try {
      await beforeRestore?.(r);
      onRestored(await restoreRevision(r.id, to));
      setAsking(false);
    } catch (e) { setError(restoreError(e)); } finally { setBusy(false); }
  }

  return <>
    {asking ? <div className="grid gap-2 rounded-sm bg-surface-soft p-3">
      <p className="m-0 text-sm text-body">{question} {RESTORE_NOTE[r.targetType]}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => void restore()}>{busy ? "되돌리는 중…" : error ? "다시 시도" : "되돌리기"}</Button>
        <Button className="min-h-11 lg:min-h-10" variant="secondary" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>취소</Button>
      </div>
    </div>
    : <div className="flex flex-wrap items-center gap-2">
      <Button className="min-h-11 lg:min-h-9" variant="secondary" size="sm" onClick={() => setAsking(true)}><ArrowsClockwiseIcon />{label}</Button>
      {children}
    </div>}
    {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
  </>;
}

/** 맨 아래 「처음 값」 줄 — 가장 오래된 기록의 before(첫 수정 전). 줄마다 그때 값(after)으로 되돌리니, 처음 값으로 가는 길은 여기 하나다 */
function OriginRow({ oldest: r, current, beforeRestore, onRestored }: {
  oldest: Revision; current: boolean; beforeRestore?: BeforeRestore; onRestored: (result: RestoreResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const b = r.before;
  const fields = r.targetType === "EXPERIENCE" ? [b.actor && `수행 주체 ${ACTOR[b.actor]}`, `역량 ${(b.competencies ?? []).map(c => COMPETENCIES[c]).join(" · ") || "없음"}`, b.sourceStatus && `출처 상태 ${SOURCE[b.sourceStatus]}`]
    : r.targetType === "ACTIVITY" && b.period ? [`기간 ${periodText(b.period)}`] : [];
  return <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 pb-2">
    <span aria-hidden="true" className="mt-1.5 flex size-8 items-center justify-center rounded-full bg-surface-soft text-muted"><FlagIcon className="size-4" /></span>
    <div className="min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={cn("flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink", open && "bg-surface-soft")}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">처음 값</span>
          <span className="mt-0.5 block text-note text-muted">첫 수정 전 · <time dateTime={r.createdAt}>{timestamp(r.createdAt)}</time>까지</span>
        </span>
        {current && <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">현재</span>}
        <CaretDownIcon aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-2 grid gap-3 rounded-sm border border-hairline-soft p-3">
        <p className="m-0 max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-body">{b[TEXT_KEY[r.targetType]]}</p>
        {fields.length > 0 && <p className="m-0 text-note text-muted">{fields.filter(Boolean).join(" · ")}</p>}
        {current ? <p className="m-0 text-note text-muted">지금 값이에요.</p>
          : <RestoreAction revision={r} to="BEFORE" label="처음 값으로 되돌리기" question="처음 값으로 되돌릴까요?" beforeRestore={beforeRestore} onRestored={onRestored} />}
      </div>}
    </div>
  </li>;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; revisions: Revision[]; nextCursor: string | null };

/** 이력 목록 — target 이 없으면 전체(최근 수정). 「더 보기」로 넘긴다 */
export function RevisionList({ target, current, beforeRestore, onRestored, onNavigate }: {
  target: RevisionTarget | null;
  /** 지금 화면의 글 — 자동 저장은 이력에 안 남아 답칸은 맨 위 기록과 다를 수 있다. 빼면 맨 위 기록이 지금 값이다(경험 · 활동) */
  current?: string;
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

  // 전체 목록(헤더)은 그 항목을 연 화면에 알린다 — 같은 항목이 열려 있으면 그 자리에서 바뀐다(FE#401).
  // 받은 화면이 없으면(다른 화면에서 되돌림) 새로 불러오기를 권한다
  const before: BeforeRestore | undefined = target ? beforeRestore && (() => beforeRestore()) : beforeRestoreAll;
  function restored(result: RestoreResult) {
    onRestored?.(result);
    const shown = !!target || publishRestored(result);
    setOutcome(!shown ? <>되돌렸어요. 열어 둔 화면에는 새로 불러오면 보여요. <button type="button" className="font-medium underline underline-offset-3" onClick={() => window.location.reload()}>새로 불러오기</button></>
      : result.revision.targetType === "ANSWER" ? "되돌렸어요. 답칸에 그때 글을 넣었어요 — 「다 썼어요」를 눌러야 확정돼요." : "되돌렸어요.");
    setMore("idle");
    void load();
  }

  if (state.status === "loading") return <p role="status" className="m-0 py-4 text-sm text-muted">수정 이력을 불러오고 있어요…</p>;
  if (state.status === "error") return <div role="alert" className="grid justify-items-start gap-3 py-4">
    <p className="m-0 text-sm text-error">{state.message}</p>
    <Button size="sm" className="min-h-11 lg:min-h-9" onClick={() => { setState({ status: "loading" }); void load(); }}><ArrowsClockwiseIcon />다시 시도</Button>
  </div>;
  // 지금 값과 같은 줄에는 되돌리기를 두지 않는다 — 항목 이력에서만 안다(전체 목록은 항목이 섞여 있다. 같으면 서버가 409).
  // 지금 값은 답칸이면 넘겨받은 글, 경험 · 활동이면 맨 위 기록의 after
  const top = state.revisions[0];
  const isNow = (snapshot: Revision["after"], type: RevisionTargetType) => !!target && !!top
    && (current !== undefined ? (snapshot[TEXT_KEY[type]] ?? "") === current : same(snapshot, top.after));
  const nowIndex = state.revisions.findIndex(r => isNow(r.after, r.targetType));
  // 「처음 값」 줄 — 끝까지 불러온 항목 이력에만. 빈 글이면 두지 않는다(답칸을 비우는 되돌리기는 없다)
  const oldest = target && !state.nextCursor ? state.revisions.at(-1) : undefined;
  const origin = oldest && !oldest.target.deleted && (oldest.before[TEXT_KEY[oldest.targetType]] ?? "") !== "" ? oldest : undefined;
  return <div className="min-w-0">
    {outcome && <p role="status" className="m-0 mb-1 rounded-sm bg-surface-soft px-3 py-2 text-sm text-body">{outcome}</p>}
    {state.revisions.length === 0
      ? <p className="m-0 py-4 text-sm text-body">{target ? "아직 고친 기록이 없어요. 고치면 바뀌기 전 값이 여기에 남아요." : "아직 고친 기록이 없어요. 경험 · 활동 · 답을 고치면 여기에 모여요."}</p>
      : <ul className="m-0 list-none p-0 pt-2">{state.revisions.map((r, i) => <Row key={r.id} revision={r} all={!target} current={isNow(r.after, r.targetType)} badge={i === nowIndex} last={i === state.revisions.length - 1 && !origin} defaultOpen={!!target && i === 0} beforeRestore={before} onRestored={restored} onNavigate={onNavigate} />)}
        {origin && <OriginRow oldest={origin} current={isNow(origin.before, origin.targetType)} beforeRestore={before} onRestored={restored} />}</ul>}
    {state.nextCursor && <div className="grid justify-items-start gap-2 pt-2">
      {more === "error" && <p role="alert" className="m-0 text-sm text-error">더 불러오지 못했어요.</p>}
      <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" disabled={more === "busy"} onClick={() => void loadMore()}>{more === "busy" ? "불러오는 중…" : more === "error" ? "다시 시도" : "더 보기"}</Button>
    </div>}
  </div>;
}

/** 헤더의 「최근 수정」 — 시안 6 「모두 저장됨」 자리(구분선 뒤). 저장은 고칠 때마다 바로 되고 답칸은 자기 줄에 저장 상태가 있어
 *  「모두 저장됨」이라고 단정하지 않는다. 좁은 화면은 아이콘만. 다시 누르면 닫는다 */
export function RecentRevisionsButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" data-slot="recent-revisions" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={compact ? "최근 수정" : undefined} title="최근 수정 — 경험 · 활동 · 답을 고친 기록"
      className={compact ? "flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink"
        : cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-ink", open && "bg-surface-soft text-ink")}>
      <ClockCounterClockwiseIcon aria-hidden="true" className={compact ? "size-5" : "size-4"} />
      {!compact && "최근 수정"}
    </button>
    <RevisionDialog open={open} onOpenChange={setOpen} target={null} title="최근 수정"
      description="경험 · 활동 · 지원서 답을 고친 기록이에요. 외부 AI 가 고친 경험도 같이 보여요." />
  </>;
}

// 오른쪽 이력 패널은 한 번에 하나(FE#424) — 열린 패널의 id. 다른 패널이 열리거나 closeRevisionPanel() 이 불리면 앞의 것이 닫힌다.
// 활동을 고르거나 차곡이를 열면 그 자리를 돌려준다
let activePanel: string | null = null;
const panelListeners = new Set<() => void>();
function setActivePanel(id: string | null) { activePanel = id; panelListeners.forEach(l => l()); }
const subscribePanel = (listener: () => void) => { panelListeners.add(listener); return () => { panelListeners.delete(listener); }; };
/** 열린 이력 패널을 닫는다 — 오른쪽 자리를 쓰는 다른 패널(활동 세부 · 차곡이)이 열릴 때 */
export const closeRevisionPanel = () => { if (activePanel !== null) setActivePanel(null); };
export const isRevisionPanelOpen = () => activePanel !== null;

/** 이력 패널 — 넓은 화면(1280 이상)은 머리 아래 오른쪽 사이드바(활동 세부 · 차곡이 자리를 덮고, 닫으면 그대로 드러난다).
 *  그보다 좁으면 차곡이처럼 오른쪽 시트 */
export function RevisionDialog({ open, onOpenChange, title, description, ...list }: Parameters<typeof RevisionList>[0] & {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
}) {
  const id = useId();
  const { wide } = useSidebar();
  const current = useSyncExternalStore(subscribePanel, () => activePanel, () => null);
  const claimed = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) {
      claimed.current = true;
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setActivePanel(id);
      return;
    }
    if (claimed.current) { claimed.current = false; if (activePanel === id) setActivePanel(null); }
  }, [open, id]);
  // 다른 패널이 자리를 가져가면 닫는다
  // current 는 바뀐 것을 알리는 신호로만 쓰고, 판단은 지금 값으로 — 같은 렌더에서 막 자리를 잡은 패널을 닫지 않게
  useEffect(() => { if (open && claimed.current && activePanel !== id) onOpenChange(false); }, [current, open, id, onOpenChange]);
  useEffect(() => () => { if (activePanel === id) setActivePanel(null); }, [id]);
  // 넓은 화면 패널은 모달이 아니다 — 열면 패널로 초점을 옮기고, 닫으면 연 버튼으로 돌려준다
  useEffect(() => {
    if (!wide || !open) return;
    panel.current?.focus();
    const back = opener.current;
    // 닫혀 초점이 갈 곳을 잃었을 때만 — 다른 활동을 눌러 닫혔으면 그 자리에 둔다
    return () => { requestAnimationFrame(() => { if (back?.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus(); }); };
  }, [wide, open]);

  const close = () => onOpenChange(false);
  const content = open && <RevisionList {...list} onNavigate={() => { list.onNavigate?.(); close(); }} />;

  if (wide) return open ? createPortal(
    <section ref={panel} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} tabIndex={-1}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
      className="fixed top-14 right-0 bottom-0 z-20 flex w-[440px] flex-col border-l border-hairline bg-canvas outline-none">
      <header className="flex items-start gap-2 border-b border-hairline-soft px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="m-0 text-title-md font-semibold text-ink">{title}</h2>
          <p id={`${id}-desc`} className="m-0 mt-1 text-note text-muted">{description}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="닫기" onClick={close}><XIcon /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">{content}</div>
    </section>, document.body) : null;

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full! gap-2 overflow-auto p-5 pt-6 sm:max-w-[440px]!">
      <SheetTitle className="pr-10 text-title-md">{title}</SheetTitle>
      <SheetDescription className="text-note">{description}</SheetDescription>
      {content}
    </SheetContent>
  </Sheet>;
}
