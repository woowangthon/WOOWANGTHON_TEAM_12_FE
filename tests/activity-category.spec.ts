// 시험 전용 HTTP 응답. 제품용 목/가짜 저장 성공이나 실제 BE 영속성 검증이 아니다(S-57 · FE#121).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityCategory, CategoryBy, UpdateActivityRequest } from "../src/lib/api/types";

type Row = { id: number; name: string; start: string; category?: ActivityCategory | null; categoryBy?: CategoryBy | null };

const rows = (): Row[] => [
  { id: 1, name: "바꿔요 앱", start: "2025-03", category: "PROJECT", categoryBy: "AI" },
  { id: 2, name: "알고리즘 스터디", start: "2023-09", category: "STUDY", categoryBy: "USER" },
  { id: 3, name: "미분류 활동", start: "2024-03", category: null, categoryBy: null },
  { id: 4, name: "예전 응답 활동", start: "2024-05" }, // 이전 응답 — 필드 없음
];

async function setup(page: Page, activities = rows()) {
  const state = { activities, patches: [] as UpdateActivityRequest[], fail: false };
  const summary = (a: Row) => ({ id: a.id, name: a.name, period: { start: a.start, end: a.start, ongoing: false }, category: a.category, categoryBy: a.categoryBy, note: null, experienceCount: 0 });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities.map(summary) } });
    const id = Number(path.match(/^\/api\/activities\/(\d+)$/)?.[1]);
    const activity = state.activities.find((a) => a.id === id);
    if (!activity) return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
    if (request.method() === "PATCH") {
      const body: UpdateActivityRequest = request.postDataJSON();
      state.patches.push(body);
      if (state.fail) return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "분류를 저장하지 못했어요." } } });
      activity.category = body.category;
      activity.categoryBy = body.category ? "USER" : null;
      return route.fulfill({ json: summary(activity) });
    }
    return route.fulfill({ json: { ...summary(activity), experienceCount: undefined, experiences: [] } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  await expect(row(page, "바꿔요 앱")).toBeVisible();
  return state;
}

const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) });
const chip = (page: Page, name: string) => page.getByRole("group", { name: "분류로 거르기" }).getByRole("button", { name, exact: true });
const field = (page: Page) => page.getByRole("combobox", { name: "이 활동의 분류" });

test("분류가 글자로도 보이고 AI 가 붙인 것은 「AI 해석」 · 필드 없는 활동도 깨지지 않는다", async ({ page }) => {
  await setup(page);
  await expect(row(page, "바꿔요 앱")).toContainText("프로젝트 · 일 (AI 해석)");
  await expect(row(page, "알고리즘 스터디")).toContainText("공부 · 성장");
  await expect(row(page, "알고리즘 스터디")).not.toContainText("AI 해석");
  await expect(row(page, "미분류 활동")).not.toContainText("AI 해석");
  await expect(row(page, "예전 응답 활동")).toBeVisible();
});

test("칩으로 거른다 — 미분류는 전체에만 · 빈 해는 머리를 세우지 않는다 · 0개면 빈 상태", async ({ page }) => {
  await setup(page);
  await chip(page, "프로젝트 · 일").click();
  await expect(chip(page, "프로젝트 · 일")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "바꿔요 앱")).toBeVisible();
  for (const name of ["알고리즘 스터디", "미분류 활동", "예전 응답 활동"]) await expect(row(page, name)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "2024년" })).toHaveCount(0);

  await chip(page, "동아리 · 대외활동").click();
  await expect(page.getByText(/동아리 · 대외활동」로 정리된 활동이 아직 없어요/)).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "전체 보기" }).click();
  for (const name of ["바꿔요 앱", "알고리즘 스터디", "미분류 활동", "예전 응답 활동"]) await expect(row(page, name)).toBeVisible();
  await expect(chip(page, "전체")).toHaveAttribute("aria-pressed", "true");
});

test("세부에서 고르면 저장되고 「AI 해석」이 사라지며 새로고침해도 남는다 · 비울 수 있다", async ({ page }) => {
  const state = await setup(page);
  await row(page, "바꿔요 앱").click();
  await expect(field(page)).toHaveValue("PROJECT");
  await expect(page.getByLabel("활동 세부").getByText("AI 해석", { exact: true })).toBeVisible();

  await field(page).selectOption("CLUB");
  await expect(page.getByLabel("활동 세부").getByText("AI 해석", { exact: true })).toHaveCount(0);
  await expect(field(page)).toHaveValue("CLUB");
  expect(state.patches).toEqual([{ category: "CLUB" }]);

  await page.reload();
  await row(page, "바꿔요 앱").click();
  await expect(field(page)).toHaveValue("CLUB");

  await field(page).selectOption("");
  await expect(field(page)).toHaveValue("");
  expect(state.patches.at(-1)).toEqual({ category: null });
});

test("저장 실패 — 원래 분류로 두고 오류 · 다시 시도", async ({ page }) => {
  const state = await setup(page);
  await row(page, "바꿔요 앱").click();
  state.fail = true;
  await field(page).selectOption("STUDY");
  await expect(page.getByRole("alert").filter({ hasText: "분류를 저장하지 못했어요." })).toBeVisible();
  await expect(field(page)).toHaveValue("PROJECT");

  state.fail = false;
  await page.getByLabel("활동 세부").getByRole("button", { name: "다시 시도" }).click();
  await expect(field(page)).toHaveValue("STUDY");
  await expect(page.getByRole("alert").filter({ hasText: "분류를 저장하지 못했어요." })).toHaveCount(0);
  if (page.viewportSize()!.width < 1024) await page.getByLabel("활동 세부").getByRole("button", { name: "타임라인" }).click(); // 모바일 세부는 전체 화면
  await expect(row(page, "바꿔요 앱")).toContainText("공부 · 성장");
});
