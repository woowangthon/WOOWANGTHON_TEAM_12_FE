import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon } from "@phosphor-icons/react/ssr";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";

// 없는 주소(FE#405) — Next 기본 영문 화면 대신. 루트 레이아웃 안에서 그려 로그인 · 사이드바 없이도 뜬다(내 데이터는 보이지 않는다)
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-canvas px-4.5">
      <CenterState icon={<FileTextIcon />} title="페이지를 찾을 수 없어요" body="주소가 잘못되었거나 사라진 페이지예요.">
        <Button asChild className="min-h-11 lg:min-h-10">
          <Link href="/">홈으로 가기</Link>
        </Button>
      </CenterState>
    </main>
  );
}
