import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Period } from "../src/lib/api/types";

// HTTP fixtures only — 화면 동작을 본다. 실제 BE · DB 와의 통합 시험이 아니다. (FE#26 · SPEC S-17)
async function setup(page: Page) {
  const activities: ActivityDetail[] = [
    { id: 7, name: "Swap app", period: { start: "2025-03", end: "2025-06", ongoing: false }, experiences: [] },
    { id: 8, name: "Algo study", period: { start: "2024-09", end: null, ongoing: true }, experiences: [] },
    { id: 9, name: "Hackathon", period: { start: "2023-05", end: null, ongoing: false }, experiences: [] },
  ];
  const state = {
    activities, patches: [] as { id: number; body: { period: Period } }[], fail: 0, hold: false,
    replies: [] as { id: number; release: (status?: number) => void }[],
    active: new Map<number, number>(), maximum: new Map<number, number>(),
  };
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
    const m = path.match(/^\/api\/activities\/(\d+)$/);
    const a = m && state.activities.find((x) => x.id === Number(m[1]));
    if (req.method() === "PATCH" && a) {
      const body = req.postDataJSON();
      state.patches.push({ id: a.id, body });
      const active = (state.active.get(a.id) ?? 0) + 1;
      state.active.set(a.id, active);
      state.maximum.set(a.id, Math.max(active, state.maximum.get(a.id) ?? 0));
      const status = state.hold ? await new Promise<number>(resolve => {
        state.replies.push({ id: a.id, release: (status = 0) => resolve(status) });
      }) : state.fail;
      state.active.set(a.id, (state.active.get(a.id) ?? 1) - 1);
      if (status) return route.fulfill({ status, json: { error: { code: "INVALID_PERIOD", message: "Server rejected" } } });
      Object.assign(a, body);
      return route.fulfill({ json: { id: a.id, name: a.name, period: a.period, experienceCount: 0 } });
    }
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities.map(({ experiences, ...x }) => ({ ...x, experienceCount: experiences.length })) } });
    return a ? route.fulfill({ json: a }) : route.fulfill({ status: 404, json: { error: { code: "ACTIVITY_NOT_FOUND", message: "없음" } } });
  });
  await page.goto("/experience", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Swap app/ })).toBeVisible();
  return state;
}

/** 손잡이를 잡아 그해의 month(1–12)번째 칸 가운데로 끈다. release=false 면 놓지 않는다 */
async function drag(page: Page, testId: string, month: number, release = true) {
  const handle = page.getByTestId(testId);
  const row = page.locator("li", { has: handle });
  await row.hover();
  const band = (await handle.locator("..").boundingBox())!;
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(band.x + (band.width * (month - 0.5)) / 12, band.y + band.height / 2, { steps: 6 });
  if (release) await page.mouse.up();
}

test.beforeEach(({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "띠 끌기는 PC 만 — 모바일은 세부의 활동 고치기");
});

test("종료 끝을 끌면 바뀔 기간이 보이고, 놓으면 저장돼 새로고침해도 남는다", async ({ page }) => {
  const state = await setup(page);
  const row = page.getByRole("button", { name: /Swap app/ });
  await drag(page, "band-end-7-2025", 9, false);
  await expect(row).toContainText("바꿀 기간 2025.03 – 2025.09");
  expect(state.patches).toHaveLength(0);
  await page.mouse.up();
  await expect(page.getByRole("status")).toContainText("「Swap app」 기간을 2025.03 – 2025.09(으)로 바꿨어요");
  expect(state.patches).toEqual([{ id: 7, body: { period: { start: "2025-03", end: "2025-09", ongoing: false } } }]);
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toHaveCount(0); // 끈 건 세부 열기가 아니다
  await page.reload();
  await expect(page.getByRole("button", { name: /Swap app/ })).toContainText("2025.03 – 2025.09");
});

test("시작 끝은 종료를 넘지 못하고, 진행 중이면 종료 끝이 없다", async ({ page }) => {
  const state = await setup(page);
  await drag(page, "band-start-7-2025", 11);
  expect(state.patches.at(-1)).toEqual({ id: 7, body: { period: { start: "2025-06", end: "2025-06", ongoing: false } } });
  await expect(page.getByTestId("band-end-8-2025")).toHaveCount(0);
  await expect(page.getByTestId("band-end-8-2026")).toHaveCount(0);
  await expect(page.getByTestId("band-start-8-2025")).toHaveCount(0); // 앞 해에서 이어진 흐린 줄
  await drag(page, "band-start-8-2024", 3);
  expect(state.patches.at(-1)).toEqual({ id: 8, body: { period: { start: "2024-03", end: null, ongoing: true } } });
});

test("종료가 비어 있던 한 달짜리 활동은 시작을 당기면 원래 달을 종료로 남긴다", async ({ page }) => {
  const state = await setup(page);
  await drag(page, "band-start-9-2023", 2);
  expect(state.patches.at(-1)).toEqual({ id: 9, body: { period: { start: "2023-02", end: "2023-05", ongoing: false } } });
});

test("저장이 실패하면 원래 띠 · 기간으로 돌리고 알린다", async ({ page }) => {
  const state = await setup(page);
  state.fail = 400;
  await drag(page, "band-end-7-2025", 12);
  await expect(page.getByRole("alert").filter({ hasText: "기간을" })).toContainText("기간을 바꾸지 못해서 마지막으로 저장된 기간으로 돌려 놨어요. Server rejected");
  await expect(page.getByRole("button", { name: /Swap app/ })).toContainText("2025.03 – 2025.06");
});

test("제자리에 놓으면 요청이 없고, 띠를 누르면 지금처럼 세부가 열린다", async ({ page }) => {
  const state = await setup(page);
  await drag(page, "band-end-7-2025", 6);
  expect(state.patches).toHaveLength(0);
  await page.getByRole("button", { name: /Swap app/ }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { name: "Swap app" })).toBeVisible();
});

test("느린 응답 동안 5회 끌어도 최신 값만 순서대로 저장하고 완료 알림은 한 번이다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  const row = page.getByRole("button", { name: /Swap app/ });
  await drag(page, "band-end-7-2025", 7);
  await expect.poll(() => state.replies.length).toBe(1);
  for (const month of [8, 9, 10, 11]) await drag(page, "band-end-7-2025", month);
  await expect(row).toContainText("2025.03 – 2025.11");
  expect(state.patches).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toHaveCount(0);
  state.replies[0].release();
  await expect.poll(() => state.replies.length).toBe(2);
  await expect(row).toContainText("2025.03 – 2025.11");
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toHaveCount(0);
  expect(state.patches.map(p => p.body.period.end)).toEqual(["2025-07", "2025-11"]);
  expect(state.maximum.get(7)).toBe(1);
  state.replies[1].release();
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toContainText("2025.11");
  await page.reload();
  await expect(row).toContainText("2025.03 – 2025.11");
});

test("후속 저장 실패는 마지막 성공 기간으로 복구하고, 실패 뒤 새 드래그는 저장된다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  const row = page.getByRole("button", { name: /Swap app/ });
  await drag(page, "band-end-7-2025", 7);
  await expect.poll(() => state.replies.length).toBe(1);
  await drag(page, "band-end-7-2025", 8);
  state.replies[0].release();
  await expect.poll(() => state.replies.length).toBe(2);
  await drag(page, "band-end-7-2025", 9);
  await drag(page, "band-end-7-2025", 10);
  state.replies[1].release(400);
  await expect(page.getByRole("alert").filter({ hasText: "기간을" })).toContainText("마지막으로 저장된 기간");
  await expect(row).toContainText("2025.03 – 2025.07");
  expect(state.patches).toHaveLength(2);
  state.hold = false;
  await drag(page, "band-end-7-2025", 12);
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toContainText("2025.12");
  expect(state.maximum.get(7)).toBe(1);
  await page.reload();
  await expect(row).toContainText("2025.03 – 2025.12");
});

test("첫 저장 실패는 대기 변경도 버리고 최초 저장 기간으로 복구한다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  await drag(page, "band-end-7-2025", 7);
  await expect.poll(() => state.replies.length).toBe(1);
  await drag(page, "band-end-7-2025", 8);
  await drag(page, "band-end-7-2025", 9);
  state.replies[0].release(400);
  await expect(page.getByRole("button", { name: /Swap app/ })).toContainText("2025.03 – 2025.06");
  await expect(page.getByRole("alert").filter({ hasText: "기간을" })).toBeVisible();
  expect(state.patches).toHaveLength(1);
});

test("다른 활동은 독립 저장하며 활동 전환 뒤 응답도 선택한 세부를 덮지 않는다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  await drag(page, "band-end-7-2025", 9);
  await drag(page, "band-start-8-2024", 3);
  await expect.poll(() => state.replies.length).toBe(2);
  await page.getByRole("button", { name: /Hackathon/ }).click();
  const detail = page.getByRole("complementary", { name: "활동 세부" });
  await expect(detail.getByRole("heading", { name: "Hackathon" })).toBeVisible();
  state.replies.find(r => r.id === 8)!.release();
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toContainText("Algo study");
  expect(state.activities.find(a => a.id === 7)!.period.end).toBe("2025-06");
  state.replies.find(r => r.id === 7)!.release();
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toContainText("Swap app");
  await expect(detail.getByRole("heading", { name: "Hackathon" })).toBeVisible();
  await expect(detail).toContainText("2023.05");
  expect([...state.maximum.values()]).toEqual([1, 1]);
});

test("화면을 떠나도 대기 중 마지막 값은 저장하고 새 화면에 예전 알림을 표시하지 않는다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  await drag(page, "band-end-7-2025", 7);
  await expect.poll(() => state.replies.length).toBe(1);
  await drag(page, "band-end-7-2025", 10);
  await page.getByRole("link", { name: "지원", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/questions/);
  state.replies[0].release();
  await expect.poll(() => state.replies.length).toBe(2);
  state.replies[1].release();
  await expect.poll(() => state.activities[0].period.end).toBe("2025-10");
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toHaveCount(0);
  await page.getByRole("link", { name: "내 경험", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: /Swap app/ })).toContainText("2025.03 – 2025.10");
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toHaveCount(0);
});

test("저장 중 활동 세부를 조회해도 최신 드래그 기간을 유지한다", async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  await drag(page, "band-end-7-2025", 8);
  await expect.poll(() => state.replies.length).toBe(1);
  await drag(page, "band-end-7-2025", 10);
  await page.getByRole("button", { name: /Swap app/ }).click();
  const detail = page.getByRole("complementary", { name: "활동 세부" });
  await expect(detail.getByRole("heading", { name: "Swap app" })).toBeVisible();
  await expect(detail).toContainText("2025.03 – 2025.10");
  state.replies[0].release();
  await expect.poll(() => state.replies.length).toBe(2);
  await expect(detail).toContainText("2025.03 – 2025.10");
  state.replies[1].release();
  await expect(page.getByRole("status").filter({ hasText: "바꿨어요" })).toBeVisible();
  await expect(detail).toContainText("2025.03 – 2025.10");
});
