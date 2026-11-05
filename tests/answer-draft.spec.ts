// MOCK(question-draft): 계약 예시와 명시적 경계 상태만 쓰는 초안 화면 시험.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import type { Draft, QuestionDetail } from "../src/lib/api/question-types";

const draftScreen = (page: Page) => page.getByRole("region", { name: "답변 초안", exact: true });
const exampleDraft = (patch: Partial<Draft> = {}): Draft => ({
  questionId: 41, status: "COMPLETED", error: null, experienceIds: [101],
  sentences: [{ text: QUESTION_EXAMPLES[0].recommendations[0].experience.citations[0].quote, evidence: [] }],
  omitted: ["바꾼 뒤 메시지가 제때 오는지 확인한 방법"], createdAt: "2026-11-04T10:10:00+09:00", updatedAt: "2026-11-04T10:10:21+09:00", ...patch,
});
async function setup(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  if (edit) api.edit(41, edit);
  await api.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/questions?question=41");
  await expect(draftScreen(page)).toBeVisible();
  return api;
}
async function generate(page: Page) {
  await draftScreen(page).getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect(draftScreen(page).getByRole("status")).toContainText("만드는 중");
  await expect(draftScreen(page).getByRole("button", { name: "초안 만드는 중…" })).toBeDisabled();
  await expect(draftScreen(page).getByRole("list", { name: "초안 문장" })).toBeVisible();
}

test("default selection, zero-selection guard, generating, evidence details and text-only copy", async ({ page }, info) => {
  const api = await setup(page);
  const screen = draftScreen(page);
  await expect(screen.getByText("초안 목 모드", { exact: true })).toBeVisible();
  await expect(screen.getByRole("checkbox")).toBeChecked();
  await screen.getByRole("checkbox").uncheck();
  await expect(screen.getByRole("button", { name: "초안 만들기", exact: true })).toBeDisabled();
  await screen.getByRole("checkbox").check();
  await generate(page);
  const sentences = screen.getByRole("list", { name: "초안 문장" });
  await expect(sentences.getByRole("listitem")).toHaveCount(2);
  await sentences.locator("summary").nth(0).click();
  await expect(sentences.locator("blockquote").nth(0)).toHaveText(QUESTION_EXAMPLES[0].recommendations[0].experience.citations[0].quote);
  await sentences.locator("summary").nth(1).click();
  await expect(sentences.locator("blockquote").nth(1)).toHaveText(QUESTION_EXAMPLES[0].recommendations[0].experience.supplements[0].answer);
  await expect(sentences).toContainText("내가 입력 · 폴링을");
  await expect(screen.getByText("자료에 없어 쓰지 않았어요", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "텍스트로 복사", exact: true }).click();
  await expect(screen.getByRole("status").last()).toContainText("문장만 복사했어요");
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe("「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다. 서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.");
  expect(api.calls.some(c => c.call.endsWith("/draft"))).toBe(false);
  // 화면과 기존 추천은 함께 남는다. 문항을 오가도 최신 초안 하나만 유지한다.
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(1).click();
  await expect(draftScreen(page).getByRole("checkbox")).toHaveCount(2);
  await expect(draftScreen(page).getByRole("list", { name: "초안 문장" })).toHaveCount(0);
  await tabs.first().click();
  await expect(screen.getByRole("list", { name: "초안 문장" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "추천 경험 1", exact: true })).toContainText("WebSocket");
  if (process.env.UPDATE_DRAFT_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await screen.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/fe-74/draft-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("three selected by default, a fourth cannot be selected, and only recommendations are offered", async ({ page }) => {
  await setup(page, q => {
    q.recommendations.push(structuredClone(QUESTION_EXAMPLES[1].recommendations[0]));
    // 계약 experience-api의 103·104. 선택 경계만 확인하므로 근거는 비운다.
    for (const [id, content] of [[103, "서비스를 AWS 에 배포했다"], [104, "백엔드 API 설계를 맡았다"]] as const) {
      q.recommendations.push({ ...structuredClone(q.recommendations[0]), experience: { ...structuredClone(q.recommendations[0].experience), id, content, actor: id === 103 ? "TEAM" : "ME", citations: [], supplements: [] }, evidence: [] });
    }
  });
  const choices = draftScreen(page).getByRole("checkbox");
  await expect(choices).toHaveCount(4);
  for (let i = 0; i < 3; i++) await expect(choices.nth(i)).toBeChecked();
  await expect(choices.nth(3)).toBeDisabled();
  await choices.first().uncheck();
  await choices.nth(3).check();
  await expect(choices.first()).toBeDisabled();
  await expect(draftScreen(page).getByRole("button", { name: "초안 만들기", exact: true })).toBeEnabled();
});

test("failure shows its reason without success text; retry uses the same POST flow", async ({ page }) => {
  await setup(page);
  const screen = draftScreen(page);
  await screen.getByLabel("초안 목 결과").selectOption("failure");
  await screen.getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect(screen.getByRole("alert")).toContainText("시간이 초과됐어요");
  await expect(screen.getByRole("list", { name: "초안 문장" })).toHaveCount(0);
  await screen.getByLabel("초안 목 결과").selectOption("success");
  await screen.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await expect(screen.getByRole("list", { name: "초안 문장" }).getByRole("listitem")).toHaveCount(2);
  await expect(screen.getByRole("alert")).toHaveCount(0);
});

test("missing evidence preserves the sentence and shows a careful notice", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft(); });
  await expect(draftScreen(page)).toContainText("연결된 근거가");
  await expect(draftScreen(page).getByRole("button", { name: "텍스트로 복사", exact: true })).toBeEnabled();
});

test("zero sentences with omitted only disables copying", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft({ sentences: [] }); });
  await expect(draftScreen(page)).toContainText("문장을 쓰지 않았어요");
  await expect(draftScreen(page)).toContainText("자료에 없어 쓰지 않았어요");
  await expect(draftScreen(page).getByRole("button", { name: "텍스트로 복사", exact: true })).toBeDisabled();
});

test("EXPERIENCE is labeled as user input and its original content is inspectable", async ({ page }) => {
  await setup(page, q => {
    // experience-api PATCH 예시 104의 직접 고친 본문. 새 경험 ID를 만들지 않는다.
    const text = "백엔드 API 중 채팅 · 거래 API 를 설계했다";
    q.draft = exampleDraft({ sentences: [{ text, evidence: [{ type: "EXPERIENCE", id: 104, experienceId: 104, activityId: 7, text }] }] });
  });
  const screen = draftScreen(page);
  await screen.locator("summary").click();
  await expect(screen.locator("summary")).toHaveText("내가 입력 · 직접 넣거나 고친 경험");
  await expect(screen.locator("blockquote")).toHaveText("백엔드 API 중 채팅 · 거래 API 를 설계했다");
});

test("clipboard rejection is visible and can be retried", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft(); });
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }); });
  await draftScreen(page).getByRole("button", { name: "텍스트로 복사", exact: true }).click();
  await expect(draftScreen(page).getByRole("status").last()).toContainText("복사하지 못했어요");
  await expect(draftScreen(page).getByRole("button", { name: "텍스트로 복사", exact: true })).toBeEnabled();
});

test("no recommended experiences cannot generate a draft", async ({ page }) => {
  await setup(page, q => { q.recommendations = []; q.clarifications = []; });
  await expect(draftScreen(page).getByRole("checkbox")).toHaveCount(0);
  await expect(draftScreen(page).getByRole("button", { name: "초안 만들기", exact: true })).toBeDisabled();
});
