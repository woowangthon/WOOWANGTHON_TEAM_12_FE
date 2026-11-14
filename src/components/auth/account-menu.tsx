"use client";

// 계정 메뉴 — 누가 로그인했나 · 오늘 남은 분석 횟수(S-15) · 최근 수정(모바일) · 로그아웃 (FE#37). 목 모드에선 보이지 않는다
import Link from "next/link";
import { SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { AnalysisMark } from "./analysis-cost";
import { useAuth } from "./auth-gate";
import { InfoTip } from "@/components/ui/info-tip";
import { openRecentRevisions } from "@/components/revisions/revision-list";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { MenuRoot, MenuTrigger } from "@/components/ui/tap-menu";

export function AccountMenu({ variant = "bar" }: { variant?: "bar" | "sidebar" | "rail" }) {
  const { me, refresh, signOut } = useAuth();
  if (!me) return null;
  // 쓴 횟수(1 / 20)가 아니라 남은 횟수로 — 자료 넣기 창과 같은 기준 · 말(FE#242, S-15).
  // 계정 메뉴는 직접 열어 보는 곳이라 3회 이하 「경고」와 달리 늘 보인다. 3회 이하면 같은 주의 색
  const left = Math.max(0, me.dailyAnalysis.limit - me.dailyAnalysis.used);
  return (
    <MenuRoot onOpenChange={(open) => open && refresh()}>
      <MenuTrigger
        aria-label={`계정 메뉴: ${me.loginId}`}
        className={cn(
          "inline-flex min-h-10 max-w-full items-center gap-2 rounded-full text-sm font-medium text-ink transition-colors outline-none hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-ink",
          variant === "bar" ? "px-2.5" : "h-11 lg:h-10 w-full gap-2.5 overflow-hidden px-3 whitespace-nowrap",
        )}
      >
        <UserCircleIcon className="size-5 shrink-0" aria-hidden="true" />
        <span aria-hidden={variant === "rail" || undefined}
          className={cn(variant === "bar" ? "truncate max-lg:sr-only" : "sidebar-label shrink-0")}>{me.loginId}</span>
      </MenuTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={variant !== "bar" ? "start" : "end"}
          side={variant !== "bar" ? "top" : "bottom"}
          sideOffset={6}
          collisionPadding={8}
          // 폭을 정해 둔다 — 정하지 않으면 남은 횟수 줄이 한 줄로 길어져 휴대폰 화면 밖으로 나간다
          className={cn(MENU_CONTENT, "z-50 w-64 max-w-[calc(100vw-1rem)]")}
        >
          <div className="grid gap-0.5 px-3 py-2.5">
            <span className="truncate text-sm font-semibold text-ink">{me.loginId}</span>
            {/* 남은 분석은 이름 아래 한 줄 — 칸으로 감싸지 않는다(FE#642). 3회 이하면 「자정에 다시」를 아랫줄 한 덩어리로 —
                메뉴 폭에 밀려 문구 중간에서 끊기지 않게, 글자 시작(✦ 다음)에 맞춘다 */}
            <div className={cn("grid gap-0.5 text-xs tabular-nums", left <= 3 ? "font-medium text-review" : "text-muted")}>
              <div className="flex items-center gap-1">
                <AnalysisMark className="size-3.5 shrink-0" />
                <span className="min-w-0 break-keep">{left === 0 ? "오늘 분석을 모두 썼어요" : `오늘 남은 분석 ${left}회`}</span>
                <InfoTip label="분석 횟수" align={variant === "bar" ? "end" : "start"} portal={false}>
                  ✦ 가 붙은 버튼은 누를 때마다 분석 횟수를 써요. 한국 시간 자정에 다시 채워져요.
                </InfoTip>
              </div>
              {left <= 3 && <p className="m-0 pl-4.5 break-keep">한국 시간 자정에 다시 채워져요</p>}
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
          {/* 모바일 머리(bar)는 좁으면 「최근 수정」 아이콘을 숨긴다(FE#632) — 폭과 상관없이 여기에도 둔다(FE#642). PC 는 머리에 늘 있다 */}
          {variant === "bar" && <DropdownMenu.Item onSelect={() => openRecentRevisions()} className={MENU_ITEM}>최근 수정</DropdownMenu.Item>}
          <DropdownMenu.Item asChild><Link href="/guidelines" className="flex min-h-11 lg:min-h-10 items-center rounded-sm px-3 text-sm outline-none focus:bg-surface-soft">작성 지침</Link></DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="flex min-h-11 lg:min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft"
          >
            <SignOutIcon className="size-4" aria-hidden="true" />
            로그아웃
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </MenuRoot>
  );
}
