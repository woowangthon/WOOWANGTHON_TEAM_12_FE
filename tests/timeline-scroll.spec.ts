// 내 경험 — PC 에서 활동을 눌러도 목록 스크롤 자리는 그대로(FE#423). 좁은 화면은 세부가 전체 화면이라 맨 위부터 · 닫으면 목록 자리로.
// 합성 HTTP 응답만 쓴다 — 실제 BE 검증이 아니다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";

const N = 60;
const activities = Array.from({ length: N }, (_, i) => ({
  id: i + 1, name: `활동 ${i + 1}`, period: { start: `${1980 + i}-03`, end: `${1980 + i}-06`, ongoing: false }, experienceCount: 1,
}));

async function setup(page: Page) {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities } });
    const m = path.match(/^\/api\/activities\/(\d+)$/);
    if (m) {
      const a = activities[Number(m[1]) - 1];
      return route.fulfill({ json: { ...a, experiences: [{ id: 1000 + a.id, activityId: a.id, content: `${a.name} 에서 한 일`, competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "USER_ENTERED", citations: [] }] } });
    }
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND_IN_TEST", message: "x" } } });
  });
  await page.goto("/experience");
  await expect(page.getByRole("button", { name: /활동 50/ }).first()).toBeVisible();
}

/** 목록의 스크롤 자리 — PC 는 main 이 스스로 스크롤하고, 좁은 화면은 창이 스크롤한다 */
const scrollPos = (page: Page) => page.evaluate(() => window.scrollY + (document.querySelector("main")?.scrollTop ?? 0));

test("활동을 열어도 목록이 맨 위로 튀지 않는다(PC) · 좁은 화면은 닫으면 돌아온다", async ({ page }) => {
  await setup(page);
  const target = page.getByRole("button", { name: /활동 50/ }).first();
  await target.scrollIntoViewIfNeeded();
  const before = await scrollPos(page);
  expect(before).toBeGreaterThan(0);
  await target.click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  if (page.viewportSize()!.width >= 1024) {
    // 세부가 열리면 목록 폭이 줄어 줄이 다시 놓이므로 값은 조금 바뀔 수 있다 — 맨 위로 가지 않고 누른 활동이 보이면 된다
    expect(await scrollPos(page)).toBeGreaterThan(0);
    await expect(target).toBeInViewport();
  } else {
    await page.getByRole("button", { name: "내 경험", exact: true }).click(); // 모바일 돌아가기(FE#518)
    await expect.poll(() => scrollPos(page)).toBe(before);
  }
});

// FE#438 — PC 는 목록 · 세부가 각자 스크롤한다. 목록을 끝까지 내려도 문서는 그대로라 세부가 화면 안에 남는다
test("PC 에서 목록을 끝까지 내려도 활동 세부가 화면에 보인다", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "좁은 화면은 세부가 전체 화면");
  await setup(page);
  await page.getByRole("button", { name: /^활동 60 / }).first().click();
  const detail = page.getByRole("complementary", { name: "활동 세부" });
  await expect(detail.getByText("활동 60 에서 한 일")).toBeInViewport();
  await page.mouse.move(300, 500);
  await page.mouse.wheel(0, 50000);
  await expect.poll(() => page.evaluate(() => document.querySelector("main")!.scrollTop)).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(detail.getByText("활동 60 에서 한 일")).toBeInViewport();
  // 아래쪽 활동을 눌러도 세부가 바로 보인다
  await page.getByRole("button", { name: /^활동 1 / }).getByText("활동 1", { exact: true }).click();
  await expect(detail.getByText("활동 1 에서 한 일")).toBeInViewport();
});

// FE#518 — 좁은 화면 활동 세부의 돌아가기는 「내 경험」. 타임라인에서 열었으면 타임라인으로, 서랍에서 열었으면 서랍으로 돌아간다
test("좁은 화면 돌아가기는 「내 경험」 — 타임라인 · 서랍 어느 뷰에서 열었든 그 뷰로 돌아간다(FE#518)", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1024, "넓은 화면은 세부가 옆에 열린다");
  await setup(page);
  const back = page.getByRole("button", { name: "내 경험", exact: true });
  const view = (name: string) => page.getByRole("button", { name, exact: true });

  await page.getByRole("button", { name: /활동 50/ }).first().click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expect(page.getByRole("button", { name: "타임라인", exact: true })).toHaveCount(0); // 예전 문구는 없다
  await back.click();
  await expect(view("타임라인")).toHaveAttribute("aria-pressed", "true");

  await view("서랍").click();
  const drawer = page.locator('section[aria-labelledby="activity-drawer"]');
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button").filter({ hasText: "활동 2" }).first().click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await back.click();
  await expect(view("서랍")).toHaveAttribute("aria-pressed", "true");
  await expect(drawer).toBeVisible();
});
