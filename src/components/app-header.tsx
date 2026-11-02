import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "flex items-center gap-5 border-b border-line bg-surface px-4 py-3 lg:px-7 lg:py-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 font-bold">
        {/* 로고 · 서비스 이름은 아직 정하지 않았다(ETC#7 범위 제외) */}
        <span className="size-6.5 rounded-lg border-[1.5px] border-dashed border-leaf bg-leaf-soft" aria-hidden="true" />
        서비스 이름
        <small className="text-xs font-normal text-ink-3">(미정)</small>
      </div>
      <nav className="hidden gap-1 lg:flex" aria-label="주 메뉴">
        <Link href="/" aria-current="page" className="rounded-lg bg-paper px-3 py-1.5 text-sm font-semibold text-ink">
          타임라인
        </Link>
      </nav>
      <span className="flex-1" />
      {/* 자료 넣기는 FE#6 에서 붙인다 */}
      <Button size="lg" disabled title="자료 넣기는 다음 작업(FE#6)에서 열려요" className="px-3.5 font-semibold">
        <PlusIcon />
        자료 넣기
      </Button>
    </header>
  );
}
