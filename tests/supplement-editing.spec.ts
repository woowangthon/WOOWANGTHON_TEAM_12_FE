// 보완 고치기 · 지우기 (FE#33 · SPEC S-24 · experience-api.md 「PATCH · DELETE /api/supplements/{id}」)
// Test-only HTTP fixture; this is not a deployed backend or persistence verification.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Supplement } from "../src/lib/api/types";

const QUESTION = "폴링을 WebSocket 으로 바꿀 때 직접 고친 부분은 어디였나요?";
const ANSWER = "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다";
const OTHER_QUESTION = "고친 뒤 정상 동작을 어떻게 확인했나요?";

async function setup(page: Page) {
  const supplement = (id: number, question: string, answer: string): Supplement =>
    ({ id, question, answer, questionId: 41, createdAt: "2026-11-04T10:05:00+09:00", updatedAt: "2026-11-04T10:05:00+09:00" });
  const activity: ActivityDetail = {
    id: 7, name: "실시간 알림 프로젝트", period: { start: "2025-03", end: "2025-06", ongoing: false },
    experiences: [{
      id: 101, activityId: 7, content: "폴링으로 받던 알림을 WebSocket 으로 바꿨다", competencies: ["IMPLEMENTATION"], competenciesBy: "AI",
      actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
      citations: [{ id: 201, sourceId: 12, sourceName: "회고.md", quote: "알림을 WebSocket 으로 바꿈", matched: true, location: { startLine: 3, endLine: 3 } }],
      supplements: [supplement(301, QUESTION, ANSWER), supplement(302, OTHER_QUESTION, "두 기기에서 동시에 알림을 받아 봤다")],
    }],
  };
  const state = { activity, calls: [] as { method: string; path: string; body: unknown }[], fail: false };
  const supplements = () => activity.experiences[0].supplements!;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/questions") return route.fulfill({ json: { questions: [{ id: 41, organization: "우왕 부트캠프" }] } });
    const match = path.match(/^\/api\/supplements\/(\d+)$/);
    if (match) {
      state.calls.push({ method: req.method(), path, body: req.method() === "PATCH" ? req.postDataJSON() : null });
      if (state.fail) return route.fulfill({ status: 500, json: { error: { code: "INTERNAL", message: "서버 오류" } } });
      const id = Number(match[1]);
      if (req.method() === "DELETE") {
        activity.experiences[0].supplements = supplements().filter((s) => s.id !== id);
        return route.fulfill({ status: 204 });
      }
      const target = supplements().find((s) => s.id === id)!;
      Object.assign(target, req.postDataJSON(), { updatedAt: "2026-11-04T11:00:00+09:00" });
      return route.fulfill({ json: target });
    }
    return route.fulfill({ json: path === "/api/activities" ? { activities: [{ id: 7, name: activity.name, period: activity.period, experienceCount: 1 }] } : activity });
  });
  await open(page);
  return state;
}

async function open(page: Page) {
  await page.goto("/experience");
  await page.getByRole("button", { name: /실시간 알림 프로젝트/ }).click();
  await expect(page.getByText(ANSWER)).toBeVisible();
}

test("보완의 답을 바로 고치면 새로고침해도 남고, 경험 본문 · 출처 상태는 그대로다", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: `보완 고치기: ${QUESTION}` }).click();
  await page.getByLabel(`답: ${QUESTION}`).fill("STOMP 엔드포인트를 만들고 재연결도 붙였다");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("STOMP 엔드포인트를 만들고 재연결도 붙였다")).toBeVisible();
  await expect(page.getByLabel(`답: ${QUESTION}`)).toHaveCount(0);
  expect(state.calls).toEqual([{ method: "PATCH", path: "/api/supplements/301", body: { answer: "STOMP 엔드포인트를 만들고 재연결도 붙였다" } }]);
  await page.reload();
  await page.getByRole("button", { name: /실시간 알림 프로젝트/ }).click();
  await expect(page.getByText("STOMP 엔드포인트를 만들고 재연결도 붙였다")).toBeVisible();
  await expect(page.getByText("원문 확인")).toBeVisible();
});

test("고치기가 실패하면 원래 답을 두고 알린다", async ({ page }) => {
  const state = await setup(page);
  state.fail = true;
  await page.getByRole("button", { name: `보완 고치기: ${QUESTION}` }).click();
  await page.getByLabel(`답: ${QUESTION}`).fill("바뀐 답");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("원래 답을 그대로 뒀어요");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByText(ANSWER)).toBeVisible();
});

test("빈 답은 보내지 않는다", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: `보완 고치기: ${QUESTION}` }).click();
  await page.getByLabel(`답: ${QUESTION}`).fill("   ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("답을 입력해 주세요");
  expect(state.calls).toEqual([]);
});

test("보완을 지우면 새로고침해도 돌아오지 않는다", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: `보완 지우기: ${QUESTION}` }).click();
  await page.getByRole("group", { name: "보완 지우기 확인" }).getByRole("button", { name: "지우기" }).click();
  await expect(page.getByText(ANSWER)).toHaveCount(0);
  await expect(page.getByText(OTHER_QUESTION)).toBeVisible();
  expect(state.calls).toEqual([{ method: "DELETE", path: "/api/supplements/301", body: null }]);
  await page.reload();
  await page.getByRole("button", { name: /실시간 알림 프로젝트/ }).click();
  await expect(page.getByText(OTHER_QUESTION)).toBeVisible();
  await expect(page.getByText(ANSWER)).toHaveCount(0);
});

test("지우기를 취소하면 아무것도 보내지 않는다", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: `보완 지우기: ${QUESTION}` }).click();
  await page.getByRole("group", { name: "보완 지우기 확인" }).getByRole("button", { name: "취소" }).click();
  await expect(page.getByText(ANSWER)).toBeVisible();
  expect(state.calls).toEqual([]);
});

test("지우기가 실패하면 보완을 되돌리고 알린다", async ({ page }) => {
  const state = await setup(page);
  state.fail = true;
  await page.getByRole("button", { name: `보완 지우기: ${QUESTION}` }).click();
  await page.getByRole("group", { name: "보완 지우기 확인" }).getByRole("button", { name: "지우기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("지우지 못해 되돌렸어요");
  await expect(page.getByText(ANSWER)).toBeVisible();
});
