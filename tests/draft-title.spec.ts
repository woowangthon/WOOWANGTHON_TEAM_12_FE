// 시험 전용 HTTP 응답 — 초안 첫 줄 소제목(S-86 · FE#361)과 문항 유형 「직무 역량」(S-85). 실제 BE · AI 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import { QUESTION_TYPE_LABEL, type QuestionDetail } from "../src/lib/api/question-types";

const TITLE = "폴링을 구독으로 바꿔 푼 채팅 지연";
const BODY = DRAFT_S79.sentences.map(s => s.text).join(" ");
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const titleCard = (page: Page) => page.getByRole("group", { name: "소제목 카드" }).filter({ visible: true });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);

async function open(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_S79), title: TITLE }; edit?.(q); });
  await api.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  await page.goto("/questions?question=41");
  await expect(answerBox(page)).toBeVisible();
  return api;
}

test("소제목이 답칸 첫 줄로 들어가 「AI 초안 · 소제목」으로 보이고, 복사하면 첫 줄이다", async ({ page }, info) => {
  await open(page);
  await expect(answerBox(page)).toHaveValue(`${TITLE}\n${BODY}`);
  // 확인할 곳으로 세지 않는다 — 소제목이 없을 때와 같은 수
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await clickMark(page, "t");
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "소제목 보기", exact: true }).click();
  await expect(titleCard(page)).toContainText("고치거나 지워도 돼요");
  if (page.viewportSize()!.width >= 1024) await expect(titleCard(page)).toContainText("AI 초안 · 소제목");
  else await expect(page.getByRole("dialog").getByRole("heading", { name: "AI 초안 · 소제목", exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/fe-361/title-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(titleCard(page)).toHaveCount(0);
  await page.getByRole("button", { name: "답 복사", exact: true }).click();
  // 시험 초안에 답 안 한 빈칸 · 확인 전 가정이 있어 한 번 묻는다 — 소제목과 상관없다
  await page.getByRole("button", { name: "그래도 복사", exact: true }).click();
  await expect.poll(() => copied(page)).toBe(`${TITLE}\n${BODY}`);
});

test("소제목을 고치면 「고친 소제목」과 원래 소제목이, 지우면 표시가 없다", async ({ page }) => {
  await open(page);
  await answerBox(page).fill(`폴링을 구독으로 바꿔 푼 채팅 문제\n${BODY}`);
  await clickMark(page, "t");
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "소제목 보기", exact: true }).click();
  await expect(titleCard(page)).toContainText(`원래 소제목 — ${TITLE}`);
  await page.keyboard.press("Escape");
  await answerBox(page).fill(BODY);
  await expect(page.locator('[data-mark="t"]')).toHaveCount(0);
});

test("소제목이 null 이면 답칸은 문장만이다", async ({ page }) => {
  await open(page, q => { q.draft!.title = null; });
  await expect(answerBox(page)).toHaveValue(BODY);
  await expect(page.locator('[data-mark="t"]')).toHaveCount(0);
});

test("문항 유형 고르기 목록에 「직무 역량 · 직무 준비」가 있다", async ({ page }) => {
  const api = await open(page);
  await page.getByLabel("문항 유형", { exact: true }).click();
  await page.getByRole("option", { name: QUESTION_TYPE_LABEL.JOB_SKILL, exact: true }).click();
  await expect.poll(() => api.calls.find(c => c.call === "PATCH /api/questions/41")?.body).toMatchObject({ questionType: "JOB_SKILL" });
});
