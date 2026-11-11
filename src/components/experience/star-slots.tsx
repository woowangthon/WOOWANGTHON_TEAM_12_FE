"use client";

// 경험 STAR 칸(S-95 · S-96 · DESIGN.md 「경험 줄 — STAR 칸」 · FE#497).
// 칸은 근거 발췌 · 보완 글로만 찬다 — 차곡이는 채우지 않고 빈칸을 묻는다. 퍼센트 · 「N/4」 · 막대는 두지 않는다(SPEC §0)
import { useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { InlineTextarea } from "./inline-edit";
import { answerStarSlot, resortStar, updateStarSlot } from "@/lib/api/experience";
import type { Experience, Star, StarSlot, StarSlotName } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** 칸 이름 — 계약의 「과제 · 내 몫」 · 「행동과 노력」을 줄 안에선 짧게(DESIGN.md) */
export const STAR_LABEL: Record<StarSlotName, string> = { S: "상황", T: "과제", A: "행동", R: "결과 · 배운 점" };
/** 입력칸 이름 · 질문이 없는 빈칸의 안내 글 */
const STAR_FULL: Record<StarSlotName, string> = { S: "상황", T: "과제 · 내 몫", A: "행동과 노력", R: "결과 및 배운 점" };
export const STAR_MAX = 1000;

/** 칸을 보일 상태인가 — NONE · ANALYZING 은 칸이 없고, FAILED 는 이전 칸이 있을 때만 */
export const hasStarSlots = (star: Star | undefined): star is Star => !!star && star.slots.length === 4 && star.status !== "NONE" && star.status !== "ANALYZING";
/** 메타 줄 오른쪽 — S● T○ A● R○. 글자와 점을 함께(색만으로 가르지 않는다). 정리 중이면 그 자리에 글자.
 * 정리 안 한(NONE) 경험은 BE 가 알아서 나누니 아무것도 안 그린다(ADR-018). 칸이 없는 FAILED 만 「다시 시도」 */
export function StarToggle({ star, open, onClick, onRetry, retrying = false }: { star: Star | undefined; open: boolean; onClick: () => void; onRetry?: () => void; retrying?: boolean }) {
  if (star?.status === "ANALYZING") return <span role="status" className="inline-flex items-center gap-1 text-xs text-muted">
    <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />STAR 정리 중
  </span>;
  if (star?.status === "FAILED" && !hasStarSlots(star)) return onRetry ? <button type="button" onClick={onRetry} disabled={retrying}
    className="inline-flex min-h-8 items-center rounded-md px-1 py-0.5 text-xs font-medium text-error hover:bg-surface-soft disabled:opacity-50">
    STAR 정리하지 못했어요 · 다시 시도
  </button> : null;
  if (!hasStarSlots(star)) return null;
  const filled = star.slots.filter((s) => s.text !== null).length;
  return <button type="button" onClick={onClick} aria-expanded={open}
    aria-label={`STAR 칸 — 찬 칸 ${filled} · 빈칸 ${4 - filled}, ${open ? "접기" : "펼치기"}`}
    className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted tabular-nums hover:bg-surface-soft hover:text-ink">
    {star.slots.map((s) => <span key={s.slot} className="inline-flex items-center gap-0.5" data-star-slot={s.slot} data-filled={s.text !== null}>
      {s.slot}
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", s.text !== null ? "bg-body" : "border border-muted-soft")} />
    </span>)}
    <CaretDownIcon className={cn("size-[1.15em] transition-transform", open && "rotate-180")} aria-hidden="true" />
  </button>;
}

type PanelProps = {
  experience: Experience;
  /** 서버가 돌려준 경험(바뀐 star · supplements) */
  onSaved: (experience: Experience) => void;
  /** 「원문」 — 그 경험의 근거를 연다 */
  onShowCitations: () => void;
  /** FAILED 의 「다시 시도」 — 활동 단위(계약). 없으면 버튼을 숨긴다 */
  onRetry?: () => void;
  retrying?: boolean;
};

/** 펼친 네 칸 — 근거 펼침과 같은 면(surface-soft). 줄 사이는 여백만(상자 안 상자 없음) */
export function StarPanel({ experience: e, onSaved, onShowCitations, onRetry, retrying = false }: PanelProps) {
  const star = e.star;
  const [resorting, setResorting] = useState(false);
  const [resortError, setResortError] = useState<string | null>(null);
  if (!hasStarSlots(star)) return null;
  // 「다시 나누기」 — 이 경험 하나만(세지 않는다). 응답은 ANALYZING 이라 이 패널은 접히고 점 자리에 「STAR 정리 중」이 뜬다
  const resort = async () => {
    if (resorting) return;
    setResorting(true); setResortError(null);
    try { onSaved(await resortStar(e.id)); }
    catch (err) { setResortError(`다시 나누지 못했어요. ${errorText(err)}`); }
    finally { setResorting(false); }
  };
  return <div className="grid gap-3.5 rounded-sm bg-surface-soft px-3.5 py-3" aria-label="STAR 칸">
    {star.status === "FAILED" && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="m-0 text-note font-medium text-error">정리하지 못했어요</p>
      {onRetry && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-8" disabled={retrying} onClick={onRetry}>다시 시도</Button>}
    </div>}
    {star.slots.map((slot) => <StarRow key={`${slot.slot}-${slot.text === null}`} experience={e} slot={slot} onSaved={onSaved} onShowCitations={onShowCitations} />)}
    {star.hasNew && star.status !== "FAILED" && <div className="grid justify-items-start gap-1">
      <button type="button" onClick={() => void resort()} disabled={resorting}
        className="-mx-1 rounded-md px-1 py-0.5 text-note font-medium text-muted underline-offset-3 hover:bg-surface-strong hover:text-ink hover:underline disabled:opacity-50 max-lg:min-h-11">
        {resorting ? "다시 나누는 중…" : "새 답 넣어 다시 나누기"}
      </button>
      {resortError && <p role="alert" className="m-0 text-note text-error">{resortError}</p>}
    </div>}
  </div>;
}

const errorText = (err: unknown) => err instanceof Error ? err.message : "다시 시도해 주세요.";

/** 칸 한 줄 — 빈칸은 질문을 안내 글로 품은 입력칸, 찬 칸은 글을 누르면 그 자리에서 고친다(DESIGN.md 「그 자리 고치기」).
 * 빈칸에 쓰고 밖을 누르면 보완으로 저장(AI 안 부름), 찬 칸을 비우고 저장하면 빈칸이 된다(원문 근거 · 보완은 지우지 않는다 — 계약) */
function StarRow({ experience: e, slot, onSaved, onShowCitations }: { experience: Experience; slot: StarSlot } & Pick<PanelProps, "onSaved" | "onShowCitations">) {
  const empty = slot.text === null;
  // 빈칸은 늘 입력칸(draft = "") · 찬 칸은 누를 때만(draft = null 이면 글자)
  const [draft, setDraft] = useState<string | null>(empty ? "" : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const display = useRef<HTMLButtonElement>(null);
  const reset = (refocus: boolean) => {
    setDraft(empty ? "" : null); setError(null);
    if (refocus && !empty) requestAnimationFrame(() => display.current?.focus());
  };
  const commit = async () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft === null || pending.current) return;
    const text = draft.trim();
    if (text === (slot.text ?? "")) { reset(false); return; }
    pending.current = true; setSaving(true); setError(null);
    try {
      // 응답엔 usedIn 이 없다 — 부모가 이어 붙인다
      onSaved(empty ? await answerStarSlot(e.id, slot.slot, text) : await updateStarSlot(e.id, slot.slot, text));
      // 빈칸 ↔ 찬 칸이 바뀌면 이 줄은 새로 그려진다(key) — 같은 모양이면 여기서 닫는다
      setDraft(empty ? "" : null);
    } catch (err) { setError(`저장하지 못했어요. ${errorText(err)}`); }
    finally { pending.current = false; setSaving(false); }
  };

  return <div className="grid min-w-0 gap-1" data-star-row={slot.slot}>
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
        {slot.slot} {STAR_LABEL[slot.slot]}
        {slot.slot === "R" && <InfoTip label="결과 · 배운 점" className="max-lg:-my-3">배운 점은 차곡이가 채우지 않아요. 내가 답한 글로만 채워져요.</InfoTip>}
      </span>
      <span className="flex-1" />
      {slot.sourceType === "CITATION" && <button type="button" onClick={onShowCitations} title="이 칸의 근거 보기" className="rounded-md px-1 text-xs font-medium text-evidence hover:bg-evidence-soft">원문</button>}
    </div>
    {draft !== null
      ? <InlineTextarea label={`${STAR_FULL[slot.slot]} 칸 글`} value={draft} autoFocus={!empty} maxLength={STAR_MAX}
        placeholder={empty ? slot.question ?? `${STAR_FULL[slot.slot]}을 적어 주세요` : undefined}
        onChange={(v) => { setDraft(v); setError(null); }} onCommit={() => void commit()}
        onCancel={() => { cancelled.current = true; reset(true); if (empty) (document.activeElement as HTMLElement | null)?.blur(); }}
        saving={saving} error={error} className="bg-canvas text-sm leading-relaxed text-body max-lg:min-h-11" />
      : <button ref={display} type="button" onClick={() => { cancelled.current = false; setError(null); setDraft(slot.text ?? ""); }}
        aria-label={`${STAR_FULL[slot.slot]} 고치기: ${slot.text}`} title="눌러서 고치기"
        className="-mx-1 rounded-sm px-1 py-0.5 text-left text-sm leading-relaxed whitespace-pre-wrap break-words text-body hover:bg-surface-strong">
        {slot.text}
      </button>}
  </div>;
}
