"use client";

import { createContext, useContext, useRef, useState, type ComponentProps, type MouseEvent, type PointerEvent } from "react";
import { DropdownMenu } from "radix-ui";

// 드롭다운 메뉴의 Root · Trigger 대신 쓴다(FE#640). Radix 는 손가락이 닿는 순간(pointerdown) 메뉴를 열어서
// 「…」 위에서 스크롤을 시작해도 팝업이 올라온다. 터치 · 펜은 손을 떼어 탭이 됐을 때(click)만 연다 —
// 스크롤로 이어지면 click 이 오지 않는다. 마우스 · 키보드는 Radix 그대로(Select 와 같은 방식)
type TriggerHandlers = { onPointerDown: (e: PointerEvent) => void; onClick: () => void };
const TapContext = createContext<TriggerHandlers | null>(null);

export function MenuRoot({ onOpenChange, ...props }: Omit<ComponentProps<typeof DropdownMenu.Root>, "open" | "defaultOpen">) {
  const [open, setOpen] = useState(false);
  const touch = useRef(false);
  const change = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  const handlers: TriggerHandlers = {
    // preventDefault 하면 Radix 가 이 pointerdown 으로 여닫지 않는다
    onPointerDown: e => { touch.current = e.pointerType !== "mouse"; if (touch.current) e.preventDefault(); },
    onClick: () => { if (touch.current) { touch.current = false; change(!open); } },
  };
  return <TapContext.Provider value={handlers}><DropdownMenu.Root {...props} open={open} onOpenChange={change} /></TapContext.Provider>;
}

export function MenuTrigger({ onPointerDown, onClick, ...props }: ComponentProps<typeof DropdownMenu.Trigger>) {
  const tap = useContext(TapContext);
  return <DropdownMenu.Trigger {...props}
    onPointerDown={e => { onPointerDown?.(e); tap?.onPointerDown(e); }}
    onClick={(e: MouseEvent<HTMLButtonElement>) => { onClick?.(e); tap?.onClick(); }} />;
}
