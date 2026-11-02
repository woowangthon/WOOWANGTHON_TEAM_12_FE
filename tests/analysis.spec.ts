import { test, expect, type Page } from "@playwright/test";
import type { Job, SourceRequest, ActivityDetail } from "../src/lib/api/types";

// Contract fixtures only. These tests do not run BE, DB or an AI model.
async function setup(page: Page) {
  const detail: ActivityDetail = { id: 70, name: "Extracted activity", period: { start: "2026-11", end: null, ongoing: true }, experiences: [{ id: 710, activityId: 70, content: "Server extracted experience", perspective: null, actor: "ME", sourceStatus: "NEEDS_REVIEW", citations: [{ id: 720, sourceId: 12, sourceName: "note.md", quote: "Original source", matched: null, location: null }] }] };
  const state = {
    status: "ANALYZING" as Job["status"], error: null as Job["error"], empty: false,
    sources: [] as SourceRequest[], gets: 0, lists: 0, details: 0, retries: 0,
    getError: 0, retryError: false, refreshError: false,
  };
  const job = (): Job => ({ jobId: 34, sourceId: 12, status: state.status, activityIds: state.status === "COMPLETED" && !state.empty ? [70] : [], error: state.error, createdAt: "2026-11-02T21:00:00+09:00", updatedAt: "2026-11-02T21:00:10+09:00" });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/sources") {
      expect(req.method()).toBe("POST");
      state.sources.push(req.postDataJSON());
      return route.fulfill({ status: 202, json: { sourceId: 12, jobId: 34, status: "ANALYZING" } });
    }
    if (path === "/api/jobs/34/retry") {
      expect(req.method()).toBe("POST");
      expect(req.postData()).toBeNull();
      state.retries++;
      if (state.retryError) return route.fulfill({ status: 409, json: { error: { code: "JOB_NOT_FAILED", message: "Job is no longer failed" } } });
      state.status = "ANALYZING";
      state.error = null;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({ status: 202, json: job() });
    }
    if (path === "/api/jobs/34") {
      expect(req.method()).toBe("GET");
      state.gets++;
      if (state.getError) return route.fulfill({ status: state.getError, json: { error: { code: state.getError === 404 ? "JOB_NOT_FOUND" : "INTERNAL_ERROR", message: "Job lookup failed" } } });
      return route.fulfill({ json: job() });
    }
    if (path === "/api/activities") {
      state.lists++;
      if (state.refreshError && state.status === "COMPLETED") return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "Activity refresh failed" } } });
      return route.fulfill({ json: { activities: state.status === "COMPLETED" && !state.empty ? [{ id: 70, name: detail.name, period: detail.period, experienceCount: 1 }] : [] } });
    }
    if (path === "/api/activities/70") { state.details++; return route.fulfill({ json: detail }); }
    throw new Error(`Unexpected API: ${req.method()} ${path}`);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "어떤 일을 해 왔나요?" })).toBeVisible();
  return state;
}

async function submit(page: Page, text = "Original source") {
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  await page.getByLabel("붙여넣을 자료").fill(text);
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
}

test("polling survives reload, does not resubmit, then refreshes actual list and detail", async ({ page }) => {
  const state = await setup(page);
  await submit(page);
  await expect(page.getByRole("progressbar", { name: "분석 중" })).toBeVisible();
  await expect.poll(() => state.gets).toBeGreaterThan(0);
  const before = state.gets;
  await page.reload();
  await expect(page.getByRole("progressbar", { name: "분석 중" })).toBeVisible();
  await expect.poll(() => state.gets).toBeGreaterThan(before);
  expect(state.sources).toEqual([{ kind: "TEXT", name: null, text: "Original source" }]);
  state.status = "COMPLETED";
  await expect(page.getByText("Server extracted experience", { exact: true })).toBeVisible({ timeout: 10000 });
  expect(state.lists).toBeGreaterThan(1);
  expect(state.details).toBe(1);
  await expect(page.getByText("확인 필요", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("analysis:pending-job:")).length)).toBe(0);
  const completedGets = state.gets;
  await page.clock.install();
  await page.clock.runFor(6000);
  expect(state.gets).toBe(completedGets);
});

test("AI timeout is a failure; retry uses the same job, prevents duplicate requests", async ({ page }) => {
  const state = await setup(page);
  state.status = "FAILED";
  state.error = { code: "AI_TIMEOUT", message: "AI did not respond in 120 seconds" };
  await submit(page);
  await expect(page.getByText(/AI 서버가 제한 시간/)).toBeVisible();
  await expect(page.getByText(/AI did not respond/)).toBeVisible();
  await page.getByRole("button", { name: "다시 시도", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(state.retries).toBe(1);
  expect(state.sources).toHaveLength(1);
  state.status = "COMPLETED";
  await expect(page.getByText("Server extracted experience", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("completed empty analysis is not failure and stops polling", async ({ page }) => {
  const state = await setup(page);
  state.status = "COMPLETED";
  state.empty = true;
  await submit(page);
  await expect(page.getByRole("heading", { name: "이 자료에서는 활동을 찾지 못했어요" })).toBeVisible();
  await expect.poll(() => state.lists).toBeGreaterThan(1);
  const completedGets = state.gets;
  await page.clock.install();
  await page.clock.runFor(6000);
  expect(state.gets).toBe(completedGets);
  expect(state.retries).toBe(0);
});

test("lookup failure can be checked again; retry conflict shows the server error", async ({ page }) => {
  const state = await setup(page);
  state.getError = 503;
  await submit(page);
  await expect(page.getByText("Job lookup failed", { exact: true })).toBeVisible();
  state.getError = 0;
  state.status = "FAILED";
  state.error = { code: "AI_UNAVAILABLE", message: "AI server unreachable" };
  await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(page.getByText(/AI server unreachable/)).toBeVisible();
  state.retryError = true;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Job is no longer failed");
  state.status = "COMPLETED";
  state.error = null;
  await page.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
  await expect(page.getByText("Server extracted experience", { exact: true })).toBeVisible();
});

test("completed analysis does not hide a failed activity refresh with fake results", async ({ page }) => {
  const state = await setup(page);
  state.status = "COMPLETED";
  state.refreshError = true;
  await submit(page);
  await expect(page.getByText("Activity refresh failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Server extracted experience", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /목 결과/ })).toHaveCount(0);
});
