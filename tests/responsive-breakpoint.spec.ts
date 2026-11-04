import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";

// FE#61: change the browser default font through launchOptions, never page CSS.
test("responsive breakpoint: JS and CSS agree at the browser default font size", async ({ page }, info) => {
  test.setTimeout(60000);
  const fontSize = Number(info.project.metadata.defaultFontSize ?? 16);
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  const widths = info.project.name === "mobile" ? [390]
    : fontSize === 20 ? [1280, 1295, 1300, 1400, 1500, 1599, 1600, 1700, 1500]
      : [1279, 1280, 1300, 1400, 1500, 1600, 1024, 390, 1280];
  await page.setViewportSize({ width: widths[0], height: 1000 });
  await page.goto("/questions", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    const wide = width >= fontSize * 80;
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(`${fontSize}px`);
    expect(await page.evaluate(() => matchMedia("(min-width:80rem)").matches)).toBe(wide);
    if (fontSize === 20 && width >= 1280 && width < 1600) {
      expect(await page.evaluate(() => matchMedia("(min-width:1280px)").matches)).toBe(true);
    }
    const sidebar = page.locator('aside[aria-label="사이드바"]');
    const topMenu = page.getByRole("banner");
    if (wide) {
      await expect(sidebar).toBeVisible();
      await expect(topMenu).toBeHidden();
      await expect(page.locator("#application-list")).toHaveCount(0);
      await expect(sidebar.getByRole("button", { name: /OO 연합 동아리/ })).toBeVisible();
    } else {
      await expect(sidebar).toBeHidden();
      await expect(topMenu).toBeVisible();
      await expect(page.locator("#application-list")).toBeVisible();
    }
    // layout.tsx가 비워 둔 사이드바 자리도 CSS xl 전환과 같아야 한다.
    const padding = await page.locator('body > div[class~="xl:pl-62"]').evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    expect(padding).toBe(wide ? fontSize * 15.5 : 0);
    const content = page.locator("#selected-application");
    await expect(content).toBeVisible();
    const bounds = (await content.boundingBox())!;
    if (width >= 1300) {
      expect(bounds.width).toBeGreaterThan(260);
      const heading = content.getByRole("heading", { level: 2 });
      const lines = await heading.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
      expect(lines).toBeLessThanOrEqual(2.1);
    }
    if (!wide && width >= fontSize * 64) {
      const listing = (await page.locator("#application-list").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(listing.x + listing.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1" &&
      ((fontSize === 20 && [1400, 1600].includes(width)) || (fontSize === 16 && width === 390 && info.project.name === "mobile"))) {
      await page.screenshot({ path: `docs/fe-61/font-${fontSize}-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
    }
  }
});
