"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FileTextIcon, PlusIcon, StackIcon, PlugsConnectedIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { Tooltip } from "radix-ui";
import { AccountMenu } from "@/components/auth/account-menu";
import { useSidebar } from "@/components/sidebar-layout";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Page = "timeline" | "questions" | "connections";
type HeaderProps = {
  /** 1024 미만에서 세부를 전체 화면으로 열면 위 막대를 숨긴다 */
  hideOnMobile?: boolean; addSource?: AddSourceProps; activePage?: Page;
  /** 펼친 사이드바 메뉴 아래 — 지원 화면의 지원 목록 */
  sidebarExtra?: React.ReactNode;
};
const links = [
  { page: "timeline", href: "/", label: "내 경험", icon: <StackIcon /> },
  { page: "questions", href: "/questions", label: "지원", icon: <FileTextIcon /> },
  { page: "connections", href: "/connections", label: "연결", icon: <PlugsConnectedIcon /> },
];

export function AppHeader({ hideOnMobile, ...props }: HeaderProps) {
  const { wide, desktop } = useSidebar();
  return <Tooltip.Provider delayDuration={200}>
    <header className={cn("flex h-14 items-center gap-4 border-b border-hairline bg-canvas px-4.5 lg:hidden", hideOnMobile && "max-lg:hidden")}>
      <Logo className="h-5 w-auto" />
      <nav className="flex shrink-0 items-center gap-4 text-sm font-semibold" aria-label="주 메뉴">
        {links.map(l => <Link key={l.page} href={l.href} aria-current={(props.activePage ?? "timeline") === l.page ? "page" : undefined}
          className={cn("inline-flex h-14 items-center border-b-2", (props.activePage ?? "timeline") === l.page ? "border-ink" : "border-transparent text-muted")}>
          {l.label}
        </Link>)}
      </nav>
      <div className="ml-auto flex items-center gap-2"><AccountMenu /></div>
    </header>
    <DesktopSidebar key={wide ? "wide" : desktop ? "rail" : "mobile"} {...props} />
  </Tooltip.Provider>;
}

function DesktopSidebar(props: HeaderProps) {
  const { collapsed, wide, desktop, toggle } = useSidebar();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  return <>
    <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col gap-5.5 overflow-clip pt-6.5 pb-4.5 lg:flex", collapsed ? "w-18 items-center px-3.5" : "w-62 px-3.5")} aria-label="사이드바">
      <SidebarBackground />
      {/* 시안 6: 레일은 같은 로고 자리에서 펼침 아이콘으로 바뀐다. 높이를 고정해 메뉴가 밀리지 않게 한다. */}
      <div data-slot="sidebar-brand" className={cn("group/brand relative flex h-11 shrink-0 items-center", collapsed ? "w-11 justify-center" : "justify-between pl-2")}>
        <Brand collapsed={collapsed} />
        <RailTip label={toggleLabel} enabled={collapsed}>
          <button ref={trigger} type="button" aria-label={toggleLabel} aria-expanded={wide ? !collapsed : overlayOpen} aria-controls={wide ? "sidebar-navigation" : "sidebar-overlay"}
            onClick={() => wide ? toggle() : setOverlayOpen(true)}
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-canvas/60", collapsed && "absolute inset-0")}>
            <SidebarSimpleIcon className={cn("size-5", collapsed && "opacity-0 group-hover/brand:opacity-100 group-focus-within/brand:opacity-100")} aria-hidden="true" />
          </button>
        </RailTip>
      </div>
      <SidebarNavigation {...props} collapsed={collapsed} id="sidebar-navigation" />
      {!collapsed && props.sidebarExtra && <div className="relative flex min-h-0 flex-1 flex-col">{props.sidebarExtra}</div>}
      <div className="relative mt-auto"><AccountMenu variant={collapsed ? "rail" : "sidebar"} /></div>
    </aside>
    <Sheet open={overlayOpen && desktop && !wide} onOpenChange={setOverlayOpen}>
      <SheetContent side="left" id="sidebar-overlay" aria-describedby={undefined} showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
        className="w-62! gap-5.5 overflow-clip bg-page px-3.5 pt-6.5 pb-4.5">
        <SheetTitle className="sr-only">사이드바</SheetTitle>
        <SidebarBackground />
        <div className="relative flex h-9 items-center justify-between pl-2">
          <Brand onNavigate={() => setOverlayOpen(false)} />
          <button type="button" aria-label="사이드바 접기" onClick={() => setOverlayOpen(false)} className="flex size-11 items-center justify-center rounded-full hover:bg-canvas/60">
            <SidebarSimpleIcon className="size-5" aria-hidden="true" />
          </button>
        </div>
        <SidebarNavigation {...props} onNavigate={() => setOverlayOpen(false)} />
        {props.sidebarExtra && <div className="relative flex min-h-0 flex-1 flex-col" onClick={event => { if ((event.target as HTMLElement).closest("button")) setOverlayOpen(false); }}>{props.sidebarExtra}</div>}
        <div className="relative mt-auto"><AccountMenu variant="sidebar" /></div>
      </SheetContent>
    </Sheet>
  </>;
}

function SidebarNavigation({ collapsed = false, activePage = "timeline", addSource, onNavigate, id }: HeaderProps & { collapsed?: boolean; onNavigate?: () => void; id?: string }) {
  const navItem = cn("flex h-11 shrink-0 items-center rounded-full text-sm font-medium text-ink transition-colors", collapsed ? "w-11 justify-center" : "gap-2.5 px-3.5");
  return <nav id={id} className={cn("relative flex shrink-0 flex-col", collapsed ? "gap-1.5" : "gap-0.5")} aria-label="주 메뉴">
    {addSource && <RailTip label="자료 넣기" enabled={collapsed}>
      <button type="button" aria-label="자료 넣기" onClick={() => { onNavigate?.(); addSource.onClick(); }} disabled={addSource.busy}
        title={addSource.busy ? "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요" : undefined}
        className={cn(navItem, "hover:bg-canvas/60 disabled:cursor-default disabled:opacity-50")}>
        <PlusIcon className="size-4.5 shrink-0" aria-hidden="true" />{!collapsed && "자료 넣기"}
      </button>
    </RailTip>}
    {links.map(l => <RailTip key={l.page} label={l.label} enabled={collapsed}>
      <Link href={l.href} onClick={onNavigate} aria-label={l.label} aria-current={activePage === l.page ? "page" : undefined}
        className={cn(navItem, activePage === l.page ? "bg-canvas font-bold" : "hover:bg-canvas/60")}>
        <span className="text-[19px]" aria-hidden="true">{l.icon}</span>{!collapsed && l.label}
      </Link>
    </RailTip>)}
  </nav>;
}

function RailTip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactElement }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    {enabled && <Tooltip.Portal><Tooltip.Content side="right" sideOffset={12} className="z-80 rounded-sm bg-ink px-3 py-2 text-xs text-on-primary shadow-float">
      {label}<Tooltip.Arrow className="fill-ink" />
    </Tooltip.Content></Tooltip.Portal>}
  </Tooltip.Root>;
}

function Brand({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <Link href="/" onClick={onNavigate} aria-hidden={collapsed || undefined} tabIndex={collapsed ? -1 : undefined}
    className={cn("relative flex h-11 items-center", collapsed && "pointer-events-none w-11 justify-center group-hover/brand:invisible group-focus-within/brand:invisible")} aria-label="차곡 — 내 경험">
    {collapsed ? <span className="block w-7 overflow-hidden"><Logo className="h-6.5 max-w-none" /></span> : <Logo className="h-6.5 w-auto" />}
  </Link>;
}

function SidebarBackground() {
  // 번짐 그림은 overflow-clip 안에 둔다. 계정 메뉴 초점 때문에 사이드바가 밀리지 않도록(FE#37).
  return <Image src="/brand/bg-blur.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -top-75 -left-90 max-w-none" width={1500} height={1630} priority />;
}

/** 「차곡」 글자 로고 — 가칭(DESIGN.md), 디자인 담당 시안의 파일 그대로 */
export function Logo({ className }: { className?: string }) {
  return <Image src="/brand/logo.svg" alt="차곡" width={93} height={26} className={className} style={{ width: "auto" }} priority />;
}

export type AddSourceProps = { onClick: () => void; busy?: boolean };

export function AddSourceButton({ onClick, busy, className }: AddSourceProps & { className?: string }) {
  return <Button onClick={onClick} disabled={busy} title={busy ? "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요" : undefined} className={className}>
    <PlusIcon />자료 넣기
  </Button>;
}
