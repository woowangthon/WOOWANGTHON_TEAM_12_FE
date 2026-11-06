// 시험 공통 — 실제 API 모드에서 「로그인된 상태」로 시작한다 (FE#37 · auth-api)
// 첫 화면 앞의 로그인 문(AuthGate)이 GET /api/auth/me 를 부르므로, 시험마다 그 응답을 준다.
// 각 시험의 page.route("**/api/**") 처리기는 /api/auth/ 와 /api/work 를 route.fallback() 으로 여기에 넘긴다
// (page 처리기가 context 처리기보다 먼저 불린다). 실제 BE 로그인 검증이 아니다.
import { test as base, expect } from "@playwright/test";
import type { Me } from "../src/lib/api/auth";

export const SIGNED_IN: Me = { id: 1, loginId: "test", dailyAnalysis: { used: 3, limit: 200 } };

export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ context }, use) => {
      await context.route("**/api/auth/me", (route) => route.fulfill({ json: SIGNED_IN }));
      // S-47 공통 조회의 시험 기본값. 작업 동작 시험은 page.route로 응답을 덮어쓴다.
      await context.route("**/api/work", route => route.fulfill({ json: { seenAt: null, inProgress: [], recent: [] } }));
      await use();
    },
    { auto: true },
  ],
});

export { expect };
