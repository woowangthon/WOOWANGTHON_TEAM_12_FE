import Image from "next/image";
import Link from "next/link";
import { FileTextIcon, PlusIcon, StackIcon } from "@phosphor-icons/react/ssr";
import { AccountMenu } from "@/components/auth/account-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Page = "timeline" | "questions";

// 시안 6(FE#43, 임시) — 1280 이상은 왼쪽 사이드바(고정, 폭 248px = w-62), 그보다 좁으면 위 막대.
// 1024 ~ 1279(PC 를 125 ~ 150% 로 확대한 폭)에 사이드바까지 두면 세부 패널(440)을 연 타임라인이 300px 대로 눌려
// 글자가 세로로 깨진다(FE#45). 사이드바 자리는 layout.tsx 의 작업 면이 비워 둔다(xl:pl-62).
export function AppHeader({ hideOnMobile, addSource, activePage = "timeline", timelineHref = "/" }: {
  /** 1024 미만에서 세부를 전체 화면으로 열면 위 막대를 숨긴다 */
  hideOnMobile?: boolean; addSource?: AddSourceProps; activePage?: Page; timelineHref?: string;
}) {
  const links: { page: Page; href: string; label: string; icon: React.ReactNode }[] = [
    { page: "timeline", href: timelineHref, label: "내 경험", icon: <StackIcon /> },
    { page: "questions", href: "/questions", label: "지원", icon: <FileTextIcon /> },
  ];
  return (
    <>
      <header
        className={cn("flex h-14 items-center gap-4 border-b border-hairline bg-canvas px-4.5 lg:px-7 xl:hidden", hideOnMobile && "max-lg:hidden")}
      >
        <Logo className="h-5 w-auto" />
        <nav className="flex shrink-0 items-center gap-4 text-sm font-semibold" aria-label="주 메뉴">
          {links.map((l) => (
            <Link key={l.page} href={l.href} aria-current={activePage === l.page ? "page" : undefined}
              className={cn("inline-flex h-14 items-center border-b-2", activePage === l.page ? "border-ink" : "border-transparent text-muted")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {addSource && <AddSourceButton {...addSource} className="hidden lg:inline-flex" />}
          <AccountMenu />
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-62 flex-col gap-5.5 overflow-clip px-3.5 pt-6.5 pb-4.5 xl:flex" aria-label="사이드바">
        {/* 시안의 배경 번짐(파랑 · 분홍 · 초록). 이 그림이 사이드바보다 길어서 overflow-hidden 이면 안쪽이 스크롤될 수 있다 —
            맨 아래 계정 메뉴를 열 때 초점이 옮겨 가며 사이드바가 밀려 올라가서, 스크롤 자체가 안 되는 overflow-clip 으로 둔다(FE#37) */}
        <Image src="/brand/bg-blur.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -top-75 -left-90 max-w-none" width={1500} height={1630} priority />
        <Link href={timelineHref} className="relative flex h-9 items-center pl-2" aria-label="차곡 — 내 경험">
          <Logo className="h-6.5 w-auto" />
        </Link>
        <nav className="relative flex flex-col gap-0.5" aria-label="주 메뉴">
          {addSource && (
            <button type="button" onClick={addSource.onClick} disabled={addSource.busy}
              title={addSource.busy ? "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요" : undefined}
              className={cn(navItem, "hover:bg-canvas/60 disabled:cursor-default disabled:opacity-50")}>
              <PlusIcon className="size-4.5" />자료 넣기
            </button>
          )}
          {links.map((l) => {
            const active = activePage === l.page;
            return (
              <Link key={l.page} href={l.href} aria-current={active ? "page" : undefined}
                className={cn(navItem, active ? "rounded-full bg-canvas font-bold" : "hover:bg-canvas/60")}>
                <span className="text-[19px]">{l.icon}</span>{l.label}
              </Link>
            );
          })}
        </nav>
        {/* 계정 — 로그인했을 때만(목 모드엔 없음) (FE#37) */}
        <div className="relative mt-auto">
          <AccountMenu variant="sidebar" />
        </div>
      </aside>
    </>
  );
}

const navItem = "flex h-10 items-center gap-2.5 rounded-sm px-3.5 text-sm font-medium text-ink transition-colors";

/** 「차곡」 글자 로고 — 가칭(DESIGN.md), 디자인 담당 시안의 파일 그대로 */
export function Logo({ className }: { className?: string }) {
  return <Image src="/brand/logo.svg" alt="차곡" width={93} height={26} className={className} style={{ width: "auto" }} priority />;
}

export type AddSourceProps = {
  onClick: () => void;
  /** 분석이 돌고 있으면 끝날 때까지 하나만 */
  busy?: boolean;
};

export function AddSourceButton({ onClick, busy, className }: AddSourceProps & { className?: string }) {
  return (
    <Button
      onClick={onClick}
      disabled={busy}
      title={busy ? "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요" : undefined}
      className={className}
    >
      <PlusIcon />
      자료 넣기
    </Button>
  );
}
