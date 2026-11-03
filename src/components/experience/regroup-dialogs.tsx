"use client";

// 바로잡기 — 경험 옮기기(메뉴) · 활동 합치기 (SPEC S-12 · S-13 · DESIGN.md 「⋯ 메뉴」)
// 옮기기는 고르는 순간 옮긴다(다시 옮기면 되돌아간다). 합치기는 되돌리기가 없어서 무엇이 어디로 가는지 한 번 확인받는다
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ActivitySummary, Experience } from "@/lib/api/types";
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
          <DialogDescription className="line-clamp-2 text-[15px] text-body">{experience?.content}</DialogDescription>
        </DialogHeader>
        <p className="m-0 text-[13px] text-muted">내용 · 근거 · 출처 상태는 그대로 두고 묶음만 바꿔요.</p>
        {others.length === 0 ? (
          <p className="m-0 text-sm text-muted">옮길 다른 활동이 없어요.</p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0" aria-label="옮길 활동">
            {others.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => experience && onPick(experience, a.id)}
                  className="grid min-h-11 w-full gap-0.5 rounded-sm px-3 py-2.5 text-left hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
                >
                  <span className="text-[15px] font-semibold text-ink">{a.name}</span>
                  <span className="text-[13px] text-muted tabular-nums">{periodText(a.period)} · 경험 {a.experienceCount}</span>
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
          <DialogDescription className="text-[15px] text-body">
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

function Choice({ name, checked, onChange, title, sub }: { name: string; checked: boolean; onChange: () => void; title: string; sub: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft", checked && "bg-surface-soft")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 accent-[var(--ink)]" />
      <span className="grid gap-0.5">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        <span className="text-[13px] text-muted tabular-nums">{sub}</span>
      </span>
    </label>
  );
}
