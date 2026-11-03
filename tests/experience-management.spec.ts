import { test, expect, type Page } from "@playwright/test";
import type { ActivityDetail, CreateExperienceRequest, Experience } from "../src/lib/api/types";

// HTTP fixtures only. These verify UI behavior, not a running BE or DB.
async function setup(page: Page) {
  const activity: ActivityDetail = {
    id: 7, name: "Management activity", period: { start: "2025", end: "2025", ongoing: false },
    experiences: Array.from({ length: 4 }, (_, i) => ({
      id: 101 + i, activityId: 7, content: `Original ${i + 1}`, competencies: ["IMPLEMENTATION"], actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
      citations: [{ id: 201 + i, sourceId: 12, sourceName: "original.md", quote: `Quote ${i + 1}`, matched: true, location: null }],
    })),
  };
  const state = {
    activity, posts: [] as CreateExperienceRequest[], deletes: [] as number[],
    postError: 0, deleteError: 0, offline: false, delay: 0,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") {
      expect(path).toBe("/api/activities/7/experiences");
      state.posts.push(req.postDataJSON());
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.postError) return route.fulfill({ status: state.postError, json: { error: { code: state.postError === 404 ? "ACTIVITY_NOT_FOUND" : "INVALID_REQUEST", message: "Create rejected" } } });
      const experience: Experience = { id: 107, activityId: 7, ...req.postDataJSON(), content: "Saved by server", sourceStatus: "USER_ENTERED", citations: [] };
      activity.experiences.push(experience);
      return route.fulfill({ status: 201, json: experience });
    }
    if (req.method() === "DELETE") {
      const id = Number(path.split("/").at(-1));
      state.deletes.push(id);
      expect(req.postData()).toBeNull();
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.offline) return route.abort("failed");
      if (state.deleteError) return route.fulfill({ status: state.deleteError, json: { error: { code: state.deleteError === 404 ? "EXPERIENCE_NOT_FOUND" : "INVALID_REQUEST", message: "Delete rejected" } } });
      activity.experiences = activity.experiences.filter((e) => e.id !== id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: path === "/api/activities" ? { activities: [{ id: 7, name: activity.name, period: activity.period, experienceCount: activity.experiences.length }] } : activity });
  });
  await page.goto("/");
  await openActivity(page);
  return state;
}

async function openActivity(page: Page) {
  await page.getByRole("button", { name: /Management activity/ }).first().click();
  await expect(page.getByRole("button", { name: "경험 직접 추가", exact: true })).toBeVisible();
}

async function remove(page: Page, content: string) {
  await page.getByRole("button", { name: `경험 메뉴: ${content}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "지우기", exact: true }).click();
}

test("inline add validates, cancels, appends server record after collapsed items and survives reload", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "경험 직접 추가", exact: true }).click();
  await expect(page.getByLabel("경험 내용")).toBeFocused();
  await page.getByLabel("경험 내용").fill("Discarded");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.posts).toHaveLength(0);
  await page.getByRole("button", { name: "경험 직접 추가", exact: true }).click();
  await page.getByLabel("경험 내용").fill(" \n ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("경험 내용을 입력");
  expect(state.posts).toHaveLength(0);
  await page.getByLabel("경험 내용").fill("My manual experience");
  await page.getByLabel("수행 주체").selectOption("TEAM");
  await page.getByLabel("협업", { exact: true }).check();
  await page.getByLabel("문제 해결", { exact: true }).check();
  await page.getByLabel("기술 구현", { exact: true }).check();
  await expect(page.getByLabel("기획", { exact: true })).toBeDisabled();
  await page.getByLabel("문제 해결", { exact: true }).uncheck();
  await page.getByLabel("기술 구현", { exact: true }).uncheck();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const last = page.getByRole("complementary").locator("li").last();
  await expect(last).toContainText("Saved by server");
  await expect(last).toContainText("내가 입력");
  await expect(last).toContainText("근거 없음");
  await expect(last.getByText("AI", { exact: true })).toHaveCount(0);
  expect(state.posts).toEqual([{ content: "My manual experience", actor: "TEAM", competencies: ["COLLABORATION"] }]);
  await expect(page.getByText("이 활동에서 한 일 5", { exact: true })).toBeVisible();
  await page.reload();
  await openActivity(page);
  await page.getByRole("button", { name: /나머지 .*개 더 보기/ }).click();
  await expect(page.getByRole("complementary").locator("li").last()).toContainText("Saved by server");
});

test("failed add retains draft; duplicate submits are blocked and retry uses same draft", async ({ page }) => {
  const state = await setup(page);
  state.postError = 400;
  state.delay = 400;
  await page.getByRole("button", { name: "경험 직접 추가", exact: true }).click();
  await page.getByLabel("경험 내용").fill("Keep this draft");
  await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Create rejected");
  await expect(page.getByLabel("경험 내용")).toHaveValue("Keep this draft");
  expect(state.posts).toHaveLength(1);
  state.postError = 0;
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("Saved by server", { exact: true })).toBeVisible();
  expect(state.posts[1]).toEqual({ content: "Keep this draft", competencies: [], actor: "ME" });
});

test("delete hides immediately; undo restores order, status and evidence without any DELETE", async ({ page }) => {
  const state = await setup(page);
  await remove(page, "Original 2");
  await expect(page.getByText("Original 2", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("경험을 지웠어요");
  expect(state.deletes).toHaveLength(0);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(page.getByRole("complementary").locator("li").nth(1)).toContainText("Original 2");
  await page.waitForTimeout(5200);
  expect(state.deletes).toHaveLength(0);
  await expect(page.getByRole("complementary").locator("li").nth(1)).toContainText("원문 확인");
  await page.getByRole("complementary").locator("li").nth(1).getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Quote 2", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("toast expiry sends one DELETE and reload keeps the record deleted", async ({ page }) => {
  const state = await setup(page);
  await remove(page, "Original 1");
  await expect(page.getByText("Original 1", { exact: true })).toHaveCount(0);
  expect(state.deletes).toHaveLength(0);
  await expect.poll(() => state.deletes, { timeout: 8000 }).toEqual([101]);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("이 활동에서 한 일 3", { exact: true })).toBeVisible();
  await page.reload();
  await openActivity(page);
  await expect(page.getByText("Original 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Original 2", { exact: true })).toBeVisible();
});

for (const failure of [400, 404, "network"] as const) {
  test(`DELETE ${failure} restores the original position and shows the error`, async ({ page }) => {
    const state = await setup(page);
    state.deleteError = typeof failure === "number" ? failure : 0;
    state.offline = failure === "network";
    await remove(page, "Original 2");
    await page.getByRole("button", { name: "삭제 알림 닫기" }).click();
    const error = page.getByRole("alert").filter({ hasText: "경험을 복구했어요" });
    await expect(error).toBeVisible();
    await expect(error).toContainText(failure === "network" ? "서버에 연결하지 못했어요" : "Delete rejected");
    await expect(page.getByRole("complementary").locator("li").nth(1)).toContainText("Original 2");
    await expect(page.getByText("이 활동에서 한 일 4", { exact: true })).toBeVisible();
    expect(state.deletes).toEqual([102]);
  });
}

test("pending deletion survives closing detail; multiple undo windows are independent", async ({ page }) => {
  const state = await setup(page);
  await remove(page, "Original 1");
  await remove(page, "Original 2");
  await expect(page.getByRole("status")).toHaveCount(2);
  await page.getByRole("status").first().getByRole("button", { name: "되돌리기" }).click();
  await page.getByRole("button", { name: page.viewportSize()!.width < 1024 ? "타임라인" : "세부 닫기", exact: true }).click();
  await page.getByRole("button", { name: "삭제 알림 닫기" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(state.deletes).toEqual([102]);
  await openActivity(page);
  await expect(page.getByText("Original 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Original 2", { exact: true })).toHaveCount(0);
});

test("deleting the last experience keeps the activity and prevents duplicate DELETE while saving", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences = state.activity.experiences.slice(0, 1);
  state.delay = 600;
  await page.reload();
  await openActivity(page);
  await remove(page, "Original 1");
  await page.getByRole("button", { name: "삭제 알림 닫기" }).click();
  await expect(page.getByRole("status")).toContainText("지우고 있어요");
  await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(state.deletes).toEqual([101]);
  await expect(page.getByRole("heading", { name: "Management activity" })).toBeVisible();
  await expect(page.getByText("이 활동에서 한 일 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "경험 직접 추가", exact: true })).toBeVisible();
});
