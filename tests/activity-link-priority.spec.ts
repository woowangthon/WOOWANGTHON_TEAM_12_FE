// 시험 전용 HTTP 응답. 제품용 목이 아니고 실제 BE · AI 동작 검증도 아니다(FE#322).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail } from "../src/lib/api/types";

const summary = ({ id, name, period, note, experiences }: ActivityDetail) => ({ id, name, period, note, experienceCount: experiences.length });
const exp = (id: number, activityId: number, content: string) =>
  ({ id, activityId, content, competencies: [], competenciesBy: "AI" as const, actor: "ME" as const, sourceStatus: "SOURCE_CONFIRMED" as const, citations: [] });

async function setup(page: Page) {
  const activities: ActivityDetail[] = [
    { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, links: [], experiences: [exp(101, 7, "중고거래 앱의 채팅 기능을 만들었다")] },
    { id: 8, name: "알고리즘 스터디", period: { start: "2024-09", end: null, ongoing: true }, note: null, links: [], experiences: [exp(102, 8, "백준 문제를 매주 풀었다")] },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: activities.map(summary) } });
    const detail = path.match(/^\/api\/activities\/(\d+)$/);
    if (detail) return route.fulfill({ json: activities.find((a) => a.id === Number(detail[1]))! });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
}
const detailName = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
// 다른 화면에서 누른 링크처럼 앱 안에서 옮긴다(전체 새로 읽기가 아니라 — 숨겨진 화면이 상태를 남기는 경로)
const go = (page: Page, href: string) => page.evaluate((h) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(h), href);

test("다른 활동을 열어 둔 채여도 링크한 활동이 열리고 주소에서 지워진다", async ({ page }) => {
  await setup(page);
  await page.goto("/experience?activity=7");
  await expect(detailName(page, "바꿔요 — 캠퍼스 중고거래 앱")).toBeVisible();
  await expect(page).toHaveURL(/\/experience$/);

  await go(page, "/questions");
  await expect(page).toHaveURL(/\/questions/);
  await go(page, "/experience?activity=8&fromQuestion=41");
  await expect(detailName(page, "알고리즘 스터디")).toBeVisible();
  await expect(detailName(page, "바꿔요 — 캠퍼스 중고거래 앱")).toHaveCount(0);
  await expect(page).toHaveURL(/\/experience\?fromQuestion=41$/);

  // 새로고침해도 링크가 다시 강제로 열리지 않는다
  await page.reload();
  await expect(detailName(page, "알고리즘 스터디")).toHaveCount(0);
});

test("세부를 닫아 둔 경우와 경험 링크도 열린다", async ({ page }) => {
  await setup(page);
  await page.goto("/experience");
  await go(page, "/questions");
  await go(page, "/experience?activity=8");
  await expect(detailName(page, "알고리즘 스터디")).toBeVisible();
  await go(page, "/questions");
  await go(page, "/experience?experience=101");
  await expect(detailName(page, "바꿔요 — 캠퍼스 중고거래 앱")).toBeVisible();
  await expect(page).toHaveURL(/\/experience$/);
});
