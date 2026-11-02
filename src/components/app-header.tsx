import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 위 막대 — 왼쪽 이름(가칭), 가운데 메뉴(다음 스프린트 메뉴는 흐리게), 오른쪽 「자료 넣기」 (DESIGN.md 「위 막대」)
// 모바일은 이름만 두고 「자료 넣기」는 화면 오른쪽 아래 떠 있는 버튼으로
export function AppHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn("flex h-14 items-center gap-7 border-b border-hairline bg-canvas px-4.5 lg:h-16 lg:px-7", className)}
    >
      {/* 로고 · 서비스 이름은 아직 정하지 않았다(ETC#7 범위 제외) */}
      <span className="text-base font-bold tracking-[-0.3px] lg:text-[17px]">
        서비스 이름
        <small className="ml-1 text-xs font-normal text-muted-soft">미정</small>
      </span>
      <nav className="hidden items-center gap-5.5 text-[15px] font-semibold lg:flex" aria-label="주 메뉴">
        <Link href="/" aria-current="page" className="-mb-[21px] border-b-2 border-ink pb-[19px]">
          타임라인
        </Link>
        <span className="font-medium text-muted-soft">지원 문항 · 다음 스프린트</span>
      </nav>
      <span className="flex-1" />
      <AddSourceButton className="hidden lg:inline-flex" />
    </header>
  );
}

/** 자료 넣기 — FE#6 에서 붙인다. 그 전엔 눌리지 않는다 */
export function AddSourceButton({ className }: { className?: string }) {
  return (
    <Button disabled title="자료 넣기는 다음 작업(FE#6)에서 열려요" className={className}>
      <PlusIcon />
      자료 넣기
    </Button>
  );
}
