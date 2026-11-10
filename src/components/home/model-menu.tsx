"use client";

import { DropdownMenu } from "radix-ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";

export function ModelMenu() {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger className="ml-auto inline-flex min-h-11 lg:min-h-10 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs text-muted hover:bg-surface-soft" aria-label="모델 선택 — 기본 모델">기본 모델<CaretDownIcon aria-hidden="true" /></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} collisionPadding={16} className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-hairline bg-canvas p-2 text-ink shadow-float">
      <DropdownMenu.Label className="px-3 py-2 text-xs text-muted">분석 · 추천에 쓰는 AI</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value="default"><DropdownMenu.RadioItem value="default" className="flex min-h-11 lg:min-h-10 cursor-pointer items-center gap-3 rounded-sm px-3 py-2 outline-none data-highlighted:bg-surface-soft"><span className="size-2 shrink-0 rounded-full bg-ink" /><span className="flex-1"><b className="block text-sm font-semibold">기본 모델</b><small className="block text-note text-muted">팀이 제공하는 모델 — 따로 설정할 것 없어요</small></span><DropdownMenu.ItemIndicator><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup>
      <DropdownMenu.Item disabled className="flex min-h-11 lg:min-h-10 items-center gap-3 px-3 py-2 text-muted"><span className="size-2 shrink-0 rounded-full bg-hairline" /><span><b className="block text-sm font-semibold">내 API 키로</b><small className="block text-note">아직 제공하지 않아요</small></span></DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
