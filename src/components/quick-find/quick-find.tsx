"use client";

// 빠른 찾기 창(S-61) — 어느 화면에서든 Ctrl K · ⌘K 로 찾기 · 묻기 · 바로가기를 오간다. 배치는 시안 6 mock.js 「빠른 찾기 창」
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { ExperienceSearch } from "@/lib/api/types";
import { QuickFindPanel, type QuickFindTarget } from "./quick-find-panel";

/** 지금 화면이 직접 처리하는 이동. 없으면 주소로 옮겨 간다 — 같은 화면 안에선 주소만 바뀌어 화면이 받아 처리해야 한다 */
export type QuickFindActions = {
  openActivity?: (activityId: number) => void;
  addSource?: () => void;
  addRecord?: () => void;
  addSourceBusy?: boolean;
  newApplication?: () => void;
};

/** open 에 조건을 넘기면 찾기 탭을 그 낱말 · 거르기로 연다 — 예전 경험 찾기 주소(?q=…)에서 온 길 */
const QuickFindContext = createContext<{ open: (initial?: ExperienceSearch) => void; bind: (actions: QuickFindActions) => void } | null>(null);

export function QuickFindProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [opened, setOpened] = useState<{ addSourceBusy: boolean; initial?: ExperienceSearch } | null>(null);
  const actions = useRef<QuickFindActions>({});
  const returnTo = useRef<HTMLElement | null>(null);

  const open = useCallback((initial?: ExperienceSearch) => {
    returnTo.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpened(current => current ?? { addSourceBusy: !!actions.current.addSourceBusy, initial });
  }, []);
  const bind = useCallback((next: QuickFindActions) => { actions.current = next; }, []);
  const value = useMemo(() => ({ open, bind }), [open, bind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 한글 입력 상태의 Mac 은 e.key 가 「ㅏ」라 자리(code)도 본다
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key.toLowerCase() !== "k" && e.code !== "KeyK")) return;
      e.preventDefault();
      open();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (target: QuickFindTarget) => {
    const a = actions.current; // 고르는 순간의 화면 — 열 때의 것이면 그사이 뜬 화면의 처리기를 놓친다
    setOpened(null);
    switch (target.kind) {
      case "activity": return a.openActivity ? a.openActivity(target.id) : router.push(`/experience?activity=${target.id}`);
      case "source": return a.addSource ? a.addSource() : router.push("/experience?add=1");
      case "record": return a.addRecord ? a.addRecord() : router.push("/experience?add=line");
      case "application": return a.newApplication ? a.newApplication() : router.push("/questions?new=1");
      case "experience": return router.push("/experience");
      case "home": return router.push("/");
    }
  };

  return <QuickFindContext value={value}>
    {children}
    <Dialog open={opened !== null} onOpenChange={next => { if (!next) setOpened(null); }}>
      <DialogPortal>
        <DialogOverlay />
        {/* 화면 키보드가 올라와도 보이게 모바일도 위에 붙인다 */}
        <DialogPrimitive.Content aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); returnTo.current?.focus({ preventScroll: true }); returnTo.current = null; }}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex h-[min(560px,calc(100dvh-24px))] max-w-[860px] flex-col overflow-hidden rounded-md bg-popover text-popover-foreground shadow-float outline-none lg:inset-x-6 lg:top-[10vh] lg:h-[min(560px,calc(100dvh-96px))]">
          <DialogTitle className="sr-only">빠른 찾기</DialogTitle>
          <QuickFindPanel addSourceBusy={!!opened?.addSourceBusy} initial={opened?.initial} onGo={go} />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  </QuickFindContext>;
}

/** 지금 화면의 처리기를 빠른 찾기에 건넨다. 렌더마다 새 값이라 상태로 두지 않고 쓸 때 읽는다 */
export function useQuickFindActions(actions: QuickFindActions) {
  const bind = useContext(QuickFindContext)?.bind;
  useEffect(() => {
    bind?.(actions);
    return () => bind?.({});
  });
}

/** 조건과 함께 창을 연다. 빠른 찾기가 없는 자리(로그인 전 등)면 undefined */
export function useQuickFindOpen() {
  return useContext(QuickFindContext)?.open;
}

/** 키보드가 없는 폭에서도 늘 보이는 여는 버튼 — PC 상단 바 · 좁은 화면 맨 위 막대 */
export function QuickFindButton() {
  const open = useContext(QuickFindContext)?.open;
  if (!open) return null;
  return <button type="button" onClick={() => open()} aria-label="빠른 찾기" title="빠른 찾기 (Ctrl K · ⌘K)" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K"
    className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink">
    <MagnifyingGlassIcon aria-hidden="true" className="size-5" />
  </button>;
}
