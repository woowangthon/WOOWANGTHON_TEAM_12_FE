// 시험 전용 HTTP 응답으로 S-48 흐름을 검증한다. 실제 BE/AI 판단 검증은 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Answer, NewFactCandidate, SaveNewFactRequest } from "../src/lib/api/question-types";
import type { Experience } from "../src/lib/api/types";

const TEXT = "두 기기로 메시지를 보내 확인했습니다. 알림 기능을 구독 방식으로 바꿨습니다.";
const candidates = (): NewFactCandidate[] => [
  { id: 801, sentence: "두 기기로 메시지를 보내 확인했습니다.", content: "두 기기로 메시지를 보내 확인했다", actor: "ME", activityId: 7, activityName: "바꿔요", status: "PENDING", experienceId: null },
  { id: 802, sentence: "알림 기능을 구독 방식으로 바꿨습니다.", content: "알림 기능을 구독 방식으로 바꿨다", actor: "UNKNOWN", activityId: null, activityName: null, status: "PENDING", experienceId: null },
];
const facts = (status: "ANALYZING" | "COMPLETED" | "FAILED", items = candidates()): NonNullable<Answer["newFacts"]> => ({ status, candidates: status === "COMPLETED" ? items : [], error: status === "FAILED" ? { code: "AI_TIMEOUT", message: "AI 응답 시간이 초과됐어요." } : null, createdAt: "2026-11-05T10:00:00Z", updatedAt: "2026-11-05T10:00:00Z" });
const answer = (newFacts: Answer["newFacts"] = null): Answer => ({ questionId: 41, text: TEXT, confirmedAt: "2026-11-05T10:00:00Z", newFacts });
const screen = (page: Page) => page.getByRole("region", { name: "내가 쓴 답", exact: true });
async function setup(page: Page, initial: Answer | null = null) {
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  const state = { saved: initial, putError: "", findError: "", decisionError: "", hold: false, fail: false, empty: false, readError: false, puts: [] as string[], finds: 0, reads: 0, decisions: [] as unknown[], experiences: [] as Experience[] };
  await page.route("**/api/questions/41", async route => {
    state.reads++;
    if (state.readError) return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "후보 상태 연결 실패" } } });
    if (state.saved?.newFacts?.status === "ANALYZING" && !state.hold) state.saved.newFacts = facts(state.fail ? "FAILED" : "COMPLETED", state.empty ? [] : candidates());
    return route.fulfill({ json: { ...api.questions[0].detail, answer: state.saved } });
  });
  await page.route("**/api/questions/41/answer", async route => {
    const { text } = route.request().postDataJSON() as { text: string }; state.puts.push(text);
    if (state.putError) return route.fulfill({ status: 503, json: { error: { code: state.putError, message: "답 저장 실패" } } });
    state.saved = { ...answer(), text }; return route.fulfill({ json: { answer: state.saved } });
  });
  await page.route("**/api/questions/41/answer/new-facts", async route => {
    state.finds++;
    if (state.findError) return route.fulfill({ status: state.findError === "DAILY_LIMIT_EXCEEDED" ? 429 : 409, json: { error: { code: state.findError, message: state.findError } } });
    state.saved!.newFacts = facts("ANALYZING");
    return route.fulfill({ status: 202, json: { answer: state.saved } });
  });
  await page.route("**/api/new-fact-candidates/*/*", async route => {
    const path = new URL(route.request().url()).pathname;
    const c = state.saved!.newFacts!.candidates.find(c => path.includes(String(c.id)))!;
    if (state.decisionError) return route.fulfill({ status: 409, json: { error: { code: state.decisionError, message: "다른 탭에서 정한 후보예요" } } });
    if (path.endsWith("dismiss")) { c.status = "DISMISSED"; state.decisions.push("dismiss"); return route.fulfill({ status: 204 }); }
    const data = route.request().postDataJSON() as SaveNewFactRequest; state.decisions.push(data);
    const experience: Experience = { id: 108, ...data, sourceStatus: "USER_ENTERED", competencies: [], competenciesBy: "USER", citations: [], supplements: [], origin: { type: "ANSWER", questionId: 41, applicationId: 22, organization: "OO 부트캠프", questionText: api.questions[0].detail.text } };
    c.status = "SAVED"; c.experienceId = 108; state.experiences.push(experience);
    return route.fulfill({ status: 201, json: experience });
  });
  await page.route("**/api/activities/7", async route => {
    const r = api.questions[0].detail.recommendations;
    return route.fulfill({ json: { id: 7, name: "바꿔요", period: r[0].activity.period, experiences: [...r.map(r => r.experience), ...state.experiences] } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/questions?question=41");
  await expect(screen(page).getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeEnabled();
  return { state, api };
}

test("confirms before finding; edits, saves and dismisses; restores and opens actual saved experience", async ({ page }, info) => {
  const { state } = await setup(page);
  const s = screen(page), input = s.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(s.getByRole("button", { name: "확정", exact: true })).toBeDisabled();
  state.hold = true;
  await input.fill(TEXT); await s.getByRole("button", { name: "확정", exact: true }).click();
  await expect(s.getByText(/새 경험 후보를 찾고 있어요/)).toBeVisible();
  expect(state.puts).toEqual([TEXT]); expect(state.finds).toBe(1);
  await page.reload(); state.hold = false;
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(2);
  await expect(input).toHaveValue(TEXT);
  expect(state.decisions).toHaveLength(0);
  const cards = s.getByRole("region", { name: "새 경험 후보" }).getByRole("listitem");
  await expect(cards.first().getByRole("combobox", { name: "붙일 활동" })).toHaveValue("7");
  await expect(cards.nth(1).getByRole("button", { name: "경험으로 저장" })).toBeDisabled();
  await expect(cards.first().getByText("AI 제안", { exact: true })).toBeVisible();
  if (info.project.name === "grounding-rail") {
    const toggle = page.getByRole("button", { name: /^차곡이/ });
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
    await expect(page.getByRole("dialog", { name: "차곡이" })).toBeVisible();
    await page.screenshot({ path: "docs/fe-108/chagok-1024.png", fullPage: true });
    await page.getByRole("button", { name: "차곡이 닫기", exact: true }).click();
  }
  await s.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/fe-108/application-${info.project.name}.png`, fullPage: true });
  await s.screenshot({ path: `docs/fe-108/candidates-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await cards.first().getByRole("textbox", { name: "경험 문장" }).fill("두 기기로 메시지를 보내 팀과 함께 확인했다");
  await cards.first().getByRole("combobox", { name: "수행 주체" }).selectOption("TEAM");
  await cards.first().getByRole("button", { name: "경험으로 저장" }).click();
  await expect(cards.first().getByText("경험으로 저장했어요")).toBeVisible();
  expect(state.decisions[0]).toEqual({ activityId: 7, content: "두 기기로 메시지를 보내 팀과 함께 확인했다", actor: "TEAM" });
  await cards.nth(1).getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(cards.nth(1)).toContainText("저장하지 않았어요");
  await input.fill("수정한 답"); await expect(s.getByText(/확정한 글과 달라요/)).toBeVisible();
  await page.reload(); await expect(input).toHaveValue(TEXT);
  await s.getByRole("link", { name: "저장한 경험 보기" }).click();
  await expect(page).toHaveURL(/experience[?]experience=108&fromQuestion=41/);
  await expect(page.getByText("내가 쓴 지원서 · OO 부트캠프 ·", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: `docs/fe-108/origin-${info.project.name}.png`, fullPage: true });
});

test("PUT failure never starts analysis; 429 retains confirmed answer and retries only finding", async ({ page }) => {
  const { state } = await setup(page); const s = screen(page);
  state.putError = "INTERNAL_ERROR";
  await s.getByRole("textbox").fill(TEXT); await s.getByRole("button", { name: "확정", exact: true }).click();
  await expect(s.getByRole("alert")).toContainText("답 저장 실패"); expect(state.finds).toBe(0);
  await expect(s.getByText("답을 확정했어요", { exact: true })).toHaveCount(0);
  state.putError = ""; state.findError = "DAILY_LIMIT_EXCEEDED";
  await s.getByRole("button", { name: "같은 답으로 다시 확정" }).click();
  await expect(s.getByRole("alert")).toContainText("답은 확정됐어요 · 오늘 분석 횟수를 다 썼어요");
  await s.getByRole("textbox").fill("아직 확정하지 않은 수정");
  state.findError = ""; state.empty = true;
  await s.getByRole("button", { name: "다시 찾기", exact: true }).click();
  await expect(s.getByText("새로 쓴 사실이 없어요")).toBeVisible();
  expect(state.puts).toHaveLength(2); expect(state.finds).toBe(2);
  await expect(s.getByRole("textbox")).toHaveValue("아직 확정하지 않은 수정");
});

test("AI failure retries finding; decided conflicts refresh without another save or analysis", async ({ page }) => {
  const { state } = await setup(page, answer(facts("FAILED"))); const s = screen(page);
  await expect(s.getByRole("alert")).toContainText("AI 응답 시간이 초과됐어요");
  await s.getByRole("button", { name: "다시 찾기", exact: true }).click();
  const cards = s.getByRole("region", { name: "새 경험 후보" }).getByRole("listitem");
  await expect(cards).toHaveCount(2); expect(state.puts).toHaveLength(0);
  state.decisionError = "NEW_FACT_ALREADY_DECIDED"; state.saved!.newFacts!.candidates[0].status = "DISMISSED";
  await cards.first().getByRole("button", { name: "경험으로 저장" }).click();
  await expect(cards.first()).toContainText("저장하지 않았어요");
  expect(state.decisions).toHaveLength(0); expect(state.finds).toBe(1);
});

test("polling stops after repeated read failures and recovers with GET only", async ({ page }) => {
  const { state } = await setup(page, answer()); const s = screen(page);
  state.hold = true;
  await s.getByRole("button", { name: "새 경험 후보 찾기" }).click();
  await expect(s.getByText(/새 경험 후보를 찾고 있어요/)).toBeVisible(); state.readError = true;
  await expect(s.getByRole("alert")).toContainText("자동 확인을 멈췄어요", { timeout: 12000 });
  const reads = state.reads;
  await page.clock.install(); await page.clock.runFor(5000); expect(state.reads).toBe(reads); await page.clock.resume();
  state.readError = false; state.hold = false;
  await s.getByRole("button", { name: "확정 상태 다시 확인" }).click();
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(2);
  expect(state.puts).toHaveLength(0); expect(state.finds).toBe(1);
});

test("late confirmation never overwrites another question; re-confirmation clears undecided candidates", async ({ page }) => {
  const { state } = await setup(page, answer(facts("COMPLETED"))); const s = screen(page);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/questions/41/answer", async route => { await gate; await route.fallback(); });
  await s.getByRole("textbox", { name: "내가 쓴 답", exact: true }).fill("다시 확정할 답");
  await s.getByRole("button", { name: "확정", exact: true }).click();
  state.empty = true;
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab"); await tabs.nth(1).click(); release();
  await expect.poll(() => state.puts.length).toBe(1);
  await expect(s.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue("");
  await expect.poll(() => state.finds).toBe(1);
  await tabs.first().click();
  await expect(s.getByRole("textbox")).toHaveValue("다시 확정할 답");
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(0);
  await expect(s.getByText("새로 쓴 사실이 없어요")).toBeVisible();
});


test("saved candidate without a suggested activity still opens its actual experience", async ({ page }) => {
  const saved = candidates()[0]; saved.status = "SAVED"; saved.experienceId = 108; saved.activityId = null; saved.activityName = null;
  const { state, api } = await setup(page, answer(facts("COMPLETED", [saved])));
  state.experiences.push({ ...structuredClone(api.questions[0].detail.recommendations[0].experience), id: 108, origin: { type: "ANSWER", questionId: 41, applicationId: 22, organization: null, questionText: "확인한 방법" } });
  await screen(page).getByRole("link", { name: "저장한 경험 보기" }).click();
  await expect(page.getByText("내가 쓴 지원서 · 지원처 미입력 · 확인한 방법", { exact: true })).toBeVisible();
});

test("409 finds existing job without reposting; initial read failure recovers with GET", async ({ page }) => {
  const { state } = await setup(page, answer()); const s = screen(page);
  state.hold = true; state.findError = "NEW_FACTS_IN_PROGRESS"; state.saved!.newFacts = facts("ANALYZING");
  await s.getByRole("button", { name: "새 경험 후보 찾기" }).click();
  await expect(s.getByText(/새 경험 후보를 찾고 있어요/)).toBeVisible();
  state.hold = false;
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(2);
  expect(state.finds).toBe(1); expect(state.puts).toHaveLength(0);
  state.readError = true; await page.reload();
  // 답은 받아 둔 문항에서 읽으므로(FE#143) 첫 조회 실패는 화면의 「다시 불러오기」로 복구한다
  const panel = page.getByRole("tabpanel", { name: "선택한 문항", exact: true });
  await expect(panel.getByRole("alert")).toContainText("후보 상태 연결 실패");
  await expect(s.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveCount(0);
  state.readError = false;
  await panel.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(s.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(TEXT);
  expect(state.finds).toBe(1);
});

test("confirmed answer and its candidates survive leaving the tab without reading the question again", async ({ page }) => {
  const { state } = await setup(page); const s = screen(page);
  await s.getByRole("textbox", { name: "내가 쓴 답", exact: true }).fill(TEXT);
  await s.getByRole("button", { name: "확정", exact: true }).click();
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(2);
  const reads = state.reads;
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.first().click();
  await expect(s.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(TEXT);
  await expect(s.getByText("답을 확정했어요", { exact: true })).toBeVisible();
  await expect(s.getByRole("textbox", { name: "경험 문장" })).toHaveCount(2);
  expect(state.reads).toBe(reads);
});


test("null activity requires explicit selection; failed save preserves edits for retry", async ({ page }) => {
  const { state } = await setup(page, answer(facts("COMPLETED")));
  const card = screen(page).getByRole("region", { name: "새 경험 후보" }).getByRole("listitem").nth(1);
  const save = card.getByRole("button", { name: "경험으로 저장" });
  await expect(save).toBeDisabled();
  await card.getByRole("combobox", { name: "붙일 활동" }).selectOption("7");
  await card.getByRole("textbox", { name: "경험 문장" }).fill("직접 고친 경험");
  await card.getByRole("combobox", { name: "수행 주체" }).selectOption("TEAM");
  state.decisionError = "INTERNAL_ERROR";
  await save.click(); await expect(card.getByRole("alert")).toBeVisible();
  await expect(card.getByRole("textbox", { name: "경험 문장" })).toHaveValue("직접 고친 경험");
  expect(state.decisions).toHaveLength(0);
  state.decisionError = ""; await save.click();
  await expect(card.getByText("경험으로 저장했어요")).toBeVisible();
  expect(state.decisions).toEqual([{ activityId: 7, content: "직접 고친 경험", actor: "TEAM" }]);
});
