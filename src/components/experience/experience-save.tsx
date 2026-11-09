"use client";

// 경험 저장 켜기 · 끄기 (SPEC S-71) — 응답을 받은 뒤에만 바뀌므로 실패하면 그대로 두고 오류를 보인다. 본문 · 근거 · 출처 상태는 건드리지 않는다
import { BookmarkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { setExperienceSaved } from "@/lib/api/experience";
import type { Experience } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const SAVE_ERROR = "저장을 바꾸지 못했어요. 다시 시도해 주세요.";

/** 활동 세부는 경험 「…」 메뉴 항목으로(FE#293), 검색 결과는 아래 버튼으로 쓴다 */
export function useExperienceSave(e: Pick<Experience, "id" | "saved">, onChange: (saved: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saved = e.saved === true;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      onChange((await setExperienceSaved(e.id, !saved)).saved === true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { saved, busy, error, toggle };
}

export function ExperienceSave({ experience: e, onChange }: { experience: Pick<Experience, "id" | "content" | "saved">; onChange: (saved: boolean) => void }) {
  const { saved, busy, error, toggle } = useExperienceSave(e, onChange);
  const label = saved ? "저장함" : "저장";
  return (
    <>
      <button type="button" aria-pressed={saved} aria-label={`${label}: ${e.content}`} disabled={busy} onClick={() => void toggle()}
        className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-note hover:bg-surface-soft disabled:cursor-default disabled:opacity-50 lg:min-h-8", saved ? "font-semibold text-ink" : "font-medium text-muted")}>
        <BookmarkSimpleIcon className="size-[1.15em]" weight={saved ? "fill" : "regular"} aria-hidden="true" />
        {label}
      </button>
      {error && <span role="alert" className="text-note font-medium text-error">{SAVE_ERROR}</span>}
    </>
  );
}
