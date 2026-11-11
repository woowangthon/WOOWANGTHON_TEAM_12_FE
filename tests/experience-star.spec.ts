// 경험 STAR 칸 — 펼치기 · 빈칸 답하기 · 찬 칸 고치기 · STAR 로 정리 (FE#497 · SPEC S-95 · S-96 · experience-api.md 「STAR 칸」)
// Test-only HTTP fixture; this is not a deployed backend or persistence verification.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience, Star, StarSlotName } from "../src/lib/api/types";

const T_QUESTION = "이 버그는 누가 맡았나요?";
const R_QUESTION = "고친 뒤 무엇이 달라졌나요?";

const readyStar = (): Star => ({
  status: "READY",
  slots: [
    { slot: "S", text: "자식 프로세스가 좀비로 남는 버그", sourceType: "CITATION", sourceId: 201, question: null },
    { slot: "T", text: null, sourceType: null, sourceId: null, question: T_QUESTION },
    { slot: "A", text: "SIGCHLD 핸들러에서 waitpid 반복 호출", sourceType: "SUPPLEMENT", sourceId: 301, question: null },
    { slot: "R", text: null, sourceType: null, sourceId: null, question: R_QUESTION },
  ],
});

async function setup(page: Page, star: Star) {
  const experience: Experience = {
    id: 101, activityId: 7, content: "fork/exec 좀비 프로세스 버그를 waitpid 로 고쳤다", competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI",
    actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
    citations: [{ id: 201, sourceId: 12, sourceName: "회고.md", quote: "fork/exec 흐름에서 자식 프로세스가 좀비로 남는 버그", matched: true, location: { startLine: 3, endLine: 3 } }],
    supplements: [{ id: 301, question: "어떻게 고쳤나요?", answer: "SIGCHLD 핸들러에서 waitpid 반복 호출", questionId: null, createdAt: "2026-11-04T10:05:00+09:00", updatedAt: "2026-11-04T10:05:00+09:00" }],
    star,
  };
  const activity: ActivityDetail = { id: 7, name: "미니 셸 프로젝트", period: { start: "2025-03", end: "2025-06", ongoing: false }, experiences: [experience] };
  const state = { activity, calls: [] as { method: string; path: string; body: unknown }[], polls: 0 };
  let nextSupplement = 400;
  const fill = (slot: StarSlotName, text: string) => {
    const s = experience.star!.slots.find((x) => x.slot === slot)!;
    if (!text.trim()) Object.assign(s, { text: null, sourceType: null, sourceId: null });
    else if (s.sourceType === "SUPPLEMENT") Object.assign(s, { text });
    else {
      const id = nextSupplement++;
      experience.supplements!.push({ id, question: s.question ?? slot, answer: text, questionId: null, createdAt: "", updatedAt: "" });
      Object.assign(s, { text, sourceType: "SUPPLEMENT", sourceId: id });
    }
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    const body = req.method() === "GET" ? null : req.postDataJSON();
    const answer = path.match(/^\/api\/experiences\/101\/star\/([STAR])\/answer$/);
    const put = path.match(/^\/api\/experiences\/101\/star\/([STAR])$/);
    if (answer || put) {
      state.calls.push({ method: req.method(), path, body });
      fill((answer ?? put)![1] as StarSlotName, answer ? body.answer : body.text);
      return route.fulfill({ json: experience });
    }
    if (path === "/api/activities/7/star") {
      state.calls.push({ method: req.method(), path, body });
      experience.star = { status: "ANALYZING", slots: [] };
      return route.fulfill({ status: 202, json: activity });
    }
    if (path === "/api/activities/7") {
      // 정리 중이면 한 번 더 읽힐 때 끝난다
      if (experience.star?.status === "ANALYZING" && state.polls++ > 0) experience.star = readyStar();
      return route.fulfill({ json: activity });
    }
    if (path === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: activity.name, period: activity.period, experienceCount: 1 }] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/experience");
  await page.getByRole("button", { name: /미니 셸 프로젝트/ }).click();
  await expect(page.getByText("fork/exec 좀비 프로세스 버그를 waitpid 로 고쳤다")).toBeVisible();
  return state;
}

/** 점 버튼 — PC 는 아래로 펼치고, 모바일은 하단 시트 */
const starButton = (page: Page) => page.getByRole("button", { name: /^STAR 칸 — / }).locator("visible=true");

// FE#512 — 빈칸은 질문을 안내 글로 품은 입력칸, 쓰고 밖을 누르면 찬다. 찬 칸은 누르면 그 자리에서 고친다. 저장/취소 버튼 · 「내 답」 꼬리표 없음
test("경험 펼치기 → 빈칸에 쓰고 밖을 누름 → 점이 바뀜 → 찬 칸 고치기", async ({ page }) => {
  const state = await setup(page, readyStar());
  await expect(starButton(page)).toHaveAccessibleName(/찬 칸 2 · 빈칸 2/);
  await starButton(page).click();
  const panel = page.getByLabel("STAR 칸", { exact: true }).locator("visible=true");
  await expect(panel.getByText("자식 프로세스가 좀비로 남는 버그")).toBeVisible();
  await expect(panel.getByText("원문", { exact: true })).toBeVisible();
  await expect(panel.getByText("내 답", { exact: true })).toHaveCount(0);
  // 질문은 굵은 글이 아니라 입력칸 안 안내 글
  const t = panel.getByLabel("과제 · 내 몫 칸 글");
  await expect(t).toHaveAttribute("placeholder", T_QUESTION);
  await expect(panel.getByText(T_QUESTION)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /답하기|저장|취소/ })).toHaveCount(0);

  await t.fill("제가 혼자 맡았어요");
  await t.blur();
  await expect(panel.getByRole("button", { name: /^과제 · 내 몫 고치기: 제가 혼자 맡았어요/ })).toBeVisible();
  expect(state.calls[0]).toEqual({ method: "POST", path: "/api/experiences/101/star/T/answer", body: { answer: "제가 혼자 맡았어요" } });
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.keyboard.press("Escape");
  await expect(starButton(page)).toHaveAccessibleName(/찬 칸 3 · 빈칸 1/);

  if ((page.viewportSize()?.width ?? 0) < 1024) await starButton(page).click();
  const panel2 = page.getByLabel("STAR 칸", { exact: true }).locator("visible=true");
  await panel2.getByRole("button", { name: /^상황 고치기/ }).click();
  await panel2.getByLabel("상황 칸 글").fill("좀비 프로세스가 쌓이는 버그");
  await panel2.getByLabel("상황 칸 글").press("Enter");
  await expect(panel2.getByText("좀비 프로세스가 쌓이는 버그")).toBeVisible();
  expect(state.calls[1]).toEqual({ method: "PUT", path: "/api/experiences/101/star/S", body: { text: "좀비 프로세스가 쌓이는 버그" } });
  // 원문 칸을 고치면 원문 근거 버튼이 빠진다(근거는 그대로 — S-10)
  await expect(panel2.getByText("원문", { exact: true })).toHaveCount(0);

  // Esc 는 고친 것을 버린다
  await panel2.getByRole("button", { name: /^행동과 노력 고치기/ }).click();
  await panel2.getByLabel("행동과 노력 칸 글").fill("버려질 글");
  await panel2.getByLabel("행동과 노력 칸 글").press("Escape");
  await expect(panel2.getByText("버려질 글")).toHaveCount(0);
  expect(state.calls).toHaveLength(2);
});

test("근거 펼침과 STAR 펼침은 한 번에 하나다", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "모바일은 하단 시트");
  await setup(page, readyStar());
  await page.getByRole("button", { name: /근거 1/ }).locator("visible=true").click();
  await expect(page.getByText("fork/exec 흐름에서 자식 프로세스가 좀비로 남는 버그")).toBeVisible();
  await starButton(page).click();
  await expect(page.getByLabel("STAR 칸", { exact: true })).toBeVisible();
  await expect(page.getByText("fork/exec 흐름에서 자식 프로세스가 좀비로 남는 버그")).toHaveCount(0);
});

test("정리 안 한 경험은 점 대신 목록 머리 「STAR 로 정리」 — 누르면 정리 중을 따라가 칸이 생긴다", async ({ page }) => {
  const state = await setup(page, { status: "NONE", slots: [] });
  await expect(page.getByRole("button", { name: /^STAR 칸 — / })).toHaveCount(0);
  await page.getByRole("button", { name: "STAR 로 정리", exact: true }).click();
  expect(state.calls).toEqual([{ method: "POST", path: "/api/activities/7/star", body: null }]);
  await expect(page.getByText("STAR 정리 중", { exact: true }).locator("visible=true")).toBeVisible();
  await expect(starButton(page)).toHaveAccessibleName(/찬 칸 2 · 빈칸 2/, { timeout: 15000 });
  await expect(page.getByRole("button", { name: /STAR 로 정리/ })).toHaveCount(0);
});

// FE#512 PR 스크린샷 — UPDATE_STAR_SCREENSHOTS=1 일 때만. STAR 펼침 · 빈칸 쓰는 중 · 보완 줄(답 글만)
test("STAR 펼침 · 빈칸 쓰는 중 스크린샷", async ({ page }, info) => {
  test.skip(process.env.UPDATE_STAR_SCREENSHOTS !== "1", "스크린샷을 새로 찍을 때만");
  await setup(page, readyStar());
  for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
    await page.setViewportSize({ width, height: 1000 });
    const opened = await page.getByLabel("STAR 칸", { exact: true }).locator("visible=true").count();
    if (!opened) await starButton(page).click();
    const panel = page.getByLabel("STAR 칸", { exact: true }).locator("visible=true");
    await expect(panel.getByText("자식 프로세스가 좀비로 남는 버그")).toBeVisible();
    await page.waitForTimeout(400); // 시트가 다 올라온 뒤
    const style = "nextjs-portal { display: none !important; }";
    await page.screenshot({ path: `docs/fe-512/star-open-${width}.png`, style });
    await panel.getByLabel("과제 · 내 몫 칸 글").fill("제가 혼자 맡았어요");
    await page.screenshot({ path: `docs/fe-512/star-writing-${width}.png`, style });
    await panel.getByLabel("과제 · 내 몫 칸 글").fill("");
    if (width === 390) await page.keyboard.press("Escape");
  }
});
