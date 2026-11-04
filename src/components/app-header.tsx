import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 위 막대 — 타임라인·문항 진입을 공유한다. 자료 넣기 동작은 기존 타임라인에서만 넘긴다.
export function AppHeader({ className, addSource, activePage = "timeline", timelineHref = "/" }: {
  className?: string; addSource?: AddSourceProps; activePage?: "timeline" | "questions"; timelineHref?: string;
}) {
  return (
    <header
      className={cn("flex h-14 items-center gap-3 border-b border-hairline bg-canvas px-4.5 lg:h-16 lg:gap-7 lg:px-7", className)}
    >
      {/* 로고 · 서비스 이름은 아직 정하지 않았다(ETC#7 범위 제외) */}
      <span className="whitespace-nowrap text-base font-bold tracking-[-0.3px] lg:text-[17px]">
        서비스 이름
        <small className="ml-1 text-xs font-normal text-muted-soft">미정</small>
      </span>
      <nav className="flex shrink-0 items-center gap-3 text-[13px] font-semibold lg:gap-5.5 lg:text-[15px]" aria-label="주 메뉴">
        <Link href={timelineHref} aria-current={activePage === "timeline" ? "page" : undefined} className={cn("inline-flex h-14 items-center border-b-2 lg:h-16", activePage === "timeline" ? "border-ink" : "border-transparent text-muted hover:text-ink")}>
          타임라인
        </Link>
        <Link href="/questions" aria-current={activePage === "questions" ? "page" : undefined} className={cn("inline-flex h-14 items-center border-b-2 lg:h-16", activePage === "questions" ? "border-ink" : "border-transparent text-muted hover:text-ink")}>지원 문항</Link>
      </nav>
      <span className="flex-1" />
      {addSource && <AddSourceButton {...addSource} className="hidden lg:inline-flex" />}
    </header>
  );
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
