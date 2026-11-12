// 시험 전용 HTTP 응답 — 초안을 답칸 안에서 표시로 확인한다(FE#235 · S-79). 실제 BE 영속성 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { openMark } from "./draft-marks";
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
  await openMark(page, "s-1");
  await expect(page.getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요").filter({ visible: true })).toBeVisible();
  await shot(page, "card-elaborated");
});

test("빈칸 카드와 주체 확인 카드", async ({ page }) => {
  await open(page);
  await openMark(page, "b-0");
  await expect(page.getByRole("group", { name: "빈칸 카드" }).filter({ visible: true }).getByText("WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?")).toBeVisible();
  await shot(page, "card-blank");
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); } // 좁은 폭은 시트가 뒤 화면을 덮는다
  await openMark(page, "s-3");
  await expect(page.getByText("이 근거 경험을 누가 했는지 확인해 주세요", { exact: false }).filter({ visible: true })).toBeVisible();
  await shot(page, "card-actor");
});

test("고치기 — 보기 · 고치기 상태 없이 초안 글이 바로 입력칸에 있고, 답칸 위에 질문 안내 줄은 없다", async ({ page }) => {
  await open(page);
  const box = page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toHaveValue(/\[줄어든 정도\]/);
  await expect(page.getByRole("button", { name: "직접 고치기" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("차곡이 초안 보기")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "초안의 빠진 사실" })).toHaveCount(0);
  // 빠진 사실 질문은 차곡이 버튼 배지 · 패널이 알린다 — 답칸 위에 따로 줄을 두지 않는다(FE#463)
  await expect(page.getByText("차곡이가 더 물어본 게")).toHaveCount(0);
  await shot(page, "edit-mode");
});

test("초안 설정 — 보조 재료 토글 없음 · 다시 만들기 전 경고", async ({ page }) => {
  await open(page);
  const ask = page.getByRole("button", { name: "초안 설정 열기" });
  await ask.click();
  // 다 된 초안이 있으면 설정은 패널 아래 「초안 다시 만들기」 칩으로 접혀 있다(FE#547)
  await page.getByRole("button", { name: /(초안|넣어) 다시 만들기$/ }).click();
  const composer = page.getByRole("region", { name: "초안 설정", exact: true });
  await expect(composer.getByRole("checkbox")).toHaveCount(0); // 같은 활동의 다른 경험은 늘 재료로(ADR-014)
  await composer.scrollIntoViewIfNeeded();
  await shot(page, "composer");
  await composer.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "다시 만들면 답칸이 새 초안으로 바뀌어요" })).toBeVisible();
  await shot(page, "regenerate-warning");
});
