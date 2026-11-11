"use client";

import { usePathname } from "next/navigation";
import { Logo, SidebarBackground } from "@/components/app-header";
import { TimelineSkeleton } from "@/components/experience/timeline-skeleton";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { useSidebar } from "@/components/sidebar-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// 사이드바 줄과 같은 높이 · 안쪽 여백(app-header.tsx navItem)
const navRow = "flex h-11 w-full shrink-0 items-center gap-2.5 px-3 lg:h-10";

/** 로그인을 확인하는 동안(FE#402) — 흰 화면에 글 한 줄 대신 앱 틀(사이드바 · 위 막대 · 탭바)과 그 주소 화면의 뼈대를 그린다.
 *  확인이 끝나 화면이 「불러오는 중」 뼈대로 넘어가도 같은 자리라 두 번 깜빡이지 않는다.
 *  내 데이터(활동 · 지원 · 개수)는 그리지 않는다 — 로그인 전엔 아무것도 읽지 않았다 */
export function AuthChecking() {
  const { collapsed } = useSidebar();
  const path = usePathname();
  return <div role="status" className="flex min-h-dvh flex-1 flex-col bg-canvas">
    <span className="sr-only">로그인 상태를 확인하고 있어요</span>
    {/* 1024 미만 — 위 막대 한 줄 */}
    <div aria-hidden="true" className="sticky top-0 z-40 flex h-11.25 items-center gap-3 border-b border-hairline bg-canvas pr-4 pl-4 lg:hidden">
      <Logo className="h-5 w-auto" />
      <span className="ml-auto flex gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="size-6 rounded-full" />)}</span>
    </div>
    {/* 1024 이상 — 사이드바 · 위 막대. 사이드바 폭 · 접힘은 실제 사이드바와 같은 클래스가 정한다 */}
    <div aria-hidden="true" className="sidebar-corners pointer-events-none fixed inset-y-0 left-0 z-30 hidden overflow-clip bg-page lg:block"><SidebarBackground /></div>
    <div aria-hidden="true" data-collapsed={collapsed} className="sidebar-drawer fixed inset-y-0 left-0 z-30 hidden flex-col gap-3 overflow-clip px-3.5 pt-6.5 pb-4.5 lg:flex">
      <SidebarBackground />
      <div className={cn("relative flex h-10 shrink-0 items-center", collapsed ? "w-11 justify-center" : "pl-2")}>
        {collapsed ? <Skeleton className="size-8 rounded-md" /> : <Logo className="h-6.5 w-auto" />}
      </div>
      <div className="relative flex flex-col gap-0.5">
        {["w-8", "w-6", "w-12", "w-14"].map(w => <div key={w} className={navRow}>
          <Skeleton className="size-5 shrink-0 rounded-full" /><span className="sidebar-label"><Skeleton className={cn("h-3.5", w)} /></span>
        </div>)}
      </div>
      <div className="relative mt-auto flex flex-col gap-0.5">
        {["w-20", "w-10"].map(w => <div key={w} className={navRow}>
          <Skeleton className="size-5 shrink-0 rounded-full" /><span className="sidebar-label"><Skeleton className={cn("h-3.5", w)} /></span>
        </div>)}
      </div>
    </div>
    <div aria-hidden="true" className="hidden h-14 items-center gap-4 border-b border-hairline bg-canvas px-6 lg:flex">
      <Skeleton className="h-3 w-28" />
      <span className="ml-auto flex items-center gap-4"><Skeleton className="size-6 rounded-full" /><Skeleton className="size-6 rounded-full" /><Skeleton className="h-3 w-16" /></span>
    </div>
    <div aria-hidden="true" className="flex-1">
      {path === "/experience" ? <main className="min-w-0 px-4.5 pt-4.5 pb-24 lg:px-8 lg:pt-8 lg:pb-16"><TimelineSkeleton announce={false} /></main>
        : path === "/" ? <main className="home-background min-h-[calc(100dvh-2rem)] px-4.5 pt-6 pb-10 lg:px-9 lg:pt-[6vh]"><HomeSkeleton /></main>
        : <main className="grid max-w-4xl gap-3 px-4.5 pt-7 lg:px-10"><Skeleton className="h-8 w-40" /><Skeleton className="mb-5 h-4 w-64" />
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</main>}
    </div>
    {/* 1024 미만 — 아래 탭바 자리 */}
    <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className="flex min-h-14 flex-col items-center justify-center gap-1">
        {i === 2 ? <Skeleton className="size-9 rounded-full" /> : <><Skeleton className="size-5 rounded-full" /><Skeleton className="h-2.5 w-7" /></>}
      </span>)}
    </div>
  </div>;
}
