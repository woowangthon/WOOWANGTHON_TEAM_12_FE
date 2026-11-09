"use client";

// 경험 하나를 공개 프로필에 넣고 빼기 (SPEC S-65) — 「확인 필요」는 넣을 수 없고, 뺄 수는 언제나 있다.
// 자주 쓰는 게 아니라 경험 「…」 메뉴의 체크 항목으로 둔다(FE#272). 줄에는 알릴 것(공개에서 빠짐 · 오류)만 남긴다
import { CheckIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { setExperienceShared } from "@/lib/api/share";
import type { Experience } from "@/lib/api/types";

const NEEDS_REVIEW = "먼저 확인해 주세요";

export function useProfileShare(e: Experience, onSaved: (experience: Experience) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = e.shared === true;
  const review = e.sourceStatus === "NEEDS_REVIEW";

  async function toggle() {
    if (busy) return;
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

  return { shared, review, busy, error, toggle };
}

type Share = ReturnType<typeof useProfileShare>;

export const MENU_ITEM = "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft data-disabled:cursor-default data-disabled:opacity-50";

/** 메뉴 체크 항목의 네모 — 저장 · 프로필에 넣기가 같이 쓴다 */
export function MenuCheckBox() {
  return <span className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-hairline" aria-hidden="true">
    <DropdownMenu.ItemIndicator><CheckIcon className="size-3" weight="bold" /></DropdownMenu.ItemIndicator>
  </span>;
}

/** 경험 메뉴 안 — 「프로필에 넣기」 체크 · 넣었으면 「공개 설정」 */
export function ProfileMenuItems({ share: s }: { share: Share }) {
  return <>
    <DropdownMenu.CheckboxItem checked={s.shared} disabled={s.busy || (s.review && !s.shared)} onSelect={() => void s.toggle()} className={MENU_ITEM}>
      <MenuCheckBox />
      <span className="grid">
        프로필에 넣기
        {s.review && !s.shared && <span className="text-xs text-muted">{NEEDS_REVIEW}</span>}
      </span>
    </DropdownMenu.CheckboxItem>
    {s.shared && <DropdownMenu.Item asChild className={MENU_ITEM}><Link href="/connections#public-profile">공개 설정</Link></DropdownMenu.Item>}
  </>;
}

/** 줄에 남기는 것 — 넣었는데 확인이 필요해 빠진 경우 · 바꾸기 실패. 없으면 아무것도 그리지 않는다 */
export function ProfileShareNote({ share: s }: { share: Share }) {
  if (!s.error && !(s.review && s.shared)) return null;
  return <p className="m-0 flex flex-wrap gap-x-3 text-note font-medium text-muted">
    {s.review && s.shared && <span>확인이 필요해 공개에서 빠져 있어요</span>}
    {s.error && <span role="alert" className="text-error">{s.error}</span>}
  </p>;
}
