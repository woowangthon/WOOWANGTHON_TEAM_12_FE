import Link from "next/link";
import { ChatCircleTextIcon, PlusIcon, RowsIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 서비스 이름은 아직 정하지 않았다 — 「차곡」은 유력 후보(ETC#19). 확정되면 여기 한 곳만 바꾼다
const NAME = "차곡";

function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-bold tracking-[-0.4px]", className)}>
      {NAME}
      <small className="text-xs font-normal tracking-normal text-muted-soft">가칭</small>
    </span>
  );
}

// 모바일 위 막대 — 이름만. 「자료 넣기」는 화면 오른쪽 아래 떠 있는 버튼으로 (DESIGN.md 「반응형」)
export function AppHeader({ className }: { className?: string }) {
  return (
    <header className={cn("flex h-14 items-center border-b border-hairline bg-canvas px-4.5", className)}>
      <Brand className="text-lg" />
    </header>
  );
}

// PC 왼쪽 사이드바 — 이름 · 「자료 넣기」 · 메뉴(다음 스프린트 메뉴는 흐리게) (DESIGN.md 「사이드바」)
export function AppSidebar({ className, addSource }: { className?: string; addSource: AddSourceProps }) {
  return (
    // aside 로 두지 않는다 — 화면의 complementary 는 활동 세부 하나다
    <div className={cn("w-60 shrink-0 flex-col gap-6 border-r border-hairline bg-paper px-4 pt-6 pb-5", className)}>
      <Brand className="px-2 text-[22px]" />
      <div className="grid gap-2">
        <AddSourceButton {...addSource} className="w-full" />
        <p className="m-0 px-1 text-xs leading-relaxed text-muted">
          README · 회고 · 노트를 넣으면 AI 가 읽고 활동과 경험을 찾아 정리해요.
        </p>
      </div>
      <nav className="grid gap-0.5 text-[15px]" aria-label="주 메뉴">
        <Link
          href="/"
          aria-current="page"
          className="flex h-10 items-center gap-2.5 rounded-sm bg-canvas px-2.5 font-semibold text-ink shadow-[0_0_0_1px_var(--hairline)]"
        >
          <RowsIcon className="size-[1.15em]" aria-hidden="true" />
          타임라인
        </Link>
        <span className="flex h-10 items-center gap-2.5 px-2.5 text-muted-soft" aria-disabled="true">
          <ChatCircleTextIcon className="size-[1.15em]" aria-hidden="true" />
          지원 문항
          <small className="ml-auto text-xs">곧</small>
        </span>
      </nav>
    </div>
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
