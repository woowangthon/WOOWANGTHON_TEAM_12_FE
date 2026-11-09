"use client";

// 경험 저장 켜기 · 끄기 (SPEC S-71) — 응답을 받은 뒤에만 바뀌므로 실패하면 그대로 두고 오류를 보인다. 본문 · 근거 · 출처 상태는 건드리지 않는다
import { BookmarkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { setExperienceSaved } from "@/lib/api/experience";
import type { Experience } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** compact — 활동 세부의 경험 줄 오른쪽 위(「…」 옆)에 아이콘만 둔다(FE#272). 글자는 읽기 프로그램에만 */
export function ExperienceSave({ experience: e, onChange, compact = false }: { experience: Pick<Experience, "id" | "content" | "saved">; onChange: (saved: boolean) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saved = e.saved === true;
  const label = saved ? "저장함" : "저장";

  async function toggle() {
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

  return (
    <span className={compact ? "relative shrink-0" : "contents"}>
      <button type="button" aria-pressed={saved} aria-label={`${label}: ${e.content}`} disabled={busy} onClick={() => void toggle()}
        title={compact ? (saved ? "저장함 — 누르면 저장을 풀어요" : "저장 — 저장한 경험에서 다시 찾아요") : undefined}
        className={cn("inline-flex min-h-11 items-center gap-1 rounded-md text-note hover:bg-surface-soft disabled:cursor-default disabled:opacity-50",
          compact ? "size-11 shrink-0 justify-center" : "px-1 lg:min-h-8", saved ? "font-semibold text-ink" : "font-medium text-muted")}>
        <BookmarkSimpleIcon className={compact ? "size-4.5" : "size-[1.15em]"} weight={saved ? "fill" : "regular"} aria-hidden="true" />
        <span className={compact ? "sr-only" : undefined}>{label}</span>
      </button>
      {/* compact 는 줄 맨 위 아이콘 옆이라 자리가 없다 — 버튼 아래에 띄운다 */}
      {error && <span role="alert" className={cn("text-note font-medium text-error", compact && "absolute top-full right-0 z-10 w-max max-w-60 rounded-sm bg-canvas px-2 py-1 shadow-float")}>저장을 바꾸지 못했어요. 다시 시도해 주세요.</span>}
    </span>
  );
}
