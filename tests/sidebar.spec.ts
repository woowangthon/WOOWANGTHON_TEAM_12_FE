import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Page } from "@playwright/test";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "사이드바", exact: true });
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_SIDEBAR_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-53/${name}.png`, fullPage: await page.getByRole("dialog").count() === 0,
    animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
});

test("desktop collapse survives reload and navigation; the application list remains reachable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/questions");
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  await expect(sidebar(page).getByRole("button", { name: /OO 연합 동아리/ })).toBeVisible();
  await capture(page, "questions-1440");
  await sidebar(page).getByRole("button", { name: "사이드바 접기", exact: true }).click();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await expect(page.getByRole("complementary", { name: "지원 목록", exact: true })).toBeVisible();
  // 시안 6: 별도 버튼 줄 없이 로고와 펼침 버튼이 같은 자리를 쓴다.
  const brand = sidebar(page).locator('[data-slot="sidebar-brand"]');
  const expand = sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true });
  await page.getByRole("heading", { name: "지원", level: 1, exact: true }).click();
  await expect(brand.getByAltText("차곡")).toBeVisible();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "0");
  const logoBounds = (await brand.boundingBox())!;
  const toggleBounds = (await expand.boundingBox())!;
  expect(toggleBounds).toEqual(logoBounds);
  await brand.hover();
  await expect(brand.getByAltText("차곡")).toBeHidden();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "1");
  await capture(page, "questions-1440-rail-hover");
  await page.mouse.move(500, 10);
  await expect(brand.getByAltText("차곡")).toBeVisible();
  await expand.focus();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "1");
  await expand.press("Enter");
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  await sidebar(page).getByRole("button", { name: "사이드바 접기", exact: true }).click();
  await page.getByRole("heading", { name: "지원", level: 1, exact: true }).click();
  const link = sidebar(page).getByRole("link", { name: "지원", exact: true });
  await link.hover();
  await expect(page.getByRole("tooltip")).toHaveText("지원");
  await page.mouse.move(500, 10);
  await capture(page, "questions-1440-collapsed");
  await page.reload();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await sidebar(page).getByRole("link", { name: "내 경험", exact: true }).click();
  await expect(page.getByRole("heading", { name: "내 경험", exact: true })).toBeVisible();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await sidebar(page).getByRole("link", { name: "지원", exact: true }).click();
  await expect(page.locator("#application-list").getByRole("button").first()).toBeVisible();
  await sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  await page.reload();
  await expect(sidebar(page)).toHaveCSS("width", "248px");
});

test("automatic rail overlays without moving content, supports Escape and resets when resized", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/questions");
  await expect(page.getByRole("tabpanel", { name: "선택한 문항" })).toBeVisible();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await expect(page.getByRole("banner")).toBeHidden();
  await capture(page, "questions-1024");
  const brand = sidebar(page).locator('[data-slot="sidebar-brand"]');
  const navBefore = (await sidebar(page).getByRole("navigation", { name: "주 메뉴", exact: true }).boundingBox())!;
  await brand.hover();
  await expect(brand.getByAltText("차곡")).toBeHidden();
  const navAfter = (await sidebar(page).getByRole("navigation", { name: "주 메뉴", exact: true }).boundingBox())!;
  expect(navAfter).toEqual(navBefore);
  await capture(page, "questions-1024-rail-hover");
  const before = (await page.locator("#selected-application").boundingBox())!;
  await sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "사이드바", exact: true });
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS("width", "248px");
  await expect(overlay.getByRole("button", { name: /OO 연합 동아리/ })).toBeVisible();
  const after = (await page.locator("#selected-application").boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(before.width);
  await capture(page, "questions-1024-overlay");
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true })).toBeFocused();
  await sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  await overlay.getByRole("button", { name: /OO 연합 동아리/ }).click();
  await expect(overlay).toHaveCount(0);
  await sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole("banner")).toBeVisible();
  await page.setViewportSize({ width: 1279, height: 1000 });
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await expect(overlay).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ }).click();
  await expect(page.getByRole("dialog", { name: "차곡이", exact: true })).toBeVisible();
  await capture(page, "questions-1024-chagok");
});

test("timeline detail and application panel fit the review widths", async ({ page }, info) => {
  const width = info.project.name === "mobile" ? 390 : 1440;
  for (const size of width === 390 ? [390] : [1440, 1024]) {
    await page.setViewportSize({ width: size, height: size === 390 ? 844 : 1000 });
    await page.goto("/?activity=7");
    const detail = page.getByRole("complementary", { name: "활동 세부", exact: true });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { level: 2 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, `timeline-${size}`);
    await page.goto("/questions");
    await expect(page.getByRole("tabpanel", { name: "선택한 문항" })).toBeVisible();
    if (size === 390) {
      await expect(sidebar(page)).toBeHidden();
      await expect(page.getByRole("banner")).toBeVisible();
      await capture(page, "questions-390");
      await page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ }).click();
      await expect(page.getByRole("dialog", { name: "차곡이", exact: true })).toBeVisible();
      await capture(page, "questions-390-chagok");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
