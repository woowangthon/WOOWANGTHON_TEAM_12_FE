"use client";

// 수정 이력(S-80 · ADR-013 · revision-api.md) — 언제 · 누가(나 / 외부 AI) · 무엇이 바뀌었나, 줄마다 「이 수정 전으로」.
// 「최근 수정」(헤더 — 전체)과 「수정 이력」(경험 · 활동 메뉴, 답칸 줄 — 그 항목만)이 같이 쓴다
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowsClockwiseIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
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

function verb(r: Revision) {
  if (r.kind === "RESTORE") return r.targetType === "ANSWER" ? "답을 되돌림 · 임시 글" : "되돌림";
  if (r.kind === "CONFIRM") return "다 썼어요";
  if (r.kind === "DRAFT_OVERWRITE") return "초안을 답칸에 넣음";
  return r.targetType === "ACTIVITY" ? "활동을 고침" : "경험을 고침";
}

/** 되돌리기 전에 알릴 것 — 무엇이 돌아가나 */
const RESTORE_NOTE: Record<RevisionTargetType, string> = {
  EXPERIENCE: "본문 · 수행 주체 · 역량 · 출처 상태가 이 수정 전으로 돌아가요. 근거 · 보완은 그대로예요.",
  ACTIVITY: "이름 · 기간이 이 수정 전으로 돌아가요. 분류 · 계기는 그대로예요.",
  ANSWER: "그때 글이 답칸에 들어가요. 다 쓴 답은 「다 썼어요」를 다시 눌러야 바뀌어요.",
};

/** 그 항목으로 가는 주소 — 지운 항목은 갈 곳이 없다 */
function targetLink(r: Revision): { href: string; label: string } | null {
  if (r.target.deleted) return null;
  if (r.targetType === "EXPERIENCE") return { href: `/experience?experience=${r.targetId}`, label: `경험 · ${r.target.activityName ?? "활동"}` };
  if (r.targetType === "ACTIVITY") return { href: `/experience?activity=${r.targetId}`, label: `활동 · ${r.after.name ?? r.before.name ?? ""}` };
  return { href: `/questions?question=${r.targetId}`, label: `지원서 · ${r.target.organization || "지원처 미입력"} · ${r.target.questionText ?? "문항"}` };
}

function targetName(r: Revision) {
  if (r.targetType === "EXPERIENCE") return `경험 · ${r.target.activityName ?? "활동"}`;
  if (r.targetType === "ACTIVITY") return `활동 · ${r.after.name ?? r.before.name ?? ""}`;
  return `지원서 · ${r.target.organization || "지원처 미입력"} · ${r.target.questionText ?? "문항"}`;
}

function Text({ label, children }: { label: string; children: string }) {
  return <div className="min-w-0">
    <p className="m-0 text-note font-medium text-muted">{label}</p>
    <p className="m-0 mt-0.5 line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{children || <span className="text-muted">(비어 있음)</span>}</p>
  </div>;
}

/** 전후 — 글은 둘 다 보이고, 짧은 값(주체 · 역량 · 출처 · 기간)은 바뀐 것만 「전 → 뒤」로 */
function Changes({ revision: { before: b, after: a, targetType } }: { revision: Revision }) {
  const lines: [string, string, string][] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (targetType === "EXPERIENCE") {
    if (b.actor && a.actor && b.actor !== a.actor) lines.push(["수행 주체", ACTOR[b.actor], ACTOR[a.actor]]);
    if (!same(b.competencies, a.competencies)) lines.push(["역량", (b.competencies ?? []).map(c => COMPETENCIES[c]).join(" · ") || "없음", (a.competencies ?? []).map(c => COMPETENCIES[c]).join(" · ") || "없음"]);
    if (b.sourceStatus && a.sourceStatus && b.sourceStatus !== a.sourceStatus) lines.push(["출처 상태", SOURCE[b.sourceStatus], SOURCE[a.sourceStatus]]);
  }
  if (targetType === "ACTIVITY" && b.period && a.period && !same(b.period, a.period)) lines.push(["기간", periodText(b.period), periodText(a.period)]);
  const key = targetType === "EXPERIENCE" ? "content" : targetType === "ACTIVITY" ? "name" : "text";
  const textChanged = b[key] !== a[key];
  return <div className="mt-2 grid gap-2">
    {textChanged && <div className="grid gap-2 sm:grid-cols-2">
      <Text label="바뀌기 전">{b[key] ?? ""}</Text>
      <Text label="바뀐 뒤">{a[key] ?? ""}</Text>
    </div>}
    {lines.map(([label, x, y]) => <p key={label} className="m-0 text-sm text-body"><span className="text-muted">{label}</span> {x} → <strong className="font-semibold text-ink">{y}</strong></p>)}
  </div>;
}

function restoreError(e: unknown) {
  if (e instanceof ApiError && e.code === "NOTHING_TO_RESTORE") return "지금 값이 이미 이 수정 전과 같아요.";
  if (e instanceof ApiError && e.code === "REVISION_TARGET_DELETED") return "지운 항목이라 되돌릴 수 없어요.";
  if (e instanceof ApiError && e.code === "REVISION_NOT_FOUND") return "이 기록을 찾지 못했어요. 목록을 새로 불러와 주세요.";
  return e instanceof ApiError && e.code !== "INVALID_RESPONSE" ? `되돌리지 못했어요. ${e.message}` : "되돌리지 못했어요. 다시 시도해 주세요.";
}

function Row({ revision: r, all, beforeRestore, onRestored, onNavigate }: {
  revision: Revision; all: boolean; beforeRestore?: () => Promise<void>; onRestored: (result: RestoreResult) => void; onNavigate?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = all ? targetLink(r) : null;
  const who = r.by === "EXTERNAL_AI" ? mcpClientName(r.client ?? "외부 AI") : "나";

  async function restore() {
    setBusy(true); setError(null);
    try {
      await beforeRestore?.();
      onRestored(await restoreRevision(r.id));
      setAsking(false);
    } catch (e) { setError(restoreError(e)); } finally { setBusy(false); }
  }

  return <li className="border-b border-hairline-soft py-4 last:border-b-0">
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm">
      <span className="font-semibold">{who} · {verb(r)}</span>
      <time dateTime={r.createdAt} className="text-note text-muted">{timestamp(r.createdAt)}</time>
    </p>
    {all && (link
      ? <Link href={link.href} onClick={onNavigate} className="mt-1 line-clamp-1 inline-flex min-h-11 max-w-full items-center text-sm font-medium break-all underline-offset-3 hover:underline lg:min-h-8">{link.label}</Link>
      : <p className="m-0 mt-1 text-sm text-muted">{targetName(r)} · 지운 항목</p>)}
    <Changes revision={r} />
    {r.target.deleted ? <p className="m-0 mt-2 text-note text-muted">지운 항목이라 그 항목으로 가거나 되돌릴 수 없어요.</p>
      : asking ? <div className="mt-3 grid gap-2 rounded-sm bg-surface-soft p-3">
        <p className="m-0 text-sm text-body">이 수정 전으로 되돌릴까요? {RESTORE_NOTE[r.targetType]}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => void restore()}>{busy ? "되돌리는 중…" : error ? "다시 시도" : "되돌리기"}</Button>
          <Button className="min-h-11 lg:min-h-10" variant="secondary" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>취소</Button>
        </div>
      </div>
      : <Button className="mt-2 min-h-11 lg:min-h-9" variant="secondary" size="sm" onClick={() => setAsking(true)}>이 수정 전으로</Button>}
    {error && <p role="alert" className="m-0 mt-2 text-sm text-error">{error}</p>}
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
      : <ul className="m-0 list-none p-0">{state.revisions.map(r => <Row key={r.id} revision={r} all={!target} beforeRestore={beforeRestore} onRestored={restored} onNavigate={onNavigate} />)}</ul>}
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
