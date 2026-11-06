"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, FileTextIcon, HouseIcon, PlusIcon, StackIcon, PlugsConnectedIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { DropdownMenu, Tooltip } from "radix-ui";
import { AccountMenu } from "@/components/auth/account-menu";
import { QuickFindButton, useQuickFindActions, type QuickFindActions } from "@/components/quick-find/quick-find";
import { useSidebar } from "@/components/sidebar-layout";
import { SidebarApplications, useExperienceCount, useSidebarApplications, type ApplicationsLoad } from "@/components/sidebar-applications";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkStatus } from "@/components/work/work-provider";

type Page = "home" | "timeline" | "questions" | "connections" | "guidelines";
type HeaderProps = {
  /** 1024 미만에서 세부를 전체 화면으로 열면 위 막대를 숨긴다 */
  hideOnMobile?: boolean; addSource?: AddSourceProps; activePage?: Page;
  /** 지원 화면이 받아 둔 목록과 그 줄. 없으면 사이드바가 직접 받는다 */
  applicationList?: ApplicationsLoad & { rows?: React.ReactNode };
  /** 지원 화면 안에서 새 지원을 연다. 없으면 지원 화면으로 가서 연다 */
  onNewApplication?: () => void;
  /** 활동을 이미 받는 화면이 넘긴다(받는 중이면 null). 없으면 사이드바가 직접 받는다 */
  experienceCount?: number | null;
  /** 빠른 찾기(S-61)의 활동 열기 · 찾기를 이 화면에서 받는다. 없으면 내 경험 화면으로 옮겨 간다 */
  quickFind?: Pick<QuickFindActions, "openActivity" | "search">;
};
type SidebarProps = Pick<HeaderProps, "activePage" | "experienceCount"> & {
  list: React.ReactNode; onAddSource: () => void; addSourceBusy?: boolean; onNewApplication: () => void;
};
const links = [
  { page: "timeline", href: "/experience", label: "내 경험" },
  { page: "questions", href: "/questions", label: "지원" },
  { page: "connections", href: "/connections", label: "연결" },
];
const sideLinks = [
  { page: "home", href: "/", label: "홈", icon: <HouseIcon /> },
  { page: "timeline", href: "/experience", label: "내 경험", icon: <StackIcon /> },
];
const PAGE_NAME: Record<Page, string> = { home: "홈", timeline: "내 경험", questions: "지원서", connections: "연결 · 내보내기", guidelines: "작성 지침" };
const BUSY = "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요";
// 왼쪽 여백·아이콘 칸·줄 간격은 접어도 유지한다. 글자는 남겨 서랍의 폭으로 잘라 낸다(시안 6).
const navItem = "flex h-11 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-full px-3 text-sm font-medium whitespace-nowrap text-ink transition-colors";

export function AppHeader({ hideOnMobile, addSource, applicationList, onNewApplication, experienceCount, activePage, quickFind }: HeaderProps) {
  const { wide, desktop } = useSidebar();
  const router = useRouter();
  const ownList = useSidebarApplications(desktop && !applicationList);
  const ownCount = useExperienceCount(desktop && experienceCount === undefined);
  const page = activePage ?? "timeline";
  const newApplication = onNewApplication ?? (() => router.push("/questions?new=1"));
  useQuickFindActions({ ...quickFind, addSource: addSource?.onClick, addSourceBusy: addSource?.busy, newApplication: onNewApplication });
  return <Tooltip.Provider delayDuration={200}>
    <header className={cn("flex h-14 items-center gap-4 border-b border-hairline bg-canvas px-4.5 lg:sticky lg:top-0 lg:z-20 lg:px-6", hideOnMobile && "max-lg:hidden")}>
      <div className="contents lg:hidden">
        <Link href="/" aria-label="차곡 — 홈"><Logo className="h-5 w-auto" /></Link>
        <nav className="flex shrink-0 items-center gap-4 text-sm font-semibold" aria-label="주 메뉴">
          {links.map(l => <Link key={l.page} href={l.href} aria-current={page === l.page ? "page" : undefined}
            className={cn("inline-flex h-14 items-center border-b-2", page === l.page ? "border-ink" : "border-transparent text-muted")}>
            {l.label}
          </Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2"><AccountMenu /></div>
      </div>
      <div className="hidden lg:contents">
        <nav aria-label="현재 위치" className="flex min-w-0 items-center gap-2.5 text-xs text-muted">
          <ArchiveIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>내 서랍</span><span className="text-hairline" aria-hidden="true">/</span>
          <strong aria-current="page" className="truncate font-medium text-ink">{PAGE_NAME[page]}</strong>
        </nav>
        {/* 기능이 없는 버튼은 두지 않는다 */}
        <div data-slot="header-actions" className="ml-auto flex min-w-0 items-center gap-2">{desktop && <WorkStatus><QuickFindButton /></WorkStatus>}</div>
      </div>
    </header>
    <DesktopSidebar key={wide ? "wide" : desktop ? "rail" : "mobile"} activePage={page} experienceCount={experienceCount === undefined ? ownCount : experienceCount}
      onAddSource={addSource?.onClick ?? (() => router.push("/experience?add=1"))} addSourceBusy={addSource?.busy} onNewApplication={newApplication}
      list={<SidebarApplications {...(applicationList ?? ownList)} onNew={newApplication} showAll={page !== "questions"} />} />
  </Tooltip.Provider>;
}

function DesktopSidebar(props: SidebarProps) {
  const { collapsed, wide, desktop, toggle } = useSidebar();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  return <>
    <aside data-collapsed={collapsed} className="sidebar-drawer fixed inset-y-0 left-0 z-30 hidden flex-col gap-3 overflow-clip px-3.5 pt-6.5 pb-4.5 lg:flex" aria-label="사이드바">
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
      {/* 레일엔 목록 대신 「지원서」 아이콘이 있다. 자리는 그대로 두어 아래 메뉴가 움직이지 않는다 */}
      <div inert={collapsed} aria-hidden={collapsed || undefined}
        className={cn("relative flex min-h-0 w-55 flex-1 flex-col transition-opacity duration-150", collapsed && "pointer-events-none opacity-0")}>
        {props.list}
      </div>
      <SidebarFooter {...props} collapsed={collapsed} variant={collapsed ? "rail" : "sidebar"} />
    </aside>
    <Sheet open={overlayOpen && desktop && !wide} onOpenChange={setOverlayOpen}>
      <SheetContent side="left" id="sidebar-overlay" aria-describedby={undefined} showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
        className="sidebar-overlay w-62! gap-3 overflow-clip bg-page px-3.5 pt-6.5 pb-4.5">
        <SheetTitle className="sr-only">사이드바</SheetTitle>
        <SidebarBackground />
        <div className="relative flex h-11 shrink-0 items-center justify-between pl-2">
          <Brand onNavigate={() => setOverlayOpen(false)} />
          <button type="button" aria-label="사이드바 접기" onClick={() => setOverlayOpen(false)} className="flex size-11 items-center justify-center rounded-full hover:bg-canvas/60">
            <SidebarSimpleIcon className="size-5" aria-hidden="true" />
          </button>
        </div>
        <SidebarNavigation {...props} onNavigate={() => setOverlayOpen(false)} />
        <div className="relative flex min-h-0 flex-1 flex-col" onClick={event => { if ((event.target as HTMLElement).closest("a, button")) setOverlayOpen(false); }}>{props.list}</div>
        <SidebarFooter {...props} variant="sidebar" onNavigate={() => setOverlayOpen(false)} />
      </SheetContent>
    </Sheet>
  </>;
}

function SidebarNavigation({ collapsed = false, activePage = "timeline", experienceCount, onAddSource, addSourceBusy, onNewApplication, onNavigate, id }: SidebarProps & { collapsed?: boolean; onNavigate?: () => void; id?: string }) {
  return <nav id={id} className="relative flex shrink-0 flex-col gap-0.5" aria-label="주 메뉴">
    <AddMenu collapsed={collapsed} busy={addSourceBusy} onAddSource={() => { onNavigate?.(); onAddSource(); }} onNewApplication={() => { onNavigate?.(); onNewApplication(); }} />
    {sideLinks.map(l => <SideLink key={l.page} {...l} active={activePage === l.page} collapsed={collapsed} onNavigate={onNavigate}
      count={l.page === "timeline" ? experienceCount : null} />)}
    {/* 펼치면 아래 「지원서」 목록이 이 메뉴를 대신한다(시안 6) */}
    {collapsed && <SideLink href="/questions" label="지원서" icon={<FileTextIcon />} active={activePage === "questions"} collapsed railOnly />}
  </nav>;
}

function SideLink({ href, label, icon, active, collapsed, count, railOnly, onNavigate }: {
  href: string; label: string; icon: React.ReactNode; active: boolean; collapsed: boolean; count?: number | null; railOnly?: boolean; onNavigate?: () => void;
}) {
  return <RailTip label={label} enabled={collapsed}>
    <Link href={href} onClick={onNavigate} aria-label={label} aria-current={active ? "page" : undefined} data-rail-only={railOnly || undefined}
      className={cn(navItem, active ? "bg-canvas font-bold" : "hover:bg-canvas/60")}>
      <span className="flex size-5 shrink-0 items-center justify-center text-[19px]" aria-hidden="true">{icon}</span>
      <span className="sidebar-label shrink-0" aria-hidden={collapsed || undefined}>{label}</span>
      {count != null && <span className="sidebar-label ml-auto text-xs font-medium text-muted tabular-nums" aria-hidden={collapsed || undefined}>{count}</span>}
    </Link>
  </RailTip>;
}

/** 「+ 추가」 — 자료 넣기 · 새 지원서. 「직접 기록하기」는 SPEC 에 없어 뺐다(FE#147) */
function AddMenu({ collapsed, busy, onAddSource, onNewApplication }: { collapsed: boolean; busy?: boolean; onAddSource: () => void; onNewApplication: () => void }) {
  const item = "flex cursor-pointer gap-3 rounded-sm px-3 py-2.5 outline-none focus:bg-surface-soft data-disabled:cursor-default data-disabled:opacity-60";
  const text = (title: string, detail: string) => <span className="grid gap-0.5"><span className="text-sm font-semibold text-ink">{title}</span><span className="text-xs leading-normal text-muted">{detail}</span></span>;
  return <DropdownMenu.Root modal={false}>
    <RailTip label="추가" enabled={collapsed}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="추가" className={cn(navItem, "hover:bg-canvas/60 data-[state=open]:bg-canvas/60")}>
          <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true"><PlusIcon className="size-4.5" /></span>
          <span className="sidebar-label shrink-0" aria-hidden={collapsed || undefined}>추가</span>
        </button>
      </DropdownMenu.Trigger>
    </RailTip>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" side={collapsed ? "right" : "bottom"} sideOffset={6} className="z-60 grid w-70 gap-0.5 rounded-md border border-hairline bg-canvas p-1.5 shadow-float">
        <DropdownMenu.Item disabled={busy} onSelect={onAddSource} className={item}>
          <PlusIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          {text("자료 넣기", busy ? BUSY : "README · 회고 · 노트 · .md 파일에서 활동과 경험을 찾아요")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={onNewApplication} className={item}>
          <FileTextIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          {text("새 지원서", "지원처와 문항을 넣으면 맞는 경험을 근거와 함께 찾아요")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** 아래쪽 연결 · 계정 — 「내보내기」(S-33)는 기능이 들어올 때 붙인다 */
function SidebarFooter({ activePage = "timeline", collapsed = false, variant, onNavigate }: SidebarProps & { collapsed?: boolean; variant: "rail" | "sidebar"; onNavigate?: () => void }) {
  return <div className="relative mt-auto flex shrink-0 flex-col gap-0.5">
    <nav aria-label="연결"><SideLink href="/connections" label="연결 · 내보내기" icon={<PlugsConnectedIcon />} active={activePage === "connections"} collapsed={collapsed} onNavigate={onNavigate} /></nav>
    <AccountMenu variant={variant} />
  </div>;
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
    className={cn("relative flex h-11 items-center", collapsed && "pointer-events-none w-11 justify-center group-hover/brand:invisible group-focus-within/brand:invisible")} aria-label="차곡 — 홈">
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
  return <Button onClick={onClick} disabled={busy} title={busy ? BUSY : undefined} className={className}>
    <PlusIcon />자료 넣기
  </Button>;
}
