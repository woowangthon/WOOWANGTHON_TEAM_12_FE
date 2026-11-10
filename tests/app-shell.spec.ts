// FE#147 — 공통 틀: PC 상단 바 · 사이드바(「+ 추가」 · 홈 · 내 경험 · 지원서 목록 · 연결)
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Page } from "@playwright/test";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "사이드바", exact: true });
const applications = (page: Page) => sidebar(page).getByRole("region", { name: "최근 지원서", exact: true });
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_SHELL_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-147/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};
const install = async (page: Page) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  const api = new FakeQuestionApi();
  await api.install(page);
  return api;
};

test("every screen has the top bar with its location and no button without a feature", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await install(page);
  for (const [path, name] of [["/", "홈"], ["/experience", "내 경험"], ["/questions", "지원서"], ["/connections", "연결 · 내보내기"], ["/guidelines", "작성 지침"]]) {
    await page.goto(path);
    const location = page.getByRole("banner").getByRole("navigation", { name: "현재 위치", exact: true });
    await expect(location).toContainText("내 서랍");
    await expect(location.locator("strong")).toHaveText(name);
    // 빠른 찾기(FE#126) · 소식(FE#106) · 최근 수정(FE#237), 지원을 열면 차곡이(FE#212)
    await expect(page.getByRole("banner").getByRole("button")).toHaveCount(path === "/questions" ? 4 : 3);
    await expect(page.getByRole("banner").getByRole("button", { name: "최근 수정", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "빠른 찾기", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: /^진행 중인 일 \d+개/ })).toBeVisible();
    await expect(page.getByText("모두 저장됨")).toHaveCount(0);
  }
});

test("sidebar shows the applications anywhere and a row opens that application", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await install(page);
  await page.goto("/experience");
  await expect(sidebar(page).getByRole("link", { name: "홈", exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "내 경험", exact: true })).toContainText(/\d+/);
  await expect(sidebar(page).getByRole("link", { name: "연결 · 내보내기", exact: true })).toBeVisible();
  const row = applications(page).getByRole("link", { name: /OO 연합 동아리/ });
  await expect(row).toBeVisible();
  // 전체 목록은 위 「내 지원서」 메뉴 하나 — 내 경험처럼 개수를 단다(FE#364)
  await expect(sidebar(page).getByRole("link", { name: "내 지원서", exact: true })).toHaveAttribute("href", "/applications");
  await expect(sidebar(page).getByRole("link", { name: "내 지원서", exact: true })).toContainText(/\d+/);
  await expect(applications(page).getByRole("link", { name: "모든 지원서", exact: true })).toHaveCount(0);
  await capture(page, "experience-1440");
  await row.click();
  await expect(page).toHaveURL(/\/questions\?question=\d+/);
  await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();
  await expect(sidebar(page).locator("button[aria-pressed=true]")).toContainText("OO 연합 동아리");
  await expect(sidebar(page).getByRole("link", { name: "내 지원서", exact: true })).toHaveAttribute("aria-current", "page"); // 지원 화면도 내 지원서 영역(FE#347)
  await capture(page, "questions-1440");
});

test("failing to load the applications is an error with retry, not an empty list", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await install(page);
  api.listDown = true;
  await page.goto("/connections");
  await expect(applications(page).getByRole("alert")).toContainText("지원서를 불러오지 못했어요.");
  await expect(applications(page).getByText("아직 넣은 지원서가 없어요.")).toHaveCount(0);
  await capture(page, "connections-list-error-1440");
  api.listDown = false;
  await applications(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(applications(page).getByRole("link", { name: /OO 연합 동아리/ })).toBeVisible();
  await expect(applications(page).getByRole("alert")).toHaveCount(0);
});

test("the add menu opens a new application from another screen, once", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await install(page);
  await page.goto("/connections");
  await sidebar(page).getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(2); // 자료 쌓기 · 새 지원서 — 직접 기록하기는 자료 쌓기에 합쳤다(FE#364)
  await expect(page.getByRole("menu").getByText("쌓기", { exact: true })).toBeVisible();
  await expect(page.getByRole("menu").getByText("꺼내기", { exact: true })).toBeVisible();
  await capture(page, "add-menu-1440");
  await page.getByRole("menuitem", { name: /^새 지원서/ }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(page.locator("#selected-application")).toHaveAttribute("aria-label", "새 지원 입력");
  await expect(page).not.toHaveURL(/new=1/);
  await page.reload();
  await expect(page.locator("#selected-application")).toHaveAttribute("aria-label", "선택한 지원");
  // 지원 화면 안에서는 옮겨 가지 않고 바로 연다
  await applications(page).getByRole("button", { name: "새 지원서", exact: true }).click();
  await expect(page.locator("#selected-application")).toHaveAttribute("aria-label", "새 지원 입력");
});

test("rail keeps the menu reachable: applications icon, add menu and overlay list", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await install(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/experience");
  await expect(sidebar(page)).toHaveCSS("width", "72px");
  await expect(sidebar(page).getByRole("link", { name: "내 지원서", exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole("region", { name: "최근 지원서", exact: true })).toHaveCount(0);
  await capture(page, "experience-1024");
  await sidebar(page).getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^자료 쌓기/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await sidebar(page).getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "사이드바", exact: true });
  await overlay.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^새 지원서/ })).toBeVisible();
  await capture(page, "add-menu-overlay-1024");
  await page.getByRole("menuitem", { name: /^새 지원서/ }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator("#selected-application")).toHaveAttribute("aria-label", "새 지원 입력");
});

test("390 uses a one line top bar and a bottom tab bar without the desktop shell or its requests", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  const api = await install(page);
  await page.goto("/connections");
  const banner = page.getByRole("banner").filter({ visible: true });
  const tabs = page.getByRole("navigation", { name: "주 메뉴", exact: true });
  await expect(tabs.getByRole("link")).toHaveText(["홈", "내 경험", "지원서", "연결"]);
  await expect(tabs.getByRole("link", { name: "연결", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(banner.getByRole("button", { name: "빠른 찾기", exact: true })).toBeVisible();
  // 본화면을 줄이지 않는다 — 위 45 + 아래 56 은 예전 두 줄(45 + 56)과 같다
  expect((await banner.boundingBox())!.height).toBe(45);
  expect((await tabs.boundingBox())!.height).toBeLessThanOrEqual(57);
  for (const target of await tabs.locator("a, button").all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await tabs.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([/^자료 쌓기/, /^새 지원서/]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("banner").getByRole("navigation", { name: "현재 위치", exact: true })).toBeHidden();
  await expect(sidebar(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(api.calls.filter(c => c.call === "GET /api/applications")).toHaveLength(0);
  await capture(page, "connections-390");
});

test("the tab bar hides while scrolling down, returns on the way up, and stays out of typing", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await install(page);
  await page.goto("/connections");
  const tabs = page.getByRole("navigation", { name: "주 메뉴", exact: true });
  await expect(tabs).toBeInViewport();
  await page.evaluate(() => { document.body.style.minHeight = "3000px"; window.scrollTo(0, 400); });
  await expect(tabs).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(tabs).toBeInViewport();
  // 끝까지 내리면 더 내릴 곳이 없으니 탭바가 나온다
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(tabs).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(tabs).toBeInViewport();
  await page.goto("/");
  await expect(tabs).toBeVisible();
  await page.getByRole("textbox").first().focus();
  await expect(tabs).toBeHidden();
  await page.getByRole("textbox").first().blur();
  await expect(tabs).toBeVisible();
});

// FE#243 — 지원서가 0개면 넣으러 가는 길 「첫 지원서 넣기」. 있으면 아래 링크 없이 위 「내 지원서」 메뉴로(FE#364)
test("with no applications the sidebar offers 「첫 지원서 넣기」", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi({ empty: true }).install(page);
  await page.goto("/experience");
  await expect(applications(page).getByText("아직 넣은 지원서가 없어요.")).toBeVisible();
  await expect(applications(page).getByRole("link", { name: "모든 지원서", exact: true })).toHaveCount(0);
  const first = applications(page).getByRole("link", { name: "첫 지원서 넣기", exact: true });
  await expect(first).toHaveAttribute("href", "/questions");
  await page.screenshot({ path: "artifacts/sidebar-applications-empty-1440.png", style: "nextjs-portal { display: none !important; }" });
  await first.click();
  await expect(page).toHaveURL(/\/questions$/);
});

test("with applications there is no extra link; a load failure does not claim there are none", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await install(page);
  await page.goto("/experience");
  await expect(applications(page).getByRole("link", { name: /OO 연합 동아리/ })).toBeVisible();
  await expect(applications(page).getByRole("link", { name: "첫 지원서 넣기", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/sidebar-applications-filled-1440.png", style: "nextjs-portal { display: none !important; }" });
  api.listDown = true;
  await page.reload();
  await expect(applications(page).getByRole("alert")).toContainText("지원서를 불러오지 못했어요.");
  await expect(applications(page).getByRole("link", { name: "첫 지원서 넣기", exact: true })).toHaveCount(0);
});
