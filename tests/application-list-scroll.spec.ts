// FE#340 — 「넣었던 지원」 목록: 좁은 화면(lg 아래)은 목록만 보이므로 높이 제한 없이 페이지가 스크롤, 레일 폭(1024)은 옆 칸이라 그대로 상자 안에서 스크롤
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Application } from "../src/lib/api/question-types";

const q = (id: number, applicationId: number) => ({ id, applicationId, organization: null, text: `${applicationId}번 지원의 첫 문항 — 지원 동기와 이루고 싶은 목표를 적어 주세요.`, status: "MATCHED" as const, createdAt: "2026-11-01T00:00:00Z" });
const list = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1, organization: `${i + 1}번 지원처`, organizationType: "COMPANY", jobRole: "BACKEND", applicationStatus: "WRITING", submittedMonth: null, createdAt: `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`, questions: [q((i + 1) * 10, i + 1)],
})) as unknown as Application[];

test("모바일 지원 목록은 288px 상자에 갇히지 않고 페이지가 스크롤된다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  await page.route("**/api/applications", route => route.request().method() === "GET" ? route.fulfill({ json: { applications: list } }) : route.fallback());
  const rows = page.locator("#application-list ul");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 목록으로" }).click(); // 지원을 열면 세부부터 — 목록은 이 버튼 뒤
  await expect(rows.locator("li")).toHaveCount(14);
  const box = await rows.evaluate(e => ({ client: e.clientHeight, scroll: e.scrollHeight, maxHeight: getComputedStyle(e).maxHeight }));
  expect(box.maxHeight).toBe("none");
  expect(box.client).toBe(box.scroll); // 안쪽 스크롤 없음 — 잘린 줄이 없다
  expect(box.client).toBeGreaterThan(288);
  // 페이지가 스크롤되니 아래 탭 바가 숨고(FE#147), 올리면 다시 나온다
  const tabBar = page.locator("[data-slot=tab-bar]");
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 200); // 끝이 아닌 곳까지만 — 끝에서는 탭 바가 다시 나온다
  await expect(tabBar).toHaveClass(/translate-y-full/);
  await page.mouse.wheel(0, -100);
  await expect(tabBar).not.toHaveClass(/translate-y-full/);
  await rows.locator("li").last().scrollIntoViewIfNeeded();
  await expect(rows.locator("li").last()).toBeInViewport(); // 마지막 지원도 잘림 없이 닿는다
  if (process.env.UPDATE_SHELL_SCREENSHOTS === "1") await page.screenshot({ path: "docs/fe-340/application-list-390.png", animations: "disabled", style: "nextjs-portal { display: none !important; }" });

  await page.setViewportSize({ width: 1024, height: 1000 });
  const rail = await rows.evaluate(e => ({ overflowY: getComputedStyle(e).overflowY, maxHeight: getComputedStyle(e).maxHeight }));
  expect(rail.overflowY).toBe("auto");
  expect(rail.maxHeight).not.toBe("none"); // lg 는 그대로 — 옆 칸이라 높이를 제한한다
});
