"use client";

// 경험 하나를 공개 프로필에 넣고 빼기 (SPEC S-65) — 「확인 필요」는 넣을 수 없고, 뺄 수는 언제나 있다
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { setExperienceShared } from "@/lib/api/share";
import type { Experience } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const NEEDS_REVIEW = "먼저 확인해 주세요";

export function ProfileToggle({ experience: e, onSaved }: { experience: Experience; onSaved: (experience: Experience) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = e.shared === true;
  const review = e.sourceStatus === "NEEDS_REVIEW";

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const saved = await setExperienceShared(e.id, !shared);
      onSaved({ ...e, shared: saved.shared === true });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "EXPERIENCE_NEEDS_REVIEW" ? NEEDS_REVIEW : "프로필에 넣기를 바꾸지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 text-[13px] font-medium text-muted">
      <button type="button" role="switch" aria-checked={shared} aria-label={`프로필에 넣기: ${e.content}`} disabled={busy || (review && !shared)} onClick={() => void toggle()}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm disabled:cursor-default disabled:opacity-50 lg:min-h-8">
        <span aria-hidden="true" className={cn("flex h-4 w-7 items-center rounded-full p-0.5 transition-colors", shared ? "justify-end bg-primary" : "justify-start bg-surface-strong")}>
          <span className="size-3 rounded-full bg-canvas" />
        </span>
        프로필에 넣기
      </button>
      {review && !shared && <span>{NEEDS_REVIEW}</span>}
      {review && shared && <span>확인이 필요해 공개에서 빠져 있어요</span>}
      {shared && !review && <Link href="/connections#public-profile" className="underline-offset-3 hover:underline">공개 설정</Link>}
      {error && <span role="alert" className="text-error">{error}</span>}
    </div>
  );
}
