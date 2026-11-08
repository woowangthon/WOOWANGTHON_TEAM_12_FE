// 시험 전용 HTTP 응답 — 초안을 답칸 안에서 표시로 확인한다(FE#235 · S-79). 실제 BE 영속성 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { DRAFT_S79 } from "./fixtures/draft-s79";

const SHOTS = process.env.FE235_SHOTS === "1";
// PR 스크린샷(FE235_SHOTS=1) — desktop 은 1440 과 1024 를 함께, mobile 은 390
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const size = page.viewportSize()!;
  const options = { animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" } as const;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/fe235/${name}-${size.width}.png`, ...options });
  if (size.width !== 1440) return;
  await page.setViewportSize({ width: 1024, height: size.height });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/fe235/${name}-1024.png`, ...options });
  await page.setViewportSize(size);
};

async function open(page: Page) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); q.targetLength = 500; });
  await api.install(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/)).toBeVisible();
  return api;
}

test("초안이 답칸에 표시와 함께 들어오고, 표시를 누르면 카드가 열린다", async ({ page }) => {
  await open(page);
  await expect(page.getByText("확인할 곳 4군데")).toBeVisible();
  await page.getByText("확인할 곳 4군데").scrollIntoViewIfNeeded();
  await shot(page, "view");
  await page.getByRole("button", { name: /^AI 보탬 — 확인 필요 — 메시지가 늦게/ }).first().click();
  await expect(page.getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요").filter({ visible: true })).toBeVisible();
  await shot(page, "card-elaborated");
});

test("빈칸 카드와 주체 확인 카드", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답하기" }).click();
  await expect(page.getByRole("group", { name: "빈칸 카드" }).filter({ visible: true }).getByText("WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?")).toBeVisible();
  await shot(page, "card-blank");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^AI 보탬 — 확인 필요 — 제가 배포 전/ }).first().click();
  await expect(page.getByText("누가 했는지 확인 안 됨", { exact: false }).filter({ visible: true })).toBeVisible();
  await shot(page, "card-actor");
});

test("고치기 — 빈칸이 남았으면 먼저 묻고, 일반 입력칸 아래에 빠진 사실 질문이 남는다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인할 곳 4군데가 남았어요" });
  await expect(dialog).toBeVisible();
  await shot(page, "edit-ask");
  await dialog.getByRole("button", { name: "직접 고치기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(/\[줄어든 정도\]/);
  await expect(page.getByRole("region", { name: "초안의 빠진 사실" })).toBeVisible();
  await page.getByRole("region", { name: "초안의 빠진 사실" }).scrollIntoViewIfNeeded();
  await shot(page, "edit-mode");
});

test("초안 설정 — 보조 재료 체크와 다시 만들기 전 경고", async ({ page }) => {
  await open(page);
  const ask = page.getByRole("button", { name: "초안 설정 열기" });
  await ask.click();
  const composer = page.getByRole("region", { name: "초안 설정", exact: true });
  await expect(composer.getByRole("checkbox", { name: /같은 활동의 다른 경험도 뒷받침 재료로 쓰기/ })).toBeChecked();
  await composer.scrollIntoViewIfNeeded();
  await shot(page, "composer");
  await composer.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "다시 만들면 답칸이 새 초안으로 바뀌어요" })).toBeVisible();
  await shot(page, "regenerate-warning");
});
