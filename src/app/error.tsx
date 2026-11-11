"use client";

// 그리다가 난 예기치 못한 오류(FE#405) — 흰 화면 · Next 기본 영문 화면 대신. 루트 레이아웃 아래 전부((app) 레이아웃 · 로그인 문 포함)를 감싼다.
// 루트 레이아웃 자체의 오류는 여기서 못 잡는다(global-error 의 몫). 이 화면이 또 깨지지 않게 상태 화면 · 버튼 · 링크 · 아이콘만 쓴다.
// 오류 내용은 화면에 보이지 않는다 — 개발 중 원인은 콘솔에서 본다
import { useEffect } from "react";
import Link from "next/link";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-canvas px-4.5">
      <CenterState icon={<WarningCircleIcon className="text-error" />} title="문제가 생겼어요"
        body="화면을 불러오는 도중 예기치 못한 오류가 일어났어요. 잠시 뒤 다시 시도해 주세요.">
        <div className="flex flex-wrap justify-center gap-2">
          {/* 다시 시도 — 이 경계 안을 다시 그린다(페이지를 새로 읽지 않는다) */}
          <Button className="min-h-11 lg:min-h-10" onClick={() => reset()}>다시 시도</Button>
          {/* 주소가 바뀌면 Next 가 이 오류 경계를 풀고 홈을 새로 그린다 */}
          <Button asChild variant="secondary" className="min-h-11 lg:min-h-10"><Link href="/">홈으로 가기</Link></Button>
        </div>
      </CenterState>
    </main>
  );
}
