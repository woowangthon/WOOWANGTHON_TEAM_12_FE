"use client";

// 계정 메뉴 — 누가 로그인했나 · 오늘 남은 분석 횟수(S-15) · 로그아웃 (FE#37). 목 모드에선 보이지 않는다
import Link from "next/link";
import { SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-gate";

export function AccountMenu({ variant = "bar" }: { variant?: "bar" | "sidebar" | "rail" }) {
  const { me, refresh, signOut } = useAuth();
  if (!me) return null;
  // 쓴 횟수(1 / 20)가 아니라 남은 횟수로 — 자료 넣기 창과 같은 기준 · 말(FE#242, S-15).
  // 계정 메뉴는 직접 열어 보는 곳이라 3회 이하 「경고」와 달리 늘 보인다. 3회 이하면 같은 주의 색
  const left = Math.max(0, me.dailyAnalysis.limit - me.dailyAnalysis.used);
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && refresh()}>
      <DropdownMenu.Trigger
        aria-label={`계정 메뉴: ${me.loginId}`}
        className={cn(
          "inline-flex min-h-10 max-w-full items-center gap-2 rounded-full text-sm font-medium text-ink transition-colors outline-none hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-ink",
          variant === "bar" ? "px-2.5" : "h-11 lg:h-10 w-full gap-2.5 overflow-hidden px-3 whitespace-nowrap",
        )}
      >
        <UserCircleIcon className="size-5 shrink-0" aria-hidden="true" />
        <span aria-hidden={variant === "rail" || undefined}
          className={cn(variant === "bar" ? "truncate max-lg:sr-only" : "sidebar-label shrink-0")}>{me.loginId}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={variant !== "bar" ? "start" : "end"}
          side={variant !== "bar" ? "top" : "bottom"}
          sideOffset={6}
          className="z-50 min-w-52 rounded-md border border-hairline bg-canvas p-2 shadow-float"
        >
          <div className="grid gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold text-ink">{me.loginId}</span>
            <span className={cn("text-xs tabular-nums", left <= 3 ? "font-medium text-review" : "text-muted")}>
              {left === 0 ? "오늘 분석을 모두 썼어요" : `오늘 남은 분석 ${left}회`}{left <= 3 && " · 한국 시간 자정에 다시 채워져요"}
            </span>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
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
    </DropdownMenu.Root>
  );
}
