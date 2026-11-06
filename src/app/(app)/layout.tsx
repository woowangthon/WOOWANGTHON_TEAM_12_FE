import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { SidebarLayout } from "@/components/sidebar-layout";
import { WorkProvider } from "@/components/work/work-provider";

// 로그인한 사람의 앱 — 사이드바 · 로그인 문. 공개 페이지(/p/{token})는 이 묶음 밖에 둔다(S-65, FE#133)
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // 작업 면 — 레일 72px / 펼친 사이드바 248px 만큼만 비운다(FE#53).
    <SidebarLayout>
      <div className="relative flex flex-1 flex-col overflow-clip bg-canvas lg:rounded-l-lg lg:shadow-[0_0_0_1px_var(--hairline-soft)]">
        {/* 실제 API 모드면 로그인부터(FE#37). 목 모드는 그대로 */}
        <AuthGate><WorkProvider>{children}</WorkProvider></AuthGate>
      </div>
    </SidebarLayout>
  );
}
