// FE#411 · FE#511 · S-89 — 지원 · 문항 지우기(휴지통) 확인 창, 문항 글 그 자리 고치기. 가짜 BE(fake-question-api.ts)가 question-api.md 「지원 지우기」 · 「문항 지우기」 · 「문항 고치기」대로 답한다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";

const shots = process.env.UPDATE_SHELL_SCREENSHOTS === "1";
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `docs/fe-511/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, nextjs-portal * { pointer-events: none !important; }";
      document.head.appendChild(style);
    }, { once: true });
  });
});

const panel = (page: Page) => page.getByRole("tabpanel", { name: "선택한 문항", exact: true });
/** 문항 글 고치기 입구 — PC 는 글을 누르고, 좁은 화면은 누르기가 스크롤과 겹쳐 옆 연필로(FE#511) */
const startEdit = async (page: Page, index: number, desktop: boolean) => {
  await (desktop ? panel(page).getByRole("heading", { level: 3 }).getByRole("button")
    : panel(page).getByRole("button", { name: `문항 ${index} 글 고치기`, exact: true })).click();
  return panel(page).getByRole("textbox", { name: `문항 ${index} 글`, exact: true });
};
const analyzing = (page: Page) => panel(page).getByText("문항에 맞는 경험을 찾고 있어요");
const textPatches = (api: FakeQuestionApi) => api.calls.filter(c => c.call === "PATCH /api/questions/41" && (c.body as { text?: string } | undefined)?.text !== undefined);

test("문항 글을 그 자리에서 고친다 — 지울 게 없으면 바로 저장 · 같거나 빈 글은 요청 없이 · 409 · 429 는 글을 둔 채 이유", async ({ page }, info) => {
  const desktop = info.project.name === "desktop";
  const api = await new FakeQuestionApi({ sameApplication: true }).install(page);
  await page.goto("/questions?question=41");
  await expect(panel(page).getByRole("button", { name: "문항 1 지우기", exact: true })).toBeVisible();
  // 「문항 N · 상태」는 탭이 보여 준다 — 머리엔 유형 칩 줄 · 휴지통 · 문항 글만(ETC#346)
  await expect(panel(page).getByText("문항 1 · 완료")).toHaveCount(0);
  if (desktop) for (const [width, height] of [[1440, 1000], [1024, 1000]] as const) { await page.setViewportSize({ width, height }); await shot(page, `head-${width}`); }
  else await shot(page, "head-390");
  if (desktop) await page.setViewportSize({ width: 1440, height: 1000 });

  // 같은 글 · 빈 글은 요청하지 않고 원래 글로
  let box = await startEdit(page, 1, desktop);
  await box.blur();
  await expect(box).toBeHidden();
  box = await startEdit(page, 1, desktop);
  await box.fill("   ");
  await box.blur();
  await expect(box).toBeHidden();
  // Esc 는 취소
  box = await startEdit(page, 1, desktop);
  await box.fill("취소할 글");
  await box.press("Escape");
  await expect(box).toBeHidden();
  expect(textPatches(api)).toHaveLength(0);

  // 초안 · 근거 점검 · 다 쓴 답이 없다 — 확인 없이 바로 저장, 추천이 다시 돈다
  box = await startEdit(page, 1, desktop);
  await box.fill("기술적인 문제를 해결한 경험을 한 가지 골라 과정과 결과를 적어 주세요.");
  if (desktop) await shot(page, "edit-1440"); else await shot(page, "edit-390");
  await box.press("Enter");
  await expect(box).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(textPatches(api).at(-1)?.body).toEqual({ text: "기술적인 문제를 해결한 경험을 한 가지 골라 과정과 결과를 적어 주세요." });
  await expect(panel(page).getByRole("heading", { level: 3, name: "기술적인 문제를 해결한 경험을 한 가지 골라 과정과 결과를 적어 주세요." })).toBeVisible();
  await expect(analyzing(page)).toBeVisible();

  // 분석 중에 또 고치면 409 — 칸은 열린 채 글 그대로, 이유와 「다시 시도」
  box = await startEdit(page, 1, desktop);
  await box.fill("한 번 더 고친 글");
  await box.blur();
  await expect(panel(page).getByRole("alert")).toContainText("아직 돌고 있어요");
  await expect(box).toHaveValue("한 번 더 고친 글");
  await expect(panel(page).getByRole("button", { name: "다시 시도" })).toBeVisible();
  await box.press("Escape");

  // 오늘 분석 횟수를 다 썼으면 429 — 글도 바뀌지 않는다
  await expect(analyzing(page)).toBeHidden({ timeout: 10000 });
  api.textLimit = true;
  box = await startEdit(page, 1, desktop);
  await box.fill("또 다른 글");
  await box.press("Enter");
  await expect(panel(page).getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(box).toHaveValue("또 다른 글");
});

test("다 쓴 답이 있으면 저장 직전에 확인 — 취소하면 쓴 글이 칸에 남고, 저장하면 다시 추천", async ({ page }, info) => {
  const desktop = info.project.name === "desktop";
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, d => { d.answer = { questionId: 41, text: "다 쓴 답", confirmedAt: new Date().toISOString(), newFacts: null }; });
  await api.install(page);
  await page.goto("/questions?question=41");
  const box = await startEdit(page, 1, desktop);
  await box.fill("고친 문항 글");
  await box.blur();
  const dialog = page.getByRole("dialog", { name: "문항 1 글을 바꿀까요?" });
  await expect(dialog.getByText("추천을 다시 받아요(분석 1회). 초안 · 근거 점검은 지워지고, 쓴 답은 남아요.")).toBeVisible();
  if (desktop) for (const [width, height] of [[1440, 1000], [1024, 1000]] as const) { await page.setViewportSize({ width, height }); await shot(page, `confirm-${width}`); }
  else await shot(page, "confirm-390");
  if (desktop) await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(box).toHaveValue("고친 문항 글");
  expect(textPatches(api)).toHaveLength(0);

  await box.blur();
  await dialog.getByRole("button", { name: "저장하고 다시 추천받기" }).click();
  await expect(dialog).toBeHidden();
  expect(textPatches(api).at(-1)?.body).toEqual({ text: "고친 문항 글" });
  await expect(analyzing(page)).toBeVisible();
});

test("문항 지우기 → 마지막 문항은 지원째 지우기로 · 지원을 지우면 목록으로", async ({ page }, info) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(42, d => { d.answer = { questionId: 42, text: "다 쓴 답", confirmedAt: new Date().toISOString(), newFacts: null }; });
  await api.install(page);
  await page.goto("/questions?question=42");
  await panel(page).getByRole("button", { name: "문항 2 지우기", exact: true }).click();
  const confirmQuestion = page.getByRole("dialog", { name: "이 문항을 지울까요?" });
  await expect(confirmQuestion.getByText("다 쓴 답도 같이 지워져요.")).toBeVisible();
  await expect(confirmQuestion.getByText("되묻기에 답해 쌓은 보완과 이미 만든 경험은 남아요.")).toBeVisible();
  if (info.project.name === "desktop") await shot(page, "delete-question-1440"); else await shot(page, "delete-question-390");
  await confirmQuestion.getByRole("button", { name: "지우기" }).click();
  await expect(confirmQuestion).toBeHidden();
  expect(api.calls.map(c => c.call)).toContain("DELETE /api/questions/42");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page).toHaveURL(/question=41/);

  // 남은 하나는 문항만 지울 수 없다 — 휴지통이 지원 지우기로 데려간다
  await expect(panel(page).getByRole("button", { name: "문항 1 지우기", exact: true })).toHaveCount(0);
  await panel(page).getByRole("button", { name: /^지원째 지우기/ }).click();
  const confirmApplication = page.getByRole("dialog", { name: "지원을 지울까요?" });
  await expect(confirmApplication.getByText("문항 1개와 다 쓴 답도 같이 지워져요.")).toBeVisible();
  await confirmApplication.getByRole("button", { name: "지우기" }).click();
  await expect(confirmApplication).toBeHidden();
  expect(api.calls.map(c => c.call)).toContain("DELETE /api/applications/22");
  // 남은 지원이 없다 — 새 지원 입력이 보이고, 주소는 지운 문항을 가리키지 않는다
  await expect(page.getByRole("region", { name: "새 지원 입력" })).toBeVisible();
  await expect(page).not.toHaveURL(/question=/);
  await page.reload();
  await expect(page.getByRole("region", { name: "새 지원 입력" })).toBeVisible();
});

test("지원 화면 머리의 휴지통으로 지우면 남은 지원을 연다 · 실패하면 창에 이유와 다시 시도", async ({ page }) => {
  const api = await new FakeQuestionApi().install(page);
  await page.goto("/questions?question=42");
  await page.getByRole("button", { name: "지원 지우기: OO 연합 동아리" }).click();
  const dialog = page.getByRole("dialog", { name: "지원을 지울까요?" });
  await expect(dialog.getByText("문항 1개와 다 쓴 답도 같이 지워져요.")).toBeVisible();

  await page.route("**/api/applications/22", route => route.request().method() === "DELETE"
    ? route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요." } } }) : route.fallback(), { times: 1 });
  await dialog.getByRole("button", { name: "지우기" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog).toBeHidden();
  expect(api.calls.map(c => c.call)).toContain("DELETE /api/applications/22");
  await expect(page.getByRole("status").filter({ hasText: "지원을 지웠어요." })).toBeVisible();
  await expect(page).toHaveURL(/question=41/);
});

test("내 지원서 줄의 휴지통으로 지원을 지운다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await new FakeQuestionApi().install(page);
  await page.goto("/applications");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /OO 백엔드 부트캠프/ })).toBeVisible();
  await main.getByRole("button", { name: "지원 지우기: OO 백엔드 부트캠프" }).click();
  const dialog = page.getByRole("dialog", { name: "지원을 지울까요?" });
  await expect(dialog.getByText("문항 1개와 다 쓴 답도 같이 지워져요.")).toBeVisible();
  await dialog.getByRole("button", { name: "지우기" }).click();
  await expect(dialog).toBeHidden();
  expect(api.calls.map(c => c.call)).toContain("DELETE /api/applications/21");
  await expect(main.getByRole("link", { name: /OO 백엔드 부트캠프/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /OO 연합 동아리/ })).toBeVisible();
});
