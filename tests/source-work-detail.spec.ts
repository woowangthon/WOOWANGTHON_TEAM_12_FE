import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";

// HTTP fixtures only — 소식의 「자료 분석」에서 온 카드(S-47 · FE#398). 실제 BE · AI 결과가 아니다.
const SUMMARY = (id: number, name: string) => ({ id, name, period: { start: "2025-03", end: "2025-06", ongoing: false }, experienceCount: 1 });
const ACTIVITIES = [SUMMARY(7, "Swap app"), SUMMARY(9, "Swap deploy")];
const job = (patch: object = {}) => ({ jobId: 34, sourceId: 12, status: "COMPLETED", activityIds: [7, 9], targetActivityId: null, targetMatched: null, error: null, createdAt: "2026-11-06T09:00:00+09:00", ...patch });

async function setup(page: Page, jobBody: object = job(), sourceStatus = 200) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") { return route.fulfill({ json: { activities: ACTIVITIES } }); }
    if (path === "/api/jobs/34") return route.fulfill({ json: jobBody });
    if (path === "/api/sources/12") return sourceStatus === 200
      ? route.fulfill({ json: { id: 12, name: "retro.md", text: "본문", createdAt: "2026-11-06T09:00:00+09:00" } })
      : route.fulfill({ status: sourceStatus, json: { error: { code: "SOURCE_NOT_FOUND", message: "없음" } } });
    const activity = path.match(/^\/api\/activities\/(\d+)$/);
    if (activity) return route.fulfill({ json: { ...ACTIVITIES.find(a => a.id === Number(activity[1])), experiences: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "없음" } } });
  });
}
const card = (page: Page) => page.getByRole("region", { name: "자료 분석 상세" });

test("자료 이름 · 활동 이름을 보이고(번호 없이) 닫으면 새로고침 없이 주소에서 workJob 이 빠진다", async ({ page }) => {
  await setup(page);
  await page.goto("/experience?workJob=34&source=12");
  await expect(card(page).getByRole("heading", { name: /자료 분석/ })).toContainText("완료");
  await expect(card(page)).toContainText("retro.md");
  await expect(card(page).getByRole("button", { name: /^Swap app 보기/ })).toBeVisible();
  await expect(card(page).getByRole("button", { name: /^Swap deploy 보기/ })).toBeVisible();
  await expect(card(page)).not.toContainText("자료 12");
  await expect(card(page)).not.toContainText("활동 7");
  await expect(card(page).getByRole("link")).toHaveCount(0);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true; }); // 전체 새로고침이면 이 표시가 사라진다
  await card(page).getByRole("button", { name: "자료 분석 닫기" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/experience$/);
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});

test("활동 칩을 누르면 새로고침 없이 그 활동 세부로 가고 카드는 닫힌다", async ({ page }) => {
  await setup(page);
  await page.goto("/experience?workJob=34&source=12");
  await page.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true; });
  await card(page).getByRole("button", { name: /^Swap deploy 보기/ }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { name: "Swap deploy" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/experience$/);
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});

test("자료 이름을 못 읽어도 번호 대신 이름 칸만 비고, 활동을 못 찾으면 그렇다고 알린다", async ({ page }) => {
  await setup(page, job({ activityIds: [99] }), 404);
  await page.goto("/experience?workJob=34");
  await expect(card(page)).toContainText("지금 목록에 없어요");
  await expect(card(page)).not.toContainText("자료 12");
  await expect(card(page)).not.toContainText("활동 99");
});

test("활동을 못 찾은 자료는 안내 문구를 보인다", async ({ page }) => {
  await setup(page, job({ activityIds: [] }));
  await page.goto("/experience?workJob=34");
  await expect(card(page)).toContainText("이 자료에서는 활동을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.");
});
