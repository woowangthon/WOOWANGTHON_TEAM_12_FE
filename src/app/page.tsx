// 빈 첫 화면 — 배포 · 미리보기가 도는지만 확인한다. 실제 화면은 FE#5 · FE#6 에서.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-4 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">내가 우왕이 될 상인가</h1>
      <p className="text-base text-neutral-600 dark:text-neutral-400">
        흩어진 자료에서 경험을 근거와 함께 찾아 쌓아 둡니다. 화면은 준비 중이에요.
      </p>
    </main>
  );
}
