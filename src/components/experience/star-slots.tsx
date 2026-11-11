"use client";

// 경험 STAR 칸(S-95 · S-96 · DESIGN.md 「경험 줄 — STAR 칸」 · FE#497).
// 칸은 근거 발췌 · 보완 글로만 찬다 — 차곡이는 채우지 않고 빈칸을 묻는다. 퍼센트 · 「N/4」 · 막대는 두지 않는다(SPEC §0)
import { useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { AnalysisButton } from "@/components/auth/analysis-cost";
import { AnswerForm } from "@/components/questions/clarifications";
import { answerStarSlot, updateStarSlot } from "@/lib/api/experience";
import type { Experience, Star, StarSlot, StarSlotName } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** 칸 이름 — 계약의 「과제 · 내 몫」 · 「행동과 노력」을 줄 안에선 짧게(DESIGN.md) */
export const STAR_LABEL: Record<StarSlotName, string> = { S: "상황", T: "과제", A: "행동", R: "결과 · 배운 점" };
/** 질문이 없는 빈칸에 답할 때 입력칸 이름 */
const STAR_FULL: Record<StarSlotName, string> = { S: "상황", T: "과제 · 내 몫", A: "행동과 노력", R: "결과 및 배운 점" };
export const STAR_MAX = 1000;

/** 칸을 보일 상태인가 — NONE · ANALYZING 은 칸이 없고, FAILED 는 이전 칸이 있을 때만 */
export const hasStarSlots = (star: Star | undefined): star is Star => !!star && star.slots.length === 4 && star.status !== "NONE" && star.status !== "ANALYZING";
/** 「STAR 로 정리」 대상 — 정리 안 함 · 실패 · 근거가 바뀜 */
export const needsStar = (e: Experience) => !!e.star && (e.star.status === "NONE" || e.star.status === "STALE" || e.star.status === "FAILED");

/** 메타 줄 오른쪽 — S● T○ A● R○. 글자와 점을 함께(색만으로 가르지 않는다). 정리 중이면 그 자리에 글자 */
export function StarToggle({ star, open, onClick }: { star: Star | undefined; open: boolean; onClick: () => void }) {
  if (star?.status === "ANALYZING") return <span role="status" className="inline-flex items-center gap-1 text-xs text-muted">
    <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />STAR 정리 중
  </span>;
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
  /** STALE · FAILED 의 「다시 정리」 — 활동 단위(계약). 없으면 버튼을 숨긴다 */
  onOrganize?: () => void;
  organizing?: boolean;
};

/** 펼친 네 칸 — 근거 펼침과 같은 면(surface-soft). 줄 사이는 여백만(상자 안 상자 없음) */
export function StarPanel({ experience: e, onSaved, onShowCitations, onOrganize, organizing = false }: PanelProps) {
  const star = e.star;
  if (!hasStarSlots(star)) return null;
  return <div className="grid gap-3.5 rounded-sm bg-surface-soft px-3.5 py-3" aria-label="STAR 칸">
    {(star.status === "STALE" || star.status === "FAILED") && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className={cn("m-0 text-note", star.status === "FAILED" ? "font-medium text-error" : "text-muted")}>
        {star.status === "FAILED" ? "정리하지 못했어요" : "근거가 바뀌었어요"}
      </p>
      {onOrganize && <AnalysisButton variant="secondary" size="sm" className="min-h-11 lg:min-h-8" running={organizing} disabled={organizing} onClick={onOrganize}>다시 정리</AnalysisButton>}
    </div>}
    {star.slots.map((slot) => <StarRow key={slot.slot} experience={e} slot={slot} onSaved={onSaved} onShowCitations={onShowCitations} />)}
  </div>;
}

const errorText = (err: unknown) => err instanceof Error ? err.message : "다시 시도해 주세요.";

function StarRow({ experience: e, slot, onSaved, onShowCitations }: { experience: Experience; slot: StarSlot } & Pick<PanelProps, "onSaved" | "onShowCitations">) {
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  const name = <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
    {slot.slot} {STAR_LABEL[slot.slot]}
    {slot.slot === "R" && <InfoTip label="결과 · 배운 점" className="max-lg:-my-3">배운 점은 차곡이가 채우지 않아요. 내가 답한 글로만 채워져요.</InfoTip>}
  </span>;
  // 응답엔 usedIn 이 없다 — 부모가 이어 붙인다
  const answer = async (text: string) => {
    try { onSaved(await answerStarSlot(e.id, slot.slot, text)); return null; }
    catch (err) { return `저장하지 못했어요. ${errorText(err)}`; }
  };

  if (slot.text === null) {
    const label = slot.question ?? STAR_FULL[slot.slot];
    return <div className="grid min-w-0 gap-1" data-star-row={slot.slot}>
      {name}
      {slot.question || writing
        ? <AnswerForm head={null} label={label} disabled={false} maxLength={STAR_MAX} onSave={answer} inputClassName="bg-canvas"
          question={slot.question && <b className="text-sm font-semibold text-ink">{slot.question}</b>} />
        : <button type="button" onClick={() => setWriting(true)} className="justify-self-start rounded-md px-1 py-0.5 text-note font-medium text-muted underline-offset-3 hover:text-ink hover:underline">
          직접 쓰기<span className="sr-only">: {STAR_FULL[slot.slot]}</span>
        </button>}
    </div>;
  }

  return <div className="grid min-w-0 gap-1" data-star-row={slot.slot}>
    <div className="flex items-center gap-2">
      {name}
      <span className="flex-1" />
      {slot.sourceType === "CITATION"
        ? <button type="button" onClick={onShowCitations} title="이 칸의 근거 보기" className="rounded-md px-1 text-xs font-medium text-evidence hover:bg-evidence-soft">원문</button>
        : <span className="text-xs text-muted">내 답</span>}
    </div>
    {editing
      ? <StarEdit slot={slot} onCancel={() => setEditing(false)} onSave={async (text) => {
        try { onSaved(await updateStarSlot(e.id, slot.slot, text)); setEditing(false); return null; }
        catch (err) { return `저장하지 못해 원래 글을 그대로 뒀어요. ${errorText(err)}`; }
      }} />
      : <button type="button" onClick={() => setEditing(true)} aria-label={`${STAR_FULL[slot.slot]} 고치기: ${slot.text}`}
        className="-mx-1 rounded-sm px-1 py-0.5 text-left text-sm leading-relaxed whitespace-pre-wrap break-words text-body hover:bg-surface-strong">
        {slot.text}
      </button>}
  </div>;
}

/** 찬 칸 그 자리 고치기 — 비우고 저장하면 빈칸이 된다(원문 근거 · 보완은 지우지 않는다 — 계약) */
function StarEdit({ slot, onSave, onCancel }: { slot: StarSlot; onSave: (text: string) => Promise<string | null>; onCancel: () => void }) {
  const [draft, setDraft] = useState(slot.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const save = async () => {
    if (pending.current) return;
    const text = draft.trim();
    if (text === slot.text) { onCancel(); return; }
    pending.current = true; setSaving(true); setError(null);
    try { setError(await onSave(text)); }
    finally { pending.current = false; setSaving(false); }
  };
  return <form className="grid gap-2" aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); void save(); }}>
    <textarea autoFocus rows={3} maxLength={STAR_MAX} value={draft} disabled={saving} aria-label={`${STAR_FULL[slot.slot]} 칸 글`}
      onChange={(ev) => { setDraft(ev.target.value); setError(null); }}
      className="w-full rounded-sm border border-hairline bg-canvas p-2 text-base text-body sm:text-sm" />
    <p className="m-0 text-xs text-muted">{slot.sourceType === "CITATION" ? "원문 근거는 그대로 남고, 고친 글이 「내 답」으로 이 칸을 채워요." : "비우고 저장하면 빈칸이 돼요."}</p>
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
    <div className="flex gap-2">
      <Button type="submit" size="sm" className="min-h-11 lg:min-h-8" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 lg:min-h-8" disabled={saving} onClick={onCancel}>취소</Button>
    </div>
  </form>;
}
