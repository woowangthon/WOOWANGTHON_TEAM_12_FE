import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// 타임라인 줄과 같은 칸 나눔(timeline.tsx rowLayout) — 내용이 와도 줄이 옆으로 밀리지 않게
const rowLayout = "grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_264px] lg:items-center lg:gap-6";
const YEARS = [3, 2];
const NAMES = ["w-40", "w-52", "w-32"];

/** 내 경험 타임라인을 불러오는 동안 — 제목 · 분류 칩 · 연도 구분선 · 활동 줄 자리(FE#402).
 *  로그인 확인(AuthGate)도 /experience 에서 같은 뼈대를 그려 두 단계가 한 화면으로 이어진다 */
export function TimelineSkeleton({ announce = true }: { announce?: boolean }) {
  // announce=false — 감싼 쪽(로그인 확인)이 따로 읽어 준다
  return <div role={announce ? "status" : undefined} className="grid">
    {announce && <span className="sr-only">타임라인을 불러오고 있어요</span>}
    <div className="flex items-center gap-3">
      <Skeleton className="h-8 w-28 lg:h-10 lg:w-32" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="ml-auto h-11 w-21 rounded-full lg:h-10" />
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {["w-14", "w-28", "w-24", "w-34"].map(w => <Skeleton key={w} className={cn("h-9 rounded-full", w)} />)}
    </div>
    {YEARS.map((rows, y) => <section key={y} className="pt-7">
      <div className={cn(rowLayout, "border-b border-hairline pb-2")}><Skeleton className="h-6 w-24" /></div>
      <ul className="m-0 list-none p-0">
        {Array.from({ length: rows }, (_, i) => <li key={i} className={cn(rowLayout, "border-b border-hairline-soft py-3.5")}>
          <span className="grid gap-2">
            <Skeleton className={cn("h-5 lg:h-6", NAMES[(y + i) % NAMES.length])} />
            <Skeleton className="h-4 w-44" />
          </span>
          <Skeleton className="hidden h-1.5 w-full lg:block" />
        </li>)}
      </ul>
    </section>)}
  </div>;
}
