import { Suspense } from "react";
import { HomeScreen } from "@/components/home/home-screen";

// 시안 6 홈 — 내 경험 타임라인은 /experience에서 연다.
export default function Home() {
  return (
    <Suspense>
      <HomeScreen />
    </Suspense>
  );
}
