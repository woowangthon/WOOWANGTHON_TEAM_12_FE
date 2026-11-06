import { openAddSource } from "./add-source";
import { test, expect } from "@playwright/test";
import { pickOption } from "./pick-option";

test("mock timeline, competency provenance edits, and source analysis remains mock", async ({ page }) => {
  await page.goto("/experience");
  await expect(page.getByRole("note")).toContainText("목 모드");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("활동 이름").fill("Cannot save");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("서버에 저장할 수 없어요");
  await expect(page.getByLabel("활동 이름")).toHaveValue("Cannot save");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: /^경험 수정:/ }).first().click();
  await page.getByLabel("경험 내용").fill("Mock edited experience");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  const item = page.getByRole("complementary").locator("li").first();
  await expect(item.getByText("AI", { exact: true })).toBeVisible();
  await item.getByRole("button", { name: /^경험 수정:/ }).click();
  await pickOption(page.getByLabel("수행 주체"), "팀");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByLabel("수행 주체")).toHaveCount(0);
  await expect(item.getByText("AI", { exact: true })).toBeVisible();
  await item.getByRole("button", { name: /^경험 수정:/ }).click();
  await page.getByLabel("협업", { exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  await expect(item.getByText("AI", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "경험 직접 추가", exact: true }).click();
  await page.getByLabel("경험 내용").fill("Manual mock experience");
  await page.getByLabel("협업", { exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const last = page.getByRole("complementary").locator("li").last();
  await expect(last).toContainText("Manual mock experience");
  await expect(last.getByText("AI", { exact: true })).toHaveCount(0);
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await openAddSource(page);
  await page.getByRole("dialog").getByRole("textbox").fill("Test source text");
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("목 분석 결과", { timeout: 15000 });
  await expect(page.getByRole("button", { name: /목 결과/ }).first()).toBeVisible();
});

test("empty and error mock routes remain available", async ({ page }) => {
  await page.goto("/experience?mock=empty");
  await expect(page.getByText("어떤 일을 해 왔나요?", { exact: true })).toBeVisible();
  await page.goto("/experience?mock=error");
  await expect(page.getByText("타임라인을 불러오지 못했어요", { exact: true })).toBeVisible();
});

test("mock experience search finds mock experiences and says so when nothing matches", async ({ page }) => {
  await page.goto("/experience");
  await page.getByRole("button", { name: "경험 찾기", exact: true }).click();
  await page.getByLabel("찾을 낱말").fill("WebSocket");
  await expect(page.locator("li[id^=result-]").filter({ hasText: "WebSocket" }).first()).toBeVisible();
  await page.getByLabel("찾을 낱말").fill("어디에도없는말");
  await expect(page.getByText("쌓인 자료에서 찾지 못했어요")).toBeVisible();
});

test("mock save survives reload and the saved filter uses it", async ({ page }) => {
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  const item = page.getByRole("complementary").locator("li").first();
  await item.getByRole("button", { name: /^저장: / }).click();
  await expect(item.getByRole("button", { name: /^저장함: / })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await page.getByRole("button", { name: "경험 찾기", exact: true }).click();
  await page.getByRole("button", { name: "저장한 것", exact: true }).click();
  await expect(page.getByText("경험 1개", { exact: true })).toBeVisible();
});
