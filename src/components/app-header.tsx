"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, FileTextIcon, FilesIcon, HouseIcon, PaperclipIcon, PlusIcon, StackIcon, PlugsConnectedIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { DropdownMenu, Tooltip } from "radix-ui";
import { AccountMenu } from "@/components/auth/account-menu";
import { QuickFindButton, useQuickFindActions, type QuickFindActions } from "@/components/quick-find/quick-find";
import { useSidebar } from "@/components/sidebar-layout";
import { SidebarApplications, useExperienceCount, useSidebarApplications, type ApplicationsLoad } from "@/components/sidebar-applications";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkStatus } from "@/components/work/work-provider";

type Page = "home" | "timeline" | "applications" | "questions" | "connections" | "guidelines";
type HeaderProps = {
  /** 1024 미만에서 세부를 전체 화면으로 열면 아래 탭바를 숨긴다 */
  hideTabBar?: boolean; addSource?: AddSourceProps; activePage?: Page;
  /** 스크롤해도 붙어 있는 위 막대에 둘 화면 버튼 — 지원 화면의 차곡이 */
  panelToggle?: React.ReactNode;
  /** 지원 화면이 받아 둔 목록과 그 줄. 없으면 사이드바가 직접 받는다 */
  applicationList?: ApplicationsLoad & { rows?: React.ReactNode };
  /** 지원 화면 안에서 새 지원을 연다. 없으면 지원 화면으로 가서 연다 */
  onNewApplication?: () => void;
  /** 활동을 이미 받는 화면이 넘긴다(받는 중이면 null). 없으면 사이드바가 직접 받는다 */
  experienceCount?: number | null;
  /** 빠른 찾기(S-61)의 활동 열기 · 찾기를 이 화면에서 받는다. 없으면 내 경험 화면으로 옮겨 간다 */
  quickFind?: Pick<QuickFindActions, "openActivity">;
};
type SidebarProps = Pick<HeaderProps, "activePage" | "experienceCount"> & {
  /** 「내 지원서」 옆 숫자 — 내 경험과 같이(FE#364). 받는 중 · 실패면 비운다 */
  applicationCount: number | null;
  list: React.ReactNode; onAddSource: () => void; addSourceBusy?: boolean; onNewApplication: () => void;
};
const tabs: { page: Page; href: string; label: string; icon: React.ReactNode }[] = [
  { page: "home", href: "/", label: "홈", icon: <HouseIcon /> },
  { page: "timeline", href: "/experience", label: "내 경험", icon: <StackIcon /> },
  // 지원서 영역의 입구는 내 지원서 — PC 사이드바 「내 지원서」와 같은 곳(FE#347). 지원 화면(/questions)에서도 켜진다
  { page: "applications", href: "/applications", label: "지원서", icon: <FileTextIcon /> },
  { page: "connections", href: "/connections", label: "연결", icon: <PlugsConnectedIcon /> },
];
const sideLinks = [
  { page: "home", href: "/", label: "홈", icon: <HouseIcon /> },
  { page: "timeline", href: "/experience", label: "내 경험", icon: <StackIcon /> },
  // 넣은 지원서를 모두 모아 시기 · 종류로 묶어 본다(FE#347)
  { page: "applications", href: "/applications", label: "내 지원서", icon: <FilesIcon /> },
];
const PAGE_NAME: Record<Page, string> = { home: "홈", timeline: "내 경험", applications: "내 지원서", questions: "지원서", connections: "연결 · 내보내기", guidelines: "작성 지침" };
const BUSY = "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요";
// 왼쪽 여백·아이콘 칸·줄 간격은 접어도 유지한다. 글자는 남겨 서랍의 폭으로 잘라 낸다(시안 6).
const navItem = "flex h-11 lg:h-10 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-full px-3 text-sm font-medium whitespace-nowrap text-ink transition-colors";

export function AppHeader({ hideTabBar, panelToggle, addSource, applicationList, onNewApplication, experienceCount, activePage, quickFind }: HeaderProps) {
  const { wide, desktop } = useSidebar();
  const router = useRouter();
  const ownList = useSidebarApplications(desktop && !applicationList);
  const applications = applicationList ?? ownList;
  const ownCount = useExperienceCount(desktop && experienceCount === undefined);
  const page = activePage ?? "timeline";
  const newApplication = onNewApplication ?? (() => router.push("/questions?new=1"));
  const onAddSource = addSource?.onClick ?? (() => router.push("/experience?add=1"));
  useQuickFindActions({ ...quickFind, addSource: addSource?.onClick, addSourceBusy: addSource?.busy, newApplication: onNewApplication });
  return <Tooltip.Provider delayDuration={200}>
    {/* 1024 미만 — 한 줄. 높이는 스크롤해도 붙어 있는 줄 하나(45px)로 두어 본화면을 줄이지 않는다(FE#201) */}
    <header className="sticky top-0 z-40 flex h-11.25 items-center gap-1 border-b border-hairline bg-canvas pr-2 pl-4 lg:hidden">
      <Link href="/" aria-label="차곡 — 홈" className="shrink-0"><Logo className="h-5 w-auto" /></Link>
      {!desktop && <WorkStatus className="min-w-0 flex-1 shrink justify-end">{panelToggle}<QuickFindButton /></WorkStatus>}
      <AccountMenu />
    </header>
    <header className="hidden h-14 items-center gap-4 border-b border-hairline bg-canvas px-6 lg:sticky lg:top-0 lg:z-20 lg:flex">
      <nav aria-label="현재 위치" className="flex min-w-0 items-center gap-2.5 text-xs text-muted">
        <ArchiveIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>내 서랍</span><span className="text-hairline" aria-hidden="true">/</span>
        <strong aria-current="page" className="truncate font-medium text-ink">{PAGE_NAME[page]}</strong>
      </nav>
      {/* 기능이 없는 버튼은 두지 않는다 */}
      <div data-slot="header-actions" className="ml-auto flex min-w-0 items-center gap-2">{desktop && <WorkStatus>{panelToggle}<QuickFindButton /></WorkStatus>}</div>
    </header>
    <DesktopSidebar key={wide ? "wide" : desktop ? "rail" : "mobile"} activePage={page} experienceCount={experienceCount === undefined ? ownCount : experienceCount}
      applicationCount={applications.loading || applications.error ? null : applications.applications.length}
      onAddSource={onAddSource} addSourceBusy={addSource?.busy} onNewApplication={newApplication}
      list={<SidebarApplications {...applications} onNew={newApplication} />} />
    {!desktop && !hideTabBar && <TabBar page={page} busy={addSource?.busy} onAddSource={onAddSource} onNewApplication={newApplication} />}
  </Tooltip.Provider>;
}

function DesktopSidebar(props: SidebarProps) {
  const { collapsed, wide, desktop, toggle } = useSidebar();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  return <>
    <div aria-hidden="true" className="sidebar-corners pointer-events-none fixed inset-y-0 left-0 z-30 hidden overflow-clip bg-page lg:block"><SidebarBackground /></div>
    <aside data-collapsed={collapsed} className="sidebar-drawer fixed inset-y-0 left-0 z-30 hidden flex-col gap-3 overflow-clip px-3.5 pt-6.5 pb-4.5 lg:flex" aria-label="사이드바">
      <SidebarBackground />
      {/* 시안 6: 레일은 같은 로고 자리에서 펼침 아이콘으로 바뀐다. 높이를 고정해 메뉴가 밀리지 않게 한다. */}
      <div data-slot="sidebar-brand" className={cn("group/brand relative flex h-11 lg:h-10 shrink-0 items-center", collapsed ? "w-11 justify-center" : "justify-between pl-2")}>
        <Brand collapsed={collapsed} />
        <RailTip label={toggleLabel} enabled={collapsed}>
          <button ref={trigger} type="button" aria-label={toggleLabel} aria-expanded={wide ? !collapsed : overlayOpen} aria-controls={wide ? "sidebar-navigation" : "sidebar-overlay"}
            onClick={() => wide ? toggle() : setOverlayOpen(true)}
            className={cn("flex size-11 lg:size-10 shrink-0 items-center justify-center rounded-full hover:bg-canvas/60", collapsed && "absolute inset-0")}>
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
        <div className="relative flex h-11 lg:h-10 shrink-0 items-center justify-between pl-2">
          <Brand onNavigate={() => setOverlayOpen(false)} />
          <button type="button" aria-label="사이드바 접기" onClick={() => setOverlayOpen(false)} className="flex size-11 lg:size-10 items-center justify-center rounded-full hover:bg-canvas/60">
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

function SidebarNavigation({ collapsed = false, activePage = "timeline", experienceCount, applicationCount, onAddSource, addSourceBusy, onNewApplication, onNavigate, id }: SidebarProps & { collapsed?: boolean; onNavigate?: () => void; id?: string }) {
  return <nav id={id} className="relative flex shrink-0 flex-col gap-0.5" aria-label="주 메뉴">
    <AddMenu side={collapsed ? "right" : "bottom"} align="start" busy={addSourceBusy} onAddSource={() => { onNavigate?.(); onAddSource(); }} onNewApplication={() => { onNavigate?.(); onNewApplication(); }}>
      <RailTip label="추가" enabled={collapsed}>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="추가" className={cn(navItem, "hover:bg-canvas/60 data-[state=open]:bg-canvas/60")}>
            <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true"><PlusIcon className="size-4.5" /></span>
            <span className="sidebar-label shrink-0" aria-hidden={collapsed || undefined}>추가</span>
          </button>
        </DropdownMenu.Trigger>
      </RailTip>
    </AddMenu>
    {/* 지원 화면(/questions)도 「내 지원서」 영역이다(FE#347) */}
    {sideLinks.map(l => <SideLink key={l.page} {...l} active={activePage === l.page || (l.page === "applications" && activePage === "questions")} collapsed={collapsed} onNavigate={onNavigate}
      count={l.page === "timeline" ? experienceCount : l.page === "applications" ? applicationCount : null} />)}
  </nav>;
}

function SideLink({ href, label, icon, active, collapsed, count, railOnly, onNavigate }: {
  href: string; label: string; icon: React.ReactNode; active: boolean; collapsed: boolean; count?: number | null; railOnly?: boolean; onNavigate?: () => void;
}) {
  return <RailTip label={label} enabled={collapsed}>
    <Link href={href} onClick={onNavigate} aria-label={label} aria-current={active ? "page" : undefined} data-rail-only={railOnly || undefined}
      className={cn(navItem, active ? "bg-canvas font-bold" : "hover:bg-canvas/60")}>
      <span className="flex size-5 shrink-0 items-center justify-center text-icon" aria-hidden="true">{icon}</span>
      <span className="sidebar-label shrink-0" aria-hidden={collapsed || undefined}>{label}</span>
      {count != null && <span className="sidebar-label ml-auto text-xs font-medium text-muted tabular-nums" aria-hidden={collapsed || undefined}>{count}</span>}
    </Link>
  </RailTip>;
}

/** 「+ 추가」 — 쌓기(자료 쌓기) · 꺼내기(새 지원서). 한 줄 기록도 자료 쌓기 창에 적는다 — 「직접 기록하기」(FE#179)는 합쳤다(FE#364).
 *  설명은 한 줄만. 항목 전체가 누르는 자리라 ⓘ 를 넣지 않는다 */
function AddMenu({ side, align, busy, onAddSource, onNewApplication, children }: {
  side: "right" | "bottom" | "top"; align: "start" | "center"; busy?: boolean; onAddSource: () => void; onNewApplication: () => void; children: React.ReactNode;
}) {
  const item = "flex cursor-pointer gap-3 rounded-sm px-3 py-2.5 outline-none focus:bg-surface-soft data-disabled:cursor-default data-disabled:opacity-60";
  const text = (title: string, detail: string) => <span className="grid"><span className="text-sm leading-4 font-semibold text-ink">{title}</span><span className="text-note leading-normal text-muted">{detail}</span></span>;
  const label = "px-3 pt-2 pb-1 text-xs font-medium text-muted";
  return <DropdownMenu.Root modal={false}>
    {children}
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} side={side} sideOffset={6} className="z-60 grid w-70 gap-0.5 rounded-md border border-hairline bg-canvas p-2 shadow-float">
        <DropdownMenu.Label className={label}>쌓기</DropdownMenu.Label>
        <DropdownMenu.Item disabled={busy} onSelect={onAddSource} className={item}>
          <PaperclipIcon className="mt-px size-5 shrink-0" aria-hidden="true" />
          {text("자료 쌓기", busy ? BUSY : "한 줄 기록 · 노트 · 파일 · GitHub")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
        <DropdownMenu.Label className={label}>꺼내기</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={onNewApplication} className={item}>
          <FileTextIcon className="mt-px size-5 shrink-0" aria-hidden="true" />
          {text("새 지원서", "문항 넣고 맞는 경험 찾기")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** 1024 미만 아래 탭바 — 위 막대의 글자 메뉴 · 내 경험의 떠 있는 버튼을 대신한다(FE#201) */
function TabBar({ page, busy, onAddSource, onNewApplication }: { page: Page; busy?: boolean; onAddSource: () => void; onNewApplication: () => void }) {
  const hidden = useHideOnScrollDown();
  const tab = "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-medium";
  // 「지원서」 탭은 내 지원서와 지원 화면 둘 다에서 켜진다(FE#347)
  const tabPage = page === "questions" ? "applications" : page;
  const link = ({ page: target, href, label, icon }: (typeof tabs)[number]) => <Link key={target} href={href} aria-current={tabPage === target ? "page" : undefined}
    className={cn(tab, tabPage === target ? "font-bold text-ink" : "text-muted")}>
    <span className="text-heading leading-none" aria-hidden="true">{icon}</span>{label}
  </Link>;
  // 화면 키보드가 떠 있는 동안은 숨긴다. 입력칸에서 버튼을 누르는 순간 초점이 빠져도 그 자리에 탭바가
  // 바로 나오면 누르기가 탭바에 끝나 버튼이 안 눌린다 — 나오기를 200ms 늦춘다
  return <nav data-slot="tab-bar" aria-label="주 메뉴" className={cn("fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom,0px)] [transition:transform_150ms,visibility_0s_200ms] has-focus-visible:translate-y-0 motion-reduce:[transition:visibility_0s_200ms] lg:hidden [body:has(input:focus,textarea:focus)_&]:invisible", hidden && "translate-y-full")}>
    {link(tabs[0])}{link(tabs[1])}
    <AddMenu side="top" align="center" busy={busy} onAddSource={onAddSource} onNewApplication={onNewApplication}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="추가" className={cn(tab, "text-ink")}>
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true"><PlusIcon className="size-5" /></span>
        </button>
      </DropdownMenu.Trigger>
    </AddMenu>
    {link(tabs[2])}{link(tabs[3])}
  </nav>;
}

/** 아래로 내리면 숨고 위로 올리거나 끝에 닿으면 나온다 — 읽는 동안 본화면을 줄이지 않는다 */
function useHideOnScrollDown() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // 끝에서는 더 내릴 곳이 없다. 탭바를 찾으러 위로 올리게 두지 않는다
      if (y + window.innerHeight >= document.documentElement.scrollHeight - 2) { setHidden(false); last = y; return; }
      if (Math.abs(y - last) < 8) return;
      setHidden(y > last && y > 56);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

/** 아래쪽 연결 · 계정 — 「내보내기」(S-33)는 기능이 들어올 때 붙인다 */
function SidebarFooter({ activePage = "timeline", collapsed = false, variant, onNavigate }: SidebarProps & { collapsed?: boolean; variant: "rail" | "sidebar"; onNavigate?: () => void }) {
  return <div className="relative mt-auto flex shrink-0 flex-col gap-0.5">
    <nav aria-label="연결"><SideLink href="/connections" label="연결 · 내보내기" icon={<PlugsConnectedIcon />} active={activePage === "connections"} collapsed={collapsed} onNavigate={onNavigate} /></nav>
    <AccountMenu variant={variant} />
  </div>;
}

/** 레일 · 아이콘 버튼의 이름 말풍선 — 이 틀 밖에서 쓰면 Tooltip.Provider 로 감싼다 */
export function RailTip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactElement }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    {enabled && <Tooltip.Portal><Tooltip.Content side="right" sideOffset={12} className="z-80 rounded-sm bg-ink px-3 py-2 text-xs text-on-primary shadow-float">
      {label}<Tooltip.Arrow className="fill-ink" />
    </Tooltip.Content></Tooltip.Portal>}
  </Tooltip.Root>;
}

function Brand({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <Link href="/" onClick={onNavigate} aria-hidden={collapsed || undefined} tabIndex={collapsed ? -1 : undefined}
    className={cn("relative flex h-11 lg:h-10 items-center", collapsed && "pointer-events-none w-11 justify-center group-hover/brand:invisible group-focus-within/brand:invisible")} aria-label="차곡 — 홈">
    {collapsed ? <Image src="/brand/mascot.svg" alt="" width={32} height={32} priority /> : <Logo className="h-6.5 w-auto" />}
  </Link>;
}

function SidebarBackground() {
  // 번짐 그림은 overflow-clip 안에 둔다. 계정 메뉴 초점 때문에 사이드바가 밀리지 않도록(FE#37).
  return <Image src="/brand/bg-blur.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -top-75 -left-90 max-w-none" width={1500} height={1630} priority />;
}

/** 「차곡」 로고 — 가칭(DESIGN.md). 글자는 디자인 담당 시안, 심볼은 캐릭터(mascot.svg)와 같은 그림이다 */
export function Logo({ className }: { className?: string }) {
  return <Image src="/brand/logo.svg" alt="차곡" width={93} height={26} className={className} style={{ width: "auto" }} priority />;
}

export type AddSourceProps = { onClick: () => void; busy?: boolean };

export function AddSourceButton({ onClick, busy, className }: AddSourceProps & { className?: string }) {
  return <Button onClick={onClick} disabled={busy} title={busy ? BUSY : undefined} className={className}>
    <PlusIcon />자료 쌓기
  </Button>;
}
