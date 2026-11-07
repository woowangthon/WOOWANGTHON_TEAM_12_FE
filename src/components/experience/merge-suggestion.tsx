"use client";

import { useRef, useState } from "react";
import type { ActivityDetail, MergeSuggestion } from "@/lib/api/types";
import { periodText } from "@/lib/period";
import { Button } from "@/components/ui/button";

export function MergeSuggestionView({ activity, suggestion, onMerge, onDismiss }: {
  activity: ActivityDetail;
  suggestion: MergeSuggestion;
  onMerge: (keepId: number, fromId: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ action: "merge" | "dismiss"; message: string } | null>(null);
  const act = async (action: "merge" | "dismiss") => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "merge") await onMerge(suggestion.activityId, activity.id);
      else await onDismiss(activity.id);
    } catch (e) {
      setError({ action, message: e instanceof Error ? e.message : "요청을 처리하지 못했어요." });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="같은 활동 제안" aria-busy={busy} className="grid gap-3 border-b border-hairline bg-surface-soft px-4.5 py-4 lg:px-7">
      <p className="m-0 text-xs font-medium text-muted">AI 제안</p>
      <p className="m-0 text-sm font-semibold">기존 활동과 같아 보여요</p>
      <dl className="m-0 grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0"><dt className="text-xs text-muted">새 활동</dt><dd className="m-0 mt-1 break-words">{activity.name}<span className="mt-1 block text-xs text-muted">{periodText(activity.period)}</span></dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted">기존 활동</dt><dd className="m-0 mt-1 break-words">{suggestion.name}<span className="mt-1 block text-xs text-muted">{periodText(suggestion.period)}</span></dd></div>
      </dl>
      <p className="m-0 text-note leading-relaxed text-body">붙이면 기존 활동의 이름·기간을 유지하고 경험과 근거를 모두 옮겨요.</p>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" size="sm" disabled={busy} onClick={() => void act("merge")}>붙이기</Button>
        <Button className="min-h-11" size="sm" variant="secondary" disabled={busy} onClick={() => void act("dismiss")}>따로 두기</Button>
      </div>
      {busy && <p role="status" className="m-0 text-sm text-muted">저장하고 있어요…</p>}
      {error && <div className="grid justify-items-start gap-2">
        <p role="alert" className="m-0 text-sm text-error">{error.message}</p>
        <Button className="min-h-11" size="sm" variant="secondary" onClick={() => void act(error.action)}>다시 시도</Button>
      </div>}
    </section>
  );
}
