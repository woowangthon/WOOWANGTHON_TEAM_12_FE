"use client";

// 같은 활동 제안(S-44 · FE#246) — 결정은 비교 창 하나, 입구는 여럿(활동 세부 양쪽 · 종 「할 일」 · 분석 결과 줄).
// 방향(A 를 B 에 붙이기) 없이 두 활동을 나란히 놓고 남길 이름 · 기간만 고른다 — 어느 쪽에서 열어도 같다
import { useEffect, useRef, useState } from "react";
import { ArrowsClockwiseIcon, CaretLeftIcon, CaretRightIcon, FileTextIcon, SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchActivity } from "@/lib/api/experience";
import { ACTIVITY_CATEGORIES, type ActivityDetail, type ActivitySummary } from "@/lib/api/types";
import { periodText } from "@/lib/period";
import { cn } from "@/lib/utils";
import { CategoryIcon, categoryOf } from "./activity-category";

/** 같아 보이는 한 쌍 — 제안은 새 활동(newId)에 붙어 있고 기존 활동(oldId)을 가리킨다 */
export type SuggestionPair = { newId: number; oldId: number };

/** 목록에서 아직 정하지 않은 쌍. 가리키는 기존 활동이 목록에 없으면(그새 지웠다) 뺀다 */
export function suggestionPairs(activities: Pick<ActivitySummary, "id" | "mergeSuggestion">[]): SuggestionPair[] {
  const ids = new Set(activities.map((a) => a.id));
  return activities.flatMap((a) => a.mergeSuggestion && ids.has(a.mergeSuggestion.activityId) ? [{ newId: a.id, oldId: a.mergeSuggestion.activityId }] : []);
}

/** 활동 세부 헤더 아래 한 줄씩 — 이 활동이 새 쪽이든 기존 쪽이든 같은 모양 */
export function SuggestionLines({ activityId, activities, onCompare }: {
  activityId: number;
  activities: ActivitySummary[];
  onCompare: (newId: number) => void;
}) {
  const name = (id: number) => activities.find((a) => a.id === id)?.name ?? "다른 활동";
  const lines = suggestionPairs(activities).flatMap((p): { key: number; other: string; side: "기존" | "새" }[] =>
    p.newId === activityId ? [{ key: p.newId, other: name(p.oldId), side: "기존" }]
      : p.oldId === activityId ? [{ key: p.newId, other: name(p.newId), side: "새" }] : []);
  if (!lines.length) return null;
  return (
    <ul aria-label="같은 활동 제안" className="m-0 grid list-none gap-1.5 border-b border-hairline px-4.5 py-3 lg:px-7">
      {lines.map((l) => (
        <li key={l.key} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-note">
          <span className="flex min-w-0 flex-1 basis-56 items-start gap-1.5 text-body">
            <SparkleIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-review" aria-hidden="true" />
            <span className="min-w-0 break-words">
              <span className="font-semibold text-review">AI 제안</span> · {l.side} 활동 「<b className="font-semibold text-ink">{l.other}</b>」{l.side === "새" ? "이 이 활동과" : "과"} 같아 보여요
            </span>
          </span>
          <Button variant="secondary" size="sm" className="min-h-9" onClick={() => onCompare(l.key)}>비교하기</Button>
        </li>
      ))}
    </ul>
  );
}

/** 「같은 활동인가요?」 — 쌍이 여럿이면 1 / N 으로 넘기며 정한다. 정한 쌍은 목록에서 빠지고 그 자리의 다음 쌍으로 간다 */
export function SameActivityDialog({ pairs, startId, onClose, onMerge, onDismiss }: {
  pairs: SuggestionPair[];
  /** 처음 열 쌍의 newId. null 이면 닫힘 */
  startId: number | null;
  onClose: () => void;
  /** 실패하면 던진다 — 창에 이유를 남긴다 */
  onMerge: (keepId: number, fromId: number) => Promise<void>;
  onDismiss: (newId: number) => Promise<void>;
}) {
  const [currentId, setCurrentId] = useState<number | null>(startId);
  const [openedWith, setOpenedWith] = useState(startId);
  if (openedWith !== startId) { setOpenedWith(startId); setCurrentId(startId); }
  const index = pairs.findIndex((p) => p.newId === currentId);
  const pair = index >= 0 ? pairs[index] : null;
  const lastIndex = useRef(0);
  useEffect(() => {
    if (startId == null) return;
    if (index >= 0) { lastIndex.current = index; return; }
    const next = pairs[Math.min(lastIndex.current, pairs.length - 1)];
    if (next) setCurrentId(next.newId); else onClose();
  }, [index, pairs, startId, onClose]);

  return (
    <Dialog open={startId != null && pair != null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="lg:max-w-3xl">
        {pair && <PairView key={pair.newId} pair={pair} position={index + 1} total={pairs.length}
          onMove={(step) => setCurrentId(pairs[(index + step + pairs.length) % pairs.length].newId)} onMerge={onMerge} onDismiss={onDismiss} />}
      </DialogContent>
    </Dialog>
  );
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; next: ActivityDetail; old: ActivityDetail };

function PairView({ pair, position, total, onMove, onMerge, onDismiss }: {
  pair: SuggestionPair; position: number; total: number; onMove: (step: number) => void;
  onMerge: (keepId: number, fromId: number) => Promise<void>; onDismiss: (newId: number) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchActivity(pair.newId), fetchActivity(pair.oldId)]).then(
      ([next, old]) => { if (alive) setLoaded({ status: "ready", next, old }); },
      (e: Error) => { if (alive) setLoaded({ status: "error", message: e.message }); },
    );
    return () => { alive = false; };
  }, [pair.newId, pair.oldId, attempt]);

  const ready = loaded.status === "ready" ? loaded : null;
  // 기본은 경험이 많은 쪽 — 같으면 기존 활동(S-44 「기존 활동이 남는다」)
  const keep = keepId ?? (ready && ready.next.experiences.length > ready.old.experiences.length ? pair.newId : pair.oldId);
  const kept = ready && (keep === pair.newId ? ready.next : ready.old);
  const from = ready && (keep === pair.newId ? ready.old : ready.next);

  const act = async (action: "merge" | "dismiss") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      if (action === "merge") await onMerge(keep, keep === pair.newId ? pair.oldId : pair.newId);
      else await onDismiss(pair.newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했어요. 다시 시도해 주세요.");
      setBusy(null);
    }
  };

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <DialogTitle>같은 활동인가요?</DialogTitle>
          {total > 1 && (
            <span className="ml-auto flex items-center gap-0.5 text-note text-muted tabular-nums">
              <Button variant="ghost" size="icon" className="size-9" aria-label="이전 쌍" disabled={!!busy} onClick={() => onMove(-1)}><CaretLeftIcon /></Button>
              {position} / {total}
              <Button variant="ghost" size="icon" className="size-9" aria-label="다음 쌍" disabled={!!busy} onClick={() => onMove(1)}><CaretRightIcon /></Button>
            </span>
          )}
        </div>
        <DialogDescription className="flex items-start gap-1.5 text-note text-muted">
          <SparkleIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-review" aria-hidden="true" />
          <span><span className="font-semibold text-review">AI 제안</span> · 이름과 기간을 보고 같아 보인다고 했어요. 맞는지는 직접 봐 주세요.</span>
        </DialogDescription>
      </DialogHeader>

      {loaded.status === "loading" && <p role="status" className="m-0 py-8 text-center text-sm text-muted">두 활동을 불러오고 있어요…</p>}
      {loaded.status === "error" && (
        <div className="grid justify-items-start gap-2 py-4">
          <p role="alert" className="m-0 text-sm text-error">{loaded.message}</p>
          <Button variant="secondary" size="sm" onClick={() => { setLoaded({ status: "loading" }); setAttempt((n) => n + 1); }}><ArrowsClockwiseIcon />다시 불러오기</Button>
        </div>
      )}
      {ready && kept && from && (
        <>
          <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0 lg:grid-cols-2" disabled={!!busy}>
            <legend className="sr-only">이름 · 기간을 남길 활동</legend>
            <Side label="기존 활동" activity={ready.old} checked={keep === pair.oldId} onPick={() => setKeepId(pair.oldId)} />
            <p aria-hidden="true" className="m-0 -my-1.5 text-center text-note text-muted lg:hidden">= 같아 보여요</p>
            <Side label="새 활동" activity={ready.next} checked={keep === pair.newId} onPick={() => setKeepId(pair.newId)} />
          </fieldset>
          <p className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-sm leading-relaxed text-body" aria-live="polite">
            합치면 「{kept.name}」 하나에 경험 {kept.experiences.length + from.experiences.length}개와 근거가 모두 모이고, 「{from.name}」은 사라져요. 되돌릴 수 없어요.
          </p>
        </>
      )}

      {busy && <p role="status" className="m-0 text-sm text-muted">{busy === "merge" ? "합치고 있어요…" : "저장하고 있어요…"}</p>}
      {error && <p role="alert" className="m-0 text-sm font-medium text-error">{error}</p>}

      {/* 모바일 시트는 길어서 스크롤된다 — 두 버튼을 나란히 아래에 붙여 둔다 */}
      <DialogFooter className="max-sm:sticky max-sm:bottom-0 max-sm:-mx-5 max-sm:flex-row max-sm:bg-popover max-sm:px-5 max-sm:pt-3 max-sm:[&>*]:flex-1">
        <Button variant="secondary" disabled={!!busy || !ready} onClick={() => void act("dismiss")}>따로 두기</Button>
        <Button disabled={!!busy || !ready} onClick={() => void act("merge")}>하나로 합치기</Button>
      </DialogFooter>
    </>
  );
}

/** 한쪽 활동 — 고르는 카드. 이름 · 기간만으로는 같은지 모르니 경험 몇 줄과 자료 이름을 같이 보인다 */
function Side({ label, activity, checked, onPick }: { label: string; activity: ActivityDetail; checked: boolean; onPick: () => void }) {
  const sources = [...new Set(activity.experiences.flatMap((e) => e.citations.map((c) => c.sourceName)))];
  const shown = activity.experiences.slice(0, 3);
  const category = categoryOf(activity);
  return (
    <label className={cn("grid min-w-0 cursor-pointer content-start gap-2 rounded-md border p-4 transition-colors", checked ? "border-ink bg-surface-soft" : "border-hairline hover:bg-surface-soft")}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="grid gap-1">
        <span className="line-clamp-3 flex items-start gap-1.5 break-words text-ui font-semibold text-ink">
          {category && <CategoryIcon category={category} className="mt-[0.3em]" />}{activity.name}
        </span>
        <span className="text-note text-muted tabular-nums">
          {periodText(activity.period)} · 경험 {activity.experiences.length}{category && ` · ${ACTIVITY_CATEGORIES[category]}`}
        </span>
      </span>
      {sources.length > 0 && (
        <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-note text-evidence">
          {sources.slice(0, 2).map((s) => <span key={s} className="inline-flex min-w-0 max-w-full items-center gap-1"><FileTextIcon className="size-[1.15em] shrink-0" aria-hidden="true" /><span className="truncate">{s}</span></span>)}
          {sources.length > 2 && <span className="text-muted">외 {sources.length - 2}개</span>}
        </span>
      )}
      {shown.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0 text-note text-body">
          {shown.map((e) => <li key={e.id} className="line-clamp-2 break-words before:mr-1.5 before:text-muted before:content-['·']">{e.content}</li>)}
          {activity.experiences.length > shown.length && <li className="text-muted">… 외 {activity.experiences.length - shown.length}개</li>}
        </ul>
      )}
      <span className="mt-1 flex min-h-8 items-center gap-2 text-note font-medium text-ink">
        <input type="radio" name="same-activity-keep" checked={checked} onChange={onPick} className="size-4 shrink-0 accent-[var(--ink)]" />
        이 이름 · 기간 남기기
      </span>
    </label>
  );
}
