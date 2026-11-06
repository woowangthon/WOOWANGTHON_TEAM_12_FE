import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { Job, SourceRequest, ActivityDetail } from "../src/lib/api/types";
import { makePdf, makePptx } from "./fixtures/source-files";

// Contract fixtures only. These tests do not run BE, DB or an AI model.
async function setup(page: Page) {
  const detail: ActivityDetail = { id: 70, name: "Extracted activity", period: { start: "2026-11", end: null, ongoing: true }, experiences: [{ id: 710, activityId: 70, content: "Server extracted experience", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "NEEDS_REVIEW", citations: [{ id: 720, sourceId: 12, sourceName: "note.md", quote: "Original source", matched: null, location: null }] }] };
  const state = {
    status: "ANALYZING" as Job["status"], error: null as Job["error"], empty: false,
    sources: [] as SourceRequest[], gets: 0, lists: 0, details: 0, retries: 0,
    getError: 0, retryError: false, refreshError: false, suggestion: false,
  };
  const job = (): Job => ({ jobId: 34, sourceId: 12, status: state.status, activityIds: state.status === "COMPLETED" && !state.empty ? [70] : [], targetActivityId: null, targetMatched: null, error: state.error, createdAt: "2026-11-02T21:00:00+09:00", updatedAt: "2026-11-02T21:00:10+09:00" });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
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
      return route.fulfill({ json: { activities: state.status === "COMPLETED" && !state.empty ? [{ id: 70, name: detail.name, period: detail.period, experienceCount: 1, mergeSuggestion: state.suggestion ? { activityId: 7, name: "기존 활동", period: detail.period } : null }] : [] } });
    }
    if (path === "/api/activities/70") { state.details++; return route.fulfill({ json: detail }); }
    throw new Error(`Unexpected API: ${req.method()} ${path}`);
  });
  await page.goto("/experience");
  await expect(page.getByRole("heading", { name: "어떤 일을 해 왔나요?" })).toBeVisible();
  return state;
}

async function submit(page: Page, text = "Original source") {
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  await page.getByLabel("붙여넣을 자료").fill(text);
  await page.getByRole("button", { name: "넣기", exact: true }).click();
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

test("분석 완료 알림에 이번 활동의 같은 활동 제안 수를 표시한다", async ({ page }) => {
  const state = await setup(page);
  state.suggestion = true;
  state.status = "COMPLETED";
  await submit(page);
  await expect(page.getByRole("status")).toContainText("기존 활동과 같아 보이는 활동 1개가 있어요", { timeout: 10000 });
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

test("text.length blocks 50001 UTF-16 units, accepts 50000 and prevents duplicate submit", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  const input = page.getByLabel("붙여넣을 자료");
  const button = page.getByRole("button", { name: "넣기", exact: true });
  await input.fill(" \n ");
  await expect(button).toBeDisabled();
  await input.fill("😀".repeat(25000) + "a");
  await expect(button).toBeDisabled();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(state.sources).toHaveLength(0);
  await input.fill("😀".repeat(25000));
  await expect(button).toBeEnabled();
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(state.sources).toHaveLength(1);
  expect(state.sources[0].text.length).toBe(50000);
});

test("file validation and JSON upload keep original name and text", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  const input = page.locator('input[type="file"]');
  const button = page.getByRole("button", { name: "넣기", exact: true });
  await input.setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("invalid") });
  await expect(button).toBeDisabled();
  await input.setInputFiles({ name: "long.txt", mimeType: "text/plain", buffer: Buffer.from("😀".repeat(25000) + "a") });
  await expect(page.getByText(/지금 50,001자/)).toBeVisible();
  await expect(button).toBeDisabled();
  expect(state.sources).toHaveLength(0);
  const text = "원본\n😀";
  await input.setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from(text) });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(state.sources).toEqual([{ kind: "FILE", name: "notes.md", text }]);
});

test("restore validates storage, separates mock jobs and shows a missing job error", async ({ page }) => {
  const state = await setup(page);
  const key = "analysis:pending-job:http://localhost:3100/api";
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ jobId: 34, name: "Restored source" }));
    localStorage.setItem("analysis:pending-job:mock", JSON.stringify({ jobId: 999, name: "Mock source" }));
  }, key);
  state.getError = 404;
  await page.reload();
  await expect(page.getByRole("heading", { name: "분석 상태를 확인하지 못했어요" })).toBeVisible();
  await expect(page.getByText("Job lookup failed", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ jobId: "invalid", name: "Invalid" })), key);
  const gets = state.gets;
  await page.reload();
  await expect(page.getByRole("heading", { name: "어떤 일을 해 왔나요?" })).toBeVisible();
  await page.clock.install();
  await page.clock.runFor(6000);
  expect(state.gets).toBe(gets);
  expect(state.sources).toHaveLength(0);
});

test("PDF · PPTX 는 브라우저에서 글자를 뽑아 sections 와 함께 보내고, 못 읽는 파일은 보내지 않는다 (FE#79)", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  const input = page.locator('input[type="file"]');
  const button = page.getByRole("button", { name: "넣기", exact: true });
  const dialog = page.getByRole("dialog");

  // 스캔 PDF 흉내 — 글자 층이 없다
  await input.setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: makePdf([[], []]) });
  await expect(dialog.getByRole("alert")).toContainText("글자를 읽을 수 없어요");
  await expect(button).toBeDisabled();
  // 깨진 파일
  await input.setInputFiles({ name: "broken.pptx", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await expect(dialog.getByRole("alert")).toContainText("읽지 못했어요");
  await expect(button).toBeDisabled();

  await input.setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: makePdf([["Kim Chagok", "Backend developer"], [], ["2024-09 Algorithm study"]]) });
  await expect(dialog.getByText("3쪽 중 1쪽(2쪽)은 글자를 읽지 못해", { exact: false })).toBeVisible();
  await expect(dialog.getByText(/2쪽 · \d+자/)).toBeVisible();
  await expect(button).toBeEnabled();

  await input.setInputFiles({ name: "발표.pptx", buffer: await makePptx(), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  await expect(dialog.getByText("3장 중 1장(슬라이드 3)", { exact: false })).toBeVisible();
  await page.screenshot({ path: `artifacts/source-pptx-${test.info().project.name}.png`, style: "nextjs-portal { display: none !important; }" });
  await button.click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(state.sources).toEqual([{
    kind: "FILE", name: "발표.pptx",
    text: "바꿔요 캡스톤 발표\n백엔드 담당\n4명 팀\n\n지표\n응답 1.2초",
    sections: [
      { kind: "SLIDE", number: 1, startLine: 1, endLine: 3 },
      { kind: "SLIDE", number: 2, startLine: 5, endLine: 6 },
    ],
  }]);
});
