"use client";

import type { ReactNode } from "react";
import { InfoIcon } from "@phosphor-icons/react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

/** ⓘ — 처음 한 번 읽으면 되는 규칙 · 한도 · 동작 설명을 접어 둔다. 누르면 열린다(터치에서도 열리게 Tooltip 이 아니라 Popover).
 *  설명하는 제목 · 라벨 바로 옆에 두고, 안의 글은 2문장 이하.
 *  모르고 누르면 손해인 것(외부 전송 · 공개 · 되돌릴 수 없음)과 조건이 생길 때만 뜨는 경고는 접지 않고 펼쳐 둔다(FE#269) */
export function InfoTip({ label, children, className, align = "start" }: { label: string; children: ReactNode; className?: string; align?: "start" | "center" | "end" }) {
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" aria-label={`${label} 설명`}
        className={cn("inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-ink lg:size-6 data-[state=open]:text-ink", className)}>
        <InfoIcon className="size-4" aria-hidden="true" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align={align} sideOffset={4} collisionPadding={16} aria-label={`${label} 설명`}
        className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-hairline bg-canvas px-3.5 py-3 text-note leading-relaxed text-body shadow-float">
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
