"use client";

// 바로잡기 — 경험 옮기기(메뉴) · 활동 합치기 (SPEC S-12 · S-13 · DESIGN.md 「⋯ 메뉴」)
// 옮기기는 고르는 순간 옮긴다(다시 옮기면 되돌아간다). 합치기는 되돌리기가 없어서 무엇이 어디로 가는지 한 번 확인받는다
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ActivityDetail, ActivitySummary, Experience } from "@/lib/api/types";
import { periodText } from "@/lib/period";

export function MoveExperienceDialog({ experience, activities, onClose, onPick }: {
  experience: Experience | null;
  activities: ActivitySummary[];
  onClose: () => void;
  onPick: (experience: Experience, toActivityId: number) => void;
}) {
  const others = activities.filter((a) => a.id !== experience?.activityId);
  return (
    <Dialog open={experience != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>다른 활동으로 옮기기</DialogTitle>
          <DialogDescription className="line-clamp-2 text-ui text-body">{experience?.content}</DialogDescription>
        </DialogHeader>
        <p className="m-0 text-note text-muted">내용 · 근거 · 출처 상태는 그대로 두고 묶음만 바꿔요.</p>
        {others.length === 0 ? (
          <p className="m-0 text-sm text-muted">옮길 다른 활동이 없어요.</p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0" aria-label="옮길 활동">
            {others.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => experience && onPick(experience, a.id)}
                  className="grid min-h-11 lg:min-h-10 w-full gap-0.5 rounded-sm px-3 py-2.5 text-left hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
                >
                  <span className="text-ui font-semibold text-ink">{a.name}</span>
                  <span className="text-note text-muted tabular-nums">{periodText(a.period)} · 경험 {a.experienceCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MergeActivityDialog({ activity, activities, open, onOpenChange, onMerge }: {
  activity: ActivitySummary;
  activities: ActivitySummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 실패하면 던진다 — 창을 열어 둔 채 이유를 보여 준다 */
  onMerge: (keepId: number, fromId: number) => Promise<void>;
}) {
  const others = activities.filter((a) => a.id !== activity.id);
  const [otherId, setOtherId] = useState<number | null>(null);
  const [keepThis, setKeepThis] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = others.find((a) => a.id === otherId) ?? null;
  const keep = other && (keepThis ? activity : other);
  const from = other && (keepThis ? other : activity);

  const change = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setOtherId(null);
      setKeepThis(true);
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!keep || !from || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMerge(keep.id, from.id);
      setOtherId(null);
      setKeepThis(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "합치지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>다른 활동과 합치기</DialogTitle>
          <DialogDescription className="text-ui text-body">
            같은 활동이 둘로 나뉘었으면 하나로 모아요. 경험과 근거는 하나도 잃지 않아요.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="m-0 grid gap-1 border-0 p-0" disabled={busy}>
          <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">「{activity.name}」과 합칠 활동</legend>
          {others.length === 0 && <p className="m-0 text-sm text-muted">합칠 다른 활동이 없어요.</p>}
          {others.map((a) => (
            <Choice key={a.id} name="merge-other" checked={a.id === otherId} onChange={() => setOtherId(a.id)}
              title={a.name} sub={`${periodText(a.period)} · 경험 ${a.experienceCount}`} />
          ))}
        </fieldset>

        {other && keep && from && (
          <>
            <fieldset className="m-0 grid gap-1 border-0 p-0" disabled={busy}>
              <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">남길 활동 — 이름과 기간은 이 활동 것을 써요</legend>
              <Choice name="merge-keep" checked={keepThis} onChange={() => setKeepThis(true)} title={activity.name} sub={periodText(activity.period)} />
              <Choice name="merge-keep" checked={!keepThis} onChange={() => setKeepThis(false)} title={other.name} sub={periodText(other.period)} />
            </fieldset>
            <p className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-sm leading-relaxed text-body" aria-live="polite">
              「{from.name}」의 경험 {from.experienceCount}개가 「{keep.name}」 뒤에 붙고, 「{from.name}」은 타임라인에서 사라져요.
              합친 뒤에는 되돌릴 수 없어요.
            </p>
          </>
        )}

        {error && <p className="m-0 text-sm font-medium text-error" role="alert">{error}</p>}

        <DialogFooter>
          <Button variant="link" onClick={() => change(false)} disabled={busy}>취소</Button>
          <Button onClick={submit} disabled={!other || busy}>{busy ? "합치는 중…" : "합치기"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const evidenceCount = (e: Experience) => {
  const supplements = e.supplements?.length ?? 0;
  return `근거 ${e.citations.length}개${supplements ? ` · 보완 ${supplements}개` : ""}`;
};

/** 경험 하나로 합치기(S-70) — 같은 활동 안의 겹치는 경험 둘. 남길 쪽의 본문 · 역량 · 출처 상태는 그대로이고 근거 · 보완만 모인다.
 *  되돌리는 API 가 없어 무엇이 사라지는지 보여 주고 한 번 확인받는다. 고르는 방식은 FE 몫(ADR-002) — 끌기 대신 고르기(모바일 · 키보드) */
export function MergeExperienceDialog({ experience, experiences, onClose, onMerge }: {
  /** 메뉴를 연 경험 — null 이면 닫힘 */
  experience: Experience | null;
  /** 같은 활동의 경험 전부 */
  experiences: Experience[];
  onClose: () => void;
  /** 실패하면 던진다 — 창을 열어 둔 채 이유를 보여 준다 */
  onMerge: (keepId: number, fromId: number) => Promise<void>;
}) {
  const others = experiences.filter((e) => e.id !== experience?.id && e.activityId === experience?.activityId);
  const [otherId, setOtherId] = useState<number | null>(null);
  const [keepThis, setKeepThis] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = others.find((e) => e.id === otherId) ?? null;
  const keep = experience && other && (keepThis ? experience : other);
  const from = experience && other && (keepThis ? other : experience);

  const reset = () => { setOtherId(null); setKeepThis(true); setError(null); };
  const change = (next: boolean) => {
    if (busy || next) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!keep || !from || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMerge(keep.id, from.id);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "합치지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={experience != null} onOpenChange={change}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>경험 하나로 합치기</DialogTitle>
          <DialogDescription className="text-ui text-body">
            같은 일을 말하는 경험이 둘이면 하나로 모아요. 근거와 보완은 하나도 잃지 않아요.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid max-h-[55dvh] gap-5 overflow-auto px-1">
          <fieldset className="m-0 grid gap-1 border-0 p-0" disabled={busy}>
            <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">함께 합칠 경험 — 같은 활동 안에서만 골라요</legend>
            {others.length === 0 && <p className="m-0 text-sm text-muted">이 활동에 합칠 다른 경험이 없어요.</p>}
            {others.map((e) => (
              <Choice key={e.id} name="merge-experience-other" checked={e.id === otherId} onChange={() => setOtherId(e.id)}
                title={e.content} sub={evidenceCount(e)} />
            ))}
          </fieldset>

          {experience && other && keep && from && (
            <>
              <fieldset className="m-0 grid gap-1 border-0 p-0" disabled={busy}>
                <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">남길 경험 — 본문 · 역량 · 출처 상태는 이 경험 것을 써요</legend>
                <Choice name="merge-experience-keep" checked={keepThis} onChange={() => setKeepThis(true)} title={experience.content} sub={evidenceCount(experience)} />
                <Choice name="merge-experience-keep" checked={!keepThis} onChange={() => setKeepThis(false)} title={other.content} sub={evidenceCount(other)} />
              </fieldset>
              <p className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-sm leading-relaxed text-body" aria-live="polite">
                「{from.content}」의 {evidenceCount(from)}가 남길 경험 아래로 옮겨지고, 이 경험은 사라져요. 지원 추천 · 초안에서도 남길 경험으로 바뀌어요.
                <b className="font-semibold text-ink"> 합친 뒤에는 되돌릴 수 없어요.</b>
              </p>
            </>
          )}
        </div>

        {error && <p className="m-0 text-sm font-medium text-error" role="alert">{error}</p>}

        <DialogFooter>
          <Button variant="link" onClick={() => change(false)} disabled={busy}>취소</Button>
          <Button onClick={submit} disabled={!other || busy}>{busy ? "합치는 중…" : "하나로 합치기"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({ name, checked, onChange, title, sub }: { name: string; checked: boolean; onChange: () => void; title: string; sub: string }) {
  return (
    <label className={cn("flex min-h-11 lg:min-h-10 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft", checked && "bg-surface-soft")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
      <span className="grid min-w-0 gap-0.5">
        <span className="line-clamp-3 break-words text-ui font-semibold text-ink">{title}</span>
        <span className="text-note text-muted tabular-nums">{sub}</span>
      </span>
    </label>
  );
}

/** 활동 지우기(S-88) — 한 번에 지워지는 양이 많고 되살리는 API 가 없어, 같이 지워지는 개수를 보이고 확인받는다.
 *  개수는 활동 세부의 경험 · 근거로 센다(계약 — 새 API 없음) */
export function DeleteActivityDialog({ activity, open, onOpenChange, onDelete }: {
  activity: ActivityDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 실패하면 던진다 — 창을 열어 둔 채 이유를 보여 준다. 활동은 그대로 */
  onDelete: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const experiences = activity?.experiences ?? [];
  const citations = experiences.reduce((sum, e) => sum + e.citations.length, 0);
  const supplements = experiences.reduce((sum, e) => sum + (e.supplements?.length ?? 0), 0);

  const change = (next: boolean) => {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const submit = async () => {
    if (!activity || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(activity.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "지우지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open && activity != null} onOpenChange={change}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>활동 지우기</DialogTitle>
          <DialogDescription className="text-ui text-body">「{activity?.name}」을 지울까요?</DialogDescription>
        </DialogHeader>
        <p className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-sm leading-relaxed text-body">
          {experiences.length === 0
            ? "경험 없음 — 활동만 지워져요."
            : `경험 ${experiences.length}개 · 근거 ${citations}개${supplements ? ` · 보완 ${supplements}개` : ""}도 같이 지워져요.`}
          <br />
          원본 자료는 남아요. 지운 뒤에는 되돌릴 수 없어요.
        </p>
        {error && <p className="m-0 text-sm font-medium text-error" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="link" onClick={() => change(false)} disabled={busy}>취소</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "지우는 중…" : error ? "다시 시도" : "지우기"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
