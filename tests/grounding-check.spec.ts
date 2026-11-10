// 시험 전용 HTTP 응답으로 S-45 화면을 검증한다. 실제 BE/AI 품질 검증은 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { GROUNDING_EXAMPLE } from "./fixtures/grounding-example";
import type { GroundingCheck } from "../src/lib/api/question-types";

// 점검 결과 목록은 접힌 <details> 안에 있다(FE#307) — 요약을 찾고, 필요하면 펼친다
const summary = (page: Page, text: string | RegExp = /근거 점검 —/) => screen(page).locator("summary").filter({ hasText: text });
async function openList(page: Page) {
  const details = screen(page).locator("details").filter({ hasText: /근거 점검 —/ });
  if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await summary(page).click();
}
const screen = (page: Page) => page.getByRole("region", { name: "내가 쓴 답", exact: true });
async function setup(page: Page, initial: GroundingCheck | null = null) {
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  const state = { saved: initial, postError: "", readError: false, fail: false, hold: false, posts: [] as { text: string }[], gets: 0 };
  await page.route("**/api/questions/*/grounding-check", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (id !== 41) return route.fulfill({ json: { groundingCheck: null } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      state.posts.push(body);
      if (state.postError) return route.fulfill({ status: state.postError === "DAILY_LIMIT_EXCEEDED" ? 429 : 409, json: { error: { code: state.postError, message: state.postError } } });
      state.saved = { ...structuredClone(GROUNDING_EXAMPLE), text: body.text, status: "ANALYZING", sentences: [] };
      return route.fulfill({ status: 202, json: state.saved });
    }
    state.gets++;
    if (state.readError) return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "상태 연결 실패" } } });
    if (state.saved?.status === "ANALYZING" && !state.hold) state.saved = state.fail
      ? { ...state.saved, status: "FAILED", error: { code: "AI_TIMEOUT", message: "AI 응답 시간이 초과됐어요." } }
      : { ...structuredClone(GROUNDING_EXAMPLE), text: state.saved.text };
    return route.fulfill({ json: { groundingCheck: state.saved } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/questions?question=41");
  await expect(screen(page)).toBeVisible();
  return { state, api };
}

test("checks text, distinguishes all statuses, opens non-recommended evidence, restores last check and marks edits", async ({ page }, info) => {
  const { state } = await setup(page);
  const s = screen(page), input = s.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(input).toBeEnabled();
  await expect(input).toHaveAttribute("maxlength", "5000");
  await expect(s.getByRole("button", { name: "근거 점검", exact: true })).toBeDisabled();
  await input.fill("  ");
  await expect(s.getByRole("button", { name: "근거 점검", exact: true })).toBeDisabled();
  await input.fill(GROUNDING_EXAMPLE.text);
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  await expect(s.getByRole("button", { name: "근거 점검 중…" })).toBeDisabled();
  await expect(summary(page)).toBeVisible();
  await openList(page);
  expect(state.posts).toEqual([{ text: GROUNDING_EXAMPLE.text }]);
  const items = s.getByRole("list", { name: "문장별 근거", exact: true }).getByRole("listitem");
  await expect(items).toHaveCount(6);
  await expect(items.nth(3)).toContainText("지우거나, 사실이면 근거를 더해 주세요");
  await expect(items.nth(3)).toContainText("AI 해석 — 문장의 숫자(80)");
  await expect(items.nth(3).locator("p").first().locator("span")).toHaveClass(/bg-review-soft/);
  await expect(items.nth(4)).toContainText("생각");
  await expect(items.nth(4).locator("p").first().locator("span")).not.toHaveClass(/bg-/);
  await expect(items.last()).toContainText("연결된 근거가 지금은 없어요");
  await items.first().getByText("원문 · 연결된 발췌", { exact: true }).click();
  await expect(items.first().getByRole("blockquote")).toHaveText(GROUNDING_EXAMPLE.sentences[0].evidence[0].text);
  await expect(items.first().getByRole("link")).toHaveAttribute("href", "/experience?activity=7&fromQuestion=41");
  await items.nth(1).getByText("내가 입력 · 보완", { exact: true }).click();
  await items.nth(2).getByText("내가 입력 · 직접 넣거나 고친 경험", { exact: true }).click();
  await expect(items.nth(2).getByRole("blockquote")).toContainText("직접 문서를 정리했다");
  await s.scrollIntoViewIfNeeded();
  await s.screenshot({ path: `docs/fe-85/grounding-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await input.fill("내가 고친 글");
  await expect(summary(page, "고치기 전 근거 점검 — 다시 점검해 주세요")).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(1).click();
  await expect(input).toHaveValue("");
  await tabs.first().click();
  // 고친 글은 자동 저장돼 문항을 오가도 남는다(S-72) — 점검한 글로 되돌려 저장한 뒤 새로고침해 점검을 잇는다
  await expect(input).toHaveValue("내가 고친 글");
  await input.fill(GROUNDING_EXAMPLE.text);
  await expect(s.getByText("저장됨", { exact: true })).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue(GROUNDING_EXAMPLE.text);
  await expect(summary(page)).toBeVisible();
  await openList(page);
  await expect(screen(page).getByRole("list", { name: "문장별 근거", exact: true })).toBeVisible();
  await screen(page).getByRole("listitem").first().getByText("원문 · 연결된 발췌", { exact: true }).click();
  await screen(page).getByRole("listitem").first().getByRole("link").click();
  await expect(page).toHaveURL(/experience\?activity=7&fromQuestion=41/);
  await expect(page.getByRole("heading", { name: /바꿔요/ }).first()).toBeVisible();
});

test("HTTP failure and AI failure retry the exact submitted text after editing", async ({ page }) => {
  const { state } = await setup(page, structuredClone(GROUNDING_EXAMPLE));
  const s = screen(page), input = s.getByRole("textbox");
  await expect(input).toBeEnabled();
  const submitted = `${GROUNDING_EXAMPLE.text} 한 줄 더.`; // 같은 글은 다시 점검하지 못한다(FE#317) — 조금 고쳐 다시 점검한다
  await input.fill(submitted);
  state.postError = "DAILY_LIMIT_EXCEEDED";
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  await expect(s.getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(summary(page)).toBeVisible();
  await input.fill("다르게 고친 글");
  state.postError = ""; state.fail = true;
  await s.getByRole("button", { name: "같은 글로 다시 시도" }).click();
  await expect(s.getByRole("alert")).toContainText("AI 응답 시간이 초과됐어요");
  expect(state.posts[1].text).toBe(submitted);
  await input.fill("또 고친 글");
  state.fail = false;
  await s.getByRole("button", { name: "같은 글로 다시 시도" }).click();
  await expect(summary(page, "고치기 전 근거 점검 — 다시 점검해 주세요")).toBeVisible();
  expect(state.posts[2].text).toBe(submitted);
  await expect(input).toHaveValue("또 고친 글");
});

test("initial GET error and stopped polling recover with GET, without spending another analysis", async ({ page }) => {
  const { state } = await setup(page);
  const s = screen(page), input = s.getByRole("textbox");
  await expect(input).toBeEnabled();
  state.hold = true;
  await input.fill("점검 중인 글");
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  state.readError = true;
  await expect(s.getByRole("alert")).toContainText("자동 확인을 멈췄어요", { timeout: 12000 });
  const gets = state.gets;
  await page.clock.install();
  await page.clock.runFor(6000);
  expect(state.gets).toBe(gets);
  await page.clock.resume();
  state.readError = false; state.hold = false;
  await s.getByRole("button", { name: "점검 상태 다시 확인" }).click();
  await expect(summary(page)).toBeVisible();
  expect(state.posts).toHaveLength(1);
  state.readError = true;
  await page.reload();
  await expect(s.getByRole("alert")).toContainText("상태 연결 실패");
  await expect(input).toBeDisabled();
  state.readError = false;
  await s.getByRole("button", { name: "점검 상태 다시 확인" }).click();
  await expect(input).toHaveValue("점검 중인 글");
});

test("409 reads the in-progress check and never reposts automatically; refresh continues polling", async ({ page }) => {
  const { state } = await setup(page);
  const s = screen(page), input = s.getByRole("textbox");
  await expect(input).toBeEnabled();
  state.hold = true; state.postError = "GROUNDING_CHECK_IN_PROGRESS";
  state.saved = { ...structuredClone(GROUNDING_EXAMPLE), status: "ANALYZING", sentences: [] };
  await input.fill("다른 탭의 글과 다른 글");
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  await expect(s.getByRole("button", { name: "근거 점검 중…" })).toBeDisabled();
  await page.reload();
  await expect(input).toHaveValue(GROUNDING_EXAMPLE.text);
  state.hold = false;
  await expect(summary(page)).toBeVisible();
  expect(state.posts).toHaveLength(1);
});

test("settled checks are not read again on tab return; analyzing checks are, and their result shows", async ({ page }) => {
  const { state } = await setup(page, structuredClone(GROUNDING_EXAMPLE));
  const s = screen(page), input = s.getByRole("textbox");
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(input).toBeEnabled();
  const gets = state.gets;
  await tabs.nth(1).click();
  await expect(input).toHaveValue("");
  await tabs.first().click();
  await expect(input).toBeEnabled();
  await expect(summary(page)).toBeVisible();
  expect(state.gets).toBe(gets);

  // 점검 중에 떠났다 돌아오면 GET 으로 이어 가고, 끝난 결과는 다시 받지 않는다
  state.hold = true;
  await input.fill("떠났다 돌아올 글");
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  await expect(s.getByRole("button", { name: "근거 점검 중…" })).toBeDisabled();
  await tabs.nth(1).click();
  await expect(input).toHaveValue("");
  state.hold = false;
  await tabs.first().click();
  await expect(input).toHaveValue("떠났다 돌아올 글");
  await expect(summary(page)).toBeVisible();
  expect(state.posts).toHaveLength(1);
  const settled = state.gets;
  await tabs.nth(1).click();
  await expect(input).toHaveValue("");
  await tabs.first().click();
  await expect(input).toHaveValue("떠났다 돌아올 글");
  expect(state.gets).toBe(settled);
});

test("failed recommendation does not block answer checks, and late POST cannot overwrite another question", async ({ page }) => {
  const { state, api } = await setup(page);
  api.edit(41, q => { q.status = "FAILED"; q.error = { code: "AI_FAILED", message: "추천 실패" }; q.recommendations = []; });
  await page.reload();
  const s = screen(page);
  await expect(s.getByRole("textbox")).toBeEnabled();
  await s.getByRole("textbox").fill("내가 쓴 글");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/questions/41/grounding-check", async route => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  await s.getByRole("button", { name: "근거 점검", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(1).click();
  release();
  await expect.poll(() => state.posts.length).toBe(1);
  await expect(s.getByRole("textbox")).toHaveValue("");
  await expect(s.getByRole("button", { name: "근거 점검", exact: true })).toBeDisabled();
  await tabs.first().click();
  await expect(s.getByRole("textbox")).toHaveValue("내가 쓴 글");
});
