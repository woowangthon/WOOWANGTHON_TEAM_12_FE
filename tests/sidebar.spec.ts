import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Locator, Page } from "@playwright/test";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "사이드바", exact: true });
// 접힌 레일의 로고 자리는 마스코트 그림(alt 없음 — 링크 이름이 「차곡 — 홈」)이다
const mascot = (brand: Locator) => brand.locator('img[src*="mascot"]');
// 본문 왼쪽 여백(내용 없는 곳)을 눌러 초점을 뺀다. 위쪽 40px 은 달라붙는 상단 막대 밑에 들어갈 수 있어 피한다
const clickMainMargin = (page: Page) => page.locator("main").click({ position: { x: 4, y: 80 } });
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_SIDEBAR_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-53/${name}.png`, fullPage: await page.getByRole("dialog").count() === 0,
    animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
});

test("icons stay in place throughout collapse and expansion while width and labels transition", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/questions");
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  const measure = async (label: string) => page.evaluate(async label => {
    const drawer = document.querySelector<HTMLElement>('aside[aria-label="사이드바"]')!;
    const read = () => ({
      width: drawer.getBoundingClientRect().width,
      padding: parseFloat(getComputedStyle(document.querySelector(".app-shell")!).paddingLeft),
      icons: Array.from(drawer.querySelectorAll('nav a:not([data-rail-only]) svg, nav button svg, [aria-label^="계정 메뉴"] svg')).map(el => {
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y };
      }),
      labels: Array.from(drawer.querySelectorAll("nav a:not([data-rail-only]) .sidebar-label, nav button .sidebar-label")).map(el => ({ text: el.textContent, opacity: Number(getComputedStyle(el).opacity) })),
    });
    const before = read();
    drawer.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    const frames = [];
    const start = performance.now();
    do {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      frames.push(read());
    } while (performance.now() - start < 450);
    return { before, frames };
  }, label);
  for (const label of ["사이드바 접기", "사이드바 펼치기"]) {
    const { before, frames } = await measure(label);
    expect(before.icons).toHaveLength(6); // 추가 · 홈 · 내 경험 · 내 지원서(FE#347) · 연결 · 계정
    expect(frames.some(f => f.width > 72.5 && f.width < 247.5)).toBe(true);
    expect(frames.some(f => f.labels.some(l => l.opacity > 0 && l.opacity < 1))).toBe(true);
    for (const frame of frames) {
      expect(frame.padding).toBeCloseTo(frame.width, 0);
      expect(frame.labels.map(l => l.text)).toEqual(before.labels.map(l => l.text));
      frame.icons.forEach((icon, i) => {
        expect(icon.x).toBeCloseTo(before.icons[i].x, 2);
        expect(icon.y).toBeCloseTo(before.icons[i].y, 2);
      });
    }
    // 전환이 늦게 시작해 450ms 표본이 아직 전환 중일 수 있다(FE#417) — 끝 너비는 기다려서 본다
    await expect.poll(() => sidebar(page).evaluate(el => el.getBoundingClientRect().width)).toBe(label === "사이드바 접기" ? 72 : 248);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sidebar(page).getByRole("button", { name: "사이드바 접기", exact: true }).click();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await expect(sidebar(page)).toHaveCSS("transition-duration", "0s");
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
  await clickMainMargin(page);
  await expect(mascot(brand)).toBeVisible();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "0");
  const logoBounds = (await brand.boundingBox())!;
  const toggleBounds = (await expand.boundingBox())!;
  // 펼침 버튼(40px 원)은 로고 칸(44 × 40)의 한가운데에 놓여 마스코트와 중심이 같다(FE#418)
  const center = (b: typeof logoBounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  expect(center(toggleBounds)).toEqual(center(logoBounds));
  await brand.hover();
  await expect(mascot(brand)).toBeHidden();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "1");
  await capture(page, "questions-1440-rail-hover");
  await page.mouse.move(500, 10);
  await expect(mascot(brand)).toBeVisible();
  await expand.focus();
  await expect(expand.locator("svg")).toHaveCSS("opacity", "1");
  await expand.press("Enter");
  await expect(sidebar(page)).toHaveCSS("width", "248px");
  await sidebar(page).getByRole("button", { name: "사이드바 접기", exact: true }).click();
  await clickMainMargin(page);
  const link = sidebar(page).getByRole("link", { name: "내 지원서", exact: true });
  await link.hover();
  await expect(page.getByRole("tooltip")).toHaveText("내 지원서");
  await page.mouse.move(500, 10);
  await capture(page, "questions-1440-collapsed");
  await page.reload();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await sidebar(page).getByRole("link", { name: "내 경험", exact: true }).click();
  await expect(page.getByRole("heading", { name: "내 경험", exact: true })).toBeVisible();
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await sidebar(page).getByRole("link", { name: "내 지원서", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^내 지원서/ })).toBeVisible();
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
  await expect(page.getByRole("banner").getByRole("navigation", { name: "주 메뉴", exact: true })).toBeHidden();
  await capture(page, "questions-1024");
  const brand = sidebar(page).locator('[data-slot="sidebar-brand"]');
  const navBefore = (await sidebar(page).getByRole("navigation", { name: "주 메뉴", exact: true }).boundingBox())!;
  await brand.hover();
  await expect(mascot(brand)).toBeHidden();
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
