import { Suspense } from "react";
import { TimelineScreen } from "@/components/experience/timeline-screen";

// 첫 화면 — 연도별 타임라인(FE#5). 주소 쿼리(?mock=…)를 읽으므로 Suspense 로 감싼다
export default function Home() {
  return (
    <Suspense>
      <TimelineScreen />
    </Suspense>
  );
}
