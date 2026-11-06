// 「예전에 쓴 답」(S-43) — 가짜 BE 를 상대로 화면이 계약대로 부르고 그리는지 본다. 고르는 순서는 BE 일이라 응답 순서 그대로 나오는지만 본다.
import type { Page } from "@playwright/test";
import { pickOption } from "./pick-option";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import type { QuestionDetail, SimilarAnswer } from "../src/lib/api/question-types";

const LONG = "「바꿔요」에서 저는 채팅 기능을 맡았습니다. ".repeat(20).trim();
const ANSWERS: SimilarAnswer[] = [
  { questionId: 45, questionText: "개발 중 겪은 어려움과 해결 과정을 적어 주세요.", questionType: "PROBLEM_SOLVING", applicationId: 24, organization: "OO 소프트웨어 교육 과정", organizationType: "BOOTCAMP", jobRole: "BACKEND", text: LONG, confirmedAt: "2026-10-20T21:00:00+09:00" },
  { questionId: 47, questionText: "기술 문제를 해결한 경험을 적어 주세요.", questionType: "PROBLEM_SOLVING", applicationId: 25, organization: null, organizationType: null, jobRole: null, text: "짧은 답입니다.", confirmedAt: "2026-10-28T20:00:00+09:00" },
];
const similar = (page: Page) => page.getByRole("region", { name: "예전에 쓴 답", exact: true });

async function setup(page: Page, answers: SimilarAnswer[] = ANSWERS) {
  const api = new FakeQuestionApi();
  api.similarAnswers = answers;
  await api.install(page);
  const reads = { count: 0 };
  page.on("request", r => { if (r.url().endsWith("/questions/41/similar-answers")) reads.count++; });
  return { api, reads };
}
const open = (page: Page) => page.goto("/questions?question=41");

test("지원처 · 문항 · 답을 응답 순서대로 보이고, 긴 글은 접어 두었다 펼친다", async ({ page }) => {
  await setup(page);
  await open(page);
  const cards = similar(page).getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("OO 소프트웨어 교육 과정");
  await expect(cards.first()).toContainText("개발 중 겪은 어려움");
  await expect(cards.nth(1)).toContainText("지원처 이름 없음");
  const full = cards.first().locator("p");
  await expect(full).toBeHidden();
  await cards.first().locator("summary").click();
  await expect(full).toBeVisible();
  await expect(full).toHaveText(LONG);
});

test("참고로만 보인다 — 근거 표시가 없고, 내가 쓴 답 칸에 들어가지 않는다", async ({ page }) => {
  const { api } = await setup(page);
  await open(page);
  await expect(similar(page).getByText("참고 — 근거 아님")).toBeVisible();
  await similar(page).locator("summary").first().click();
  await expect(similar(page).getByText("원문에서 확인")).toHaveCount(0);
  await expect(similar(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "내가 쓴 답" })).toHaveValue("");
  expect(api.calls.filter(c => !c.call.startsWith("GET "))).toEqual([]);
});

test("없으면 자리를 만들지 않는다", async ({ page }) => {
  const { reads } = await setup(page, []);
  await open(page);
  await expect(page.getByRole("heading", { name: "내가 쓴 답" })).toBeVisible();
  await expect.poll(() => reads.count).toBeGreaterThan(0);
  await page.waitForTimeout(300); // 응답이 화면에 닿을 시간을 준 뒤 없음을 본다
  await expect(page.getByText("예전에 쓴 답")).toHaveCount(0);
});

test("불러오기가 실패하면 오류 · 다시 시도를 보인다", async ({ page }) => {
  const { api } = await setup(page);
  api.similarDown = true;
  await open(page);
  const alert = page.getByRole("alert").filter({ hasText: "예전에 쓴 답을 불러오지 못했어요" });
  await expect(alert).toBeVisible();
  await expect(similar(page)).toHaveCount(0);
  api.similarDown = false;
  await alert.getByRole("button", { name: "다시 시도" }).click();
  await expect(similar(page).getByRole("listitem")).toHaveCount(2);
  await expect(alert).toHaveCount(0);
});

test("유형 · 직무 · 종류를 고치거나 답을 확정하면 다시 부른다", async ({ page }) => {
  const { reads } = await setup(page);
  await page.route("**/api/questions/41/answer", route => route.fulfill({ json: { answer: { questionId: 41, text: "내 답", confirmedAt: "2026-11-06T09:00:00+09:00", newFacts: null } } }));
  await page.route("**/api/questions/41/answer/new-facts", route => route.fulfill({ json: { answer: { questionId: 41, text: "내 답", confirmedAt: "2026-11-06T09:00:00+09:00", newFacts: null } } }));
  await open(page);
  await expect(similar(page)).toBeVisible();
  const opened = reads.count; // 개발 모드의 StrictMode 는 처음에 두 번 부른다 — 바뀐 뒤 늘어난 횟수만 본다

  await pickOption(page.getByRole("combobox", { name: "문항 유형" }), "협업 · 소통 · 팀워크");
  await expect.poll(() => reads.count).toBe(opened + 1);
  await pickOption(page.getByRole("combobox", { name: "직무" }), "프론트엔드 · 웹");
  await expect.poll(() => reads.count).toBe(opened + 2);
  await pickOption(page.getByRole("combobox", { name: "지원처 종류" }), "인턴");
  await expect.poll(() => reads.count).toBe(opened + 3);

  await page.getByRole("textbox", { name: "내가 쓴 답" }).fill("내 답");
  await page.getByRole("button", { name: "확정", exact: true }).click();
  await expect.poll(() => reads.count).toBe(opened + 4);
});

test("추천이 끝나 유형이 붙으면 다시 부른다 — 분석 중에도 보인다", async ({ page }) => {
  const { reads } = await setup(page);
  const analyzing: QuestionDetail = { ...structuredClone(QUESTION_EXAMPLES[0]), status: "ANALYZING", questionType: null, questionTypeBy: null, requirements: [], recommendations: [], clarifications: [] };
  let done = false;
  await page.route("**/api/questions/41", route => route.request().method() === "GET" ? route.fulfill({ json: done ? QUESTION_EXAMPLES[0] : analyzing }) : route.fallback());
  await open(page);
  await expect(similar(page)).toBeVisible();
  const opened = reads.count;
  done = true;
  await expect(page.getByRole("heading", { name: "참고 — 꺼내 쓸 경험" })).toBeVisible();
  await expect.poll(() => reads.count).toBe(opened + 1);
});
