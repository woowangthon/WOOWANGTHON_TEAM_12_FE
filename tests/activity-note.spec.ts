// 시험 전용 HTTP 응답. 제품용 목/가짜 저장 성공이나 실제 BE 영속성 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, UpdateActivityRequest } from "../src/lib/api/types";

const noteRegion = (page: Page) => page.getByRole("region", { name: "그때의 나", exact: true });
const input = (page: Page) => noteRegion(page).getByRole("textbox", { name: "계기 · 그때 든 생각", exact: true });
const summary = (activity: ActivityDetail) => {
  const { experiences, ...rest } = activity;
  return { ...rest, experienceCount: experiences.length };
};
async function setup(page: Page, note: string | null = null) {
  const activities: ActivityDetail[] = [
    { id: 7, name: "바꿔요 — 시험용 활동", period: { start: "2025-03", end: "2025-06", ongoing: false }, note,
      experiences: [{ id: 101, activityId: 7, content: "기존 경험 본문", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [] }] },
    { id: 8, name: "스터디 — 시험용 활동", period: { start: "2024-09", end: null, ongoing: true }, note: "스터디의 생각", experiences: [] },
  ];
  const state = { activities, patches: [] as { id: number; body: UpdateActivityRequest }[], fail: false,
    patchGate: null as Promise<void> | null, getGate: null as Promise<void> | null, responseNote: undefined as string | undefined,
    staleResponseFields: false, gets: 0 };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: activities.map(summary) } });
    const match = path.match(/^\/api\/activities\/(\d+)$/);
    if (!match) return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
    const activity = activities.find(a => a.id === Number(match[1]))!;
    if (request.method() === "PATCH") {
      const body: UpdateActivityRequest = request.postDataJSON();
      state.patches.push({ id: activity.id, body });
      if (state.patchGate) await state.patchGate;
      if (state.fail) return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "메모를 저장하지 못했어요. 서버 연결을 확인해 주세요." } } });
      Object.assign(activity, body);
      if (body.note !== undefined && state.responseNote !== undefined) activity.note = state.responseNote;
      const response = summary(activity);
      if (state.staleResponseFields) { response.name = "지나간 이름"; response.period = { start: null, end: null, ongoing: false }; }
      return route.fulfill({ json: response });
    }
    const snapshot = structuredClone(activity);
    if (activity.id === 7) {
      state.gets++;
      if (state.getGate) await state.getGate;
    }
    return route.fulfill({ json: snapshot });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  await open(page, "바꿔요");
  return state;
}
async function open(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await expect(noteRegion(page)).toBeVisible();
}
async function close(page: Page) {
  await page.getByRole("button", { name: page.viewportSize()!.width < 1024 ? "내 경험" : "세부 닫기", exact: true }).click();
}
async function edit(page: Page) {
  await noteRegion(page).getByRole("button", { name: "고치기", exact: true }).click();
}
async function save(page: Page) {
  await noteRegion(page).getByRole("button", { name: "저장", exact: true }).click();
  await expect(input(page)).toHaveCount(0);
}

test("empty note is quiet; saved note is separate from experiences and responsive", async ({ page }, info) => {
  const state = await setup(page);
  await expect(noteRegion(page).getByRole("button", { name: "+ 계기나 그때 든 생각 남기기", exact: true })).toBeVisible();
  await expect(noteRegion(page).getByRole("alert")).toHaveCount(0);
  await expect(noteRegion(page).getByText("내가 입력", { exact: true })).toHaveCount(0);
  expect(state.patches).toHaveLength(0);
  await noteRegion(page).getByRole("button").click();
  await input(page).fill("문제만 풀다 보니 직접 서비스를 만들어 보고 싶어졌다");
  await save(page);
  await expect(noteRegion(page).getByText("내가 입력", { exact: true })).toBeVisible();
  await expect(noteRegion(page).getByText("기존 경험 본문", { exact: true })).toHaveCount(0);
  await expect(page.getByText("기존 경험 본문", { exact: true })).toBeVisible();
  if (process.env.UPDATE_NOTE_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `docs/fe-77/activity-note-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("write, trim, edit, cancel, no-op and delete send only note and survive reopening/reload", async ({ page }) => {
  const state = await setup(page);
  await noteRegion(page).getByRole("button").click();
  await input(page).fill("   ");
  await save(page);
  expect(state.patches).toEqual([]);
  await noteRegion(page).getByRole("button").click();
  await input(page).fill("  당시 생각  ");
  await save(page);
  await expect(noteRegion(page).getByText("당시 생각", { exact: true })).toBeVisible();
  await edit(page);
  await input(page).fill("취소할 생각");
  await noteRegion(page).getByRole("button", { name: "취소", exact: true }).click();
  await expect(noteRegion(page)).toContainText("당시 생각");
  await edit(page);
  await input(page).fill("  당시 생각  ");
  await save(page);
  expect(state.patches).toHaveLength(1);
  await edit(page); await input(page).fill("고친 생각"); await save(page);
  await close(page); await open(page, "스터디");
  await expect(noteRegion(page)).toContainText("스터디의 생각");
  await close(page); await open(page, "바꿔요");
  await expect(noteRegion(page)).toContainText("고친 생각");
  await page.reload(); await open(page, "바꿔요");
  await expect(noteRegion(page)).toContainText("고친 생각");
  await noteRegion(page).getByRole("button", { name: "지우기", exact: true }).click();
  await expect(noteRegion(page).getByRole("button", { name: /^\+ 계기/ })).toBeVisible();
  await page.reload(); await open(page, "바꿔요");
  await expect(noteRegion(page).getByText("내가 입력", { exact: true })).toHaveCount(0);
  expect(state.patches.map(p => p.body)).toEqual([{ note: "당시 생각" }, { note: "고친 생각" }, { note: null }]);
  expect(state.activities[0].name).toBe("바꿔요 — 시험용 활동");
  expect(state.activities[0].experiences[0].content).toBe("기존 경험 본문");
});

test("200 UTF-16 units after trimming, newline paste prevention, and whitespace deletion", async ({ page }) => {
  const state = await setup(page, "원래 생각");
  await edit(page);
  await input(page).fill("😀".repeat(101));
  await expect(noteRegion(page).getByRole("alert")).toContainText("200자");
  await expect(noteRegion(page).getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  expect(state.patches).toHaveLength(0);
  await input(page).fill("한 줄");
  await input(page).evaluate(element => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "첫 줄\n둘째 줄");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(input(page)).toHaveValue("한 줄");
  await expect(noteRegion(page).getByRole("alert")).toContainText("줄바꿈 없이");
  await input(page).fill(`  ${"😀".repeat(100)}  `);
  await save(page);
  expect(state.patches[0].body.note).toBe("😀".repeat(100));
  await edit(page); await input(page).fill("   "); await save(page);
  expect(state.patches[1].body).toEqual({ note: null });
});

test("save and deletion failures preserve input and saved note; explicit retries succeed", async ({ page }) => {
  const state = await setup(page, "기존 생각");
  state.fail = true;
  await edit(page); await input(page).fill("보존할 입력");
  await noteRegion(page).getByRole("button", { name: "저장", exact: true }).click();
  await expect(noteRegion(page).getByRole("alert")).toContainText("서버 연결");
  await expect(input(page)).toHaveValue("보존할 입력");
  expect(state.activities[0].note).toBe("기존 생각");
  state.fail = false;
  await noteRegion(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(noteRegion(page).getByText("보존할 입력", { exact: true })).toBeVisible();
  state.fail = true;
  await noteRegion(page).getByRole("button", { name: "지우기", exact: true }).click();
  await expect(noteRegion(page).getByRole("alert")).toBeVisible();
  await expect(noteRegion(page).getByText("보존할 입력", { exact: true })).toBeVisible();
  state.fail = false;
  await noteRegion(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(noteRegion(page).getByRole("button", { name: /^\+ 계기/ })).toBeVisible();
  expect(state.patches.map(p => p.body)).toEqual([{ note: "보존할 입력" }, { note: "보존할 입력" }, { note: null }, { note: null }]);
});

test("pending save prevents duplicates and displays the server note without overwriting other fields", async ({ page }) => {
  const state = await setup(page, "기존 생각");
  let release!: () => void;
  state.patchGate = new Promise<void>(resolve => { release = resolve; });
  state.responseNote = "서버 응답의 생각";
  state.staleResponseFields = true;
  await edit(page); await input(page).fill("요청한 생각");
  const button = noteRegion(page).getByRole("button", { name: "저장", exact: true });
  await button.click();
  await expect(input(page)).toBeDisabled();
  await expect(noteRegion(page).getByRole("button", { name: "저장 중…", exact: true })).toBeDisabled();
  await noteRegion(page).getByRole("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect.poll(() => state.patches.length).toBe(1);
  release();
  await expect(noteRegion(page).getByText("서버 응답의 생각", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "바꿔요 — 시험용 활동", exact: true })).toBeVisible();
  await expect(page.getByText("기존 경험 본문", { exact: true })).toBeVisible();
});

test("a pending save never changes another activity; a stale detail GET cannot overwrite a newer note", async ({ page }) => {
  const state = await setup(page, "기존 생각");
  let releasePatch!: () => void, releaseGet!: () => void;
  state.patchGate = new Promise<void>(resolve => { releasePatch = resolve; });
  await edit(page); await input(page).fill("늦게 저장된 생각");
  await noteRegion(page).getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  await close(page); await open(page, "스터디");
  await expect(noteRegion(page)).toContainText("스터디의 생각");
  await close(page);
  state.getGate = new Promise<void>(resolve => { releaseGet = resolve; });
  await page.getByRole("button", { name: /바꿔요/ }).filter({ visible: true }).first().click();
  await expect.poll(() => state.gets).toBe(2);
  releasePatch();
  await expect.poll(() => state.activities[0].note).toBe("늦게 저장된 생각");
  // 저장 응답의 UI 처리가 끝난 뒤, 저장 전 스냅샷을 지닌 GET을 돌려준다.
  await page.waitForTimeout(100);
  releaseGet();
  await expect(noteRegion(page)).toContainText("늦게 저장된 생각");
  await expect(noteRegion(page)).not.toContainText("스터디의 생각");
});
