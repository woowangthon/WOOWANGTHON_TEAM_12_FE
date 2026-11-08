"use client";

// 활동 단위로 수행 주체를 한 번에 정한다(S-76) — 그 활동의 「누가 했는지 모름」 경험만 바뀐다. 이미 정한 경험 · 출처 상태는 그대로
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { decideActivityActor } from "@/lib/api/experience";
import type { ActivityDetail, Actor, Experience } from "@/lib/api/types";

type Decided = Exclude<Actor, "UNKNOWN">;
const DONE: Record<Decided, string> = { ME: "내가 한 일로", TEAM: "팀이 한 일로" };

/** 「누가 했는지 확인 안 된 경험 N개 · 내가 했어요 · 팀이 했어요」 — 없으면 정한 뒤 안내만 남는다.
 *  활동을 열 때 확인 안 된 경험이 있었을 때만 보인다 — 경험 하나를 「알 수 없음」으로 고치는 중에 목록 위에 나타나 고치던 줄을 밀지 않게 */
export function ActivityActorDecision({ activity, onSaved }: { activity: ActivityDetail; onSaved: (experience: Experience) => void }) {
  const unknown = activity.experiences.filter((e) => e.actor === "UNKNOWN");
  const [offered] = useState(() => unknown.length > 0);
  const [busy, setBusy] = useState<Decided | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ actor: Decided; changed: number } | null>(null);
  const pending = useRef(false);

  const decide = async (actor: Decided) => {
    if (pending.current) return;
    pending.current = true; setBusy(actor); setError(null);
    try {
      const { changed } = await decideActivityActor(activity.id, actor);
      // BE 는 UNKNOWN 경험만 바꾼다 — 받아 둔 목록도 같은 규칙으로 옮긴다(다시 받지 않는다)
      for (const e of unknown) onSaved({ ...e, actor });
      setDone({ actor, changed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "주체를 정하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      pending.current = false; setBusy(null);
    }
  };

  if (!offered) return null;
  if (!unknown.length) {
    return done ? <p role="status" className="m-0 mt-4 rounded-sm bg-surface-soft px-3 py-2.5 text-note leading-relaxed text-body">
      경험 {done.changed}개를 {DONE[done.actor]} 정했어요. 이 활동으로 만든 초안은 다시 만들면 반영돼요(분석 횟수 안 씀).
    </p> : null;
  }
  return <section aria-label="수행 주체 정하기" className="mt-4 grid gap-2 rounded-sm bg-surface-soft px-3 py-2.5">
    <p className="m-0 text-note leading-relaxed text-body">
      누가 했는지 확인 안 된 경험 {unknown.length}개 — 정해 두면 초안이 「제가」 · 「팀은」으로 써요.
    </p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={!!busy} onClick={() => void decide("ME")}>{busy === "ME" ? "정하고 있어요…" : "이 활동의 일은 내가 했어요"}</Button>
      <Button size="sm" variant="secondary" className="min-h-11" disabled={!!busy} onClick={() => void decide("TEAM")}>{busy === "TEAM" ? "정하고 있어요…" : "팀이 했어요"}</Button>
    </div>
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </section>;
}
