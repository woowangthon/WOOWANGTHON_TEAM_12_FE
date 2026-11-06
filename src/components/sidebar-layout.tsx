"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "chagok-sidebar-collapsed";
const CHANGE = "chagok-sidebar-change";
let fallbackChoice: boolean | null = null;

function subscribeChoice(change: () => void) {
  window.addEventListener("storage", change);
  window.addEventListener(CHANGE, change);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener(CHANGE, change);
  };
}
function readChoice() {
  if (fallbackChoice !== null) return fallbackChoice;
  try { return localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return false; }
}
function subscribeMedia(query: string, change: () => void) {
  const media = matchMedia(query);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
const subscribeWide = (change: () => void) => subscribeMedia("(min-width: 80rem)", change);
const subscribeDesktop = (change: () => void) => subscribeMedia("(min-width: 64rem)", change);

const SidebarContext = createContext({ collapsed: true, wide: false, desktop: false, toggle: () => {} });

/** CSS lg / xl과 같은 rem 경계. 중간 폭의 자동 레일은 PC의 저장한 선택을 바꾸지 않는다. */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [animating, setAnimating] = useState(false);
  const choice = useSyncExternalStore(subscribeChoice, readChoice, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia("(min-width: 80rem)").matches, () => false);
  const desktop = useSyncExternalStore(subscribeDesktop, () => matchMedia("(min-width: 64rem)").matches, () => false);
  const collapsed = !wide || choice;
  const toggle = () => {
    setAnimating(true);
    const next = !choice;
    try { localStorage.setItem(STORAGE_KEY, String(next)); fallbackChoice = null; }
    catch { fallbackChoice = next; /* 저장을 막은 브라우저에서도 현재 창에서는 접고 편다 */ }
    window.dispatchEvent(new Event(CHANGE));
  };
  return <SidebarContext value={{ collapsed, wide, desktop, toggle }}>
    <div data-sidebar-collapsed={collapsed} data-sidebar-animating={animating}
      onTransitionEnd={event => { if (event.target === event.currentTarget) setAnimating(false); }}
      className="app-shell flex min-h-dvh flex-1 flex-col max-lg:has-data-[slot=tab-bar]:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
      {children}
    </div>
  </SidebarContext>;
}

export const useSidebar = () => useContext(SidebarContext);
