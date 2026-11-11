import { Skeleton } from "@/components/ui/skeleton";

/** 홈 「이어서」 카드 하나를 불러오는 동안 — 아이콘 · 꼬리 · 제목 · 한 줄 자리를 실제 카드와 같은 높이로(FE#402) */
export function ContinueCardSkeleton({ label }: { label?: string }) {
  // label 이 없으면 감싼 쪽(로그인 확인)이 이미 읽어 준다
  return <div role={label ? "status" : undefined} className="flex min-w-0 flex-col items-start gap-1 rounded-md border border-hairline bg-canvas/80 px-4 py-3">
    {label && <span className="sr-only">{label}</span>}
    <Skeleton className="size-5 rounded-full" />
    {/* 줄 높이는 실제 카드 글과 같은 글자 크기의 한 줄(h-lh). 마지막 줄은 안내 문구(text-note) 높이 —
        데이터가 있는 카드는 text-xs 라 5px 쯤 낮지만, PC 한 줄에선 가장 높은 카드에 맞춰진다 */}
    <span className="flex h-lh items-center text-xs"><Skeleton className="h-3 w-14" /></span>
    <span className="flex h-lh items-center text-sm leading-relaxed"><Skeleton className="h-4 w-32" /></span>
    <span className="flex h-lh items-center text-note"><Skeleton className="h-3 w-24" /></span>
  </div>;
}

/** 로그인을 확인하는 동안의 홈 자리(AuthGate) — 입력 모드 · 차곡이 · 질문 · 입력칸 · 「이어서」 카드의 자리만 잡는다.
 *  지원 · 경험 같은 내 데이터는 로그인이 끝나기 전엔 그리지 않는다 */
export function HomeSkeleton() {
  return <>
    <div className="mx-auto grid max-w-[760px] justify-items-center">
      <Skeleton className="mb-12 h-11 w-40 rounded-full lg:mb-20" />
      <Skeleton className="size-[72px] rounded-md max-lg:size-15" />
      <Skeleton className="mt-4 h-4 w-44" />
      <Skeleton className="mt-3 h-9 w-64 lg:h-12 lg:w-[26rem]" />
      <Skeleton className="mt-5 h-[118px] w-full rounded-lg" />
      {/* 예시 칩 · 외부 AI 안내 줄 — 없으면 「이어서」가 그만큼 올라붙었다가 내려간다 */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">{["w-40", "w-32", "w-36"].map(w => <Skeleton key={w} className={`h-8 rounded-full ${w}`} />)}</div>
      <Skeleton className="mt-4 h-4 w-80 max-w-full" />
    </div>
    <div className="mx-auto mt-8 max-w-[980px] lg:mt-[5vh]">
      <Skeleton className="mb-3 h-4 w-10" />
      <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <ContinueCardSkeleton key={i} />)}</div>
    </div>
  </>;
}
