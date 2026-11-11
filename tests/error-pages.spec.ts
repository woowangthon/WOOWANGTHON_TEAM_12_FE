// FE#405 — 없는 주소는 한국어 404, 그리다가 난 오류는 「문제가 생겼어요」 화면(다시 시도 · 홈으로 가기).
// 합성 HTTP 응답만 쓴다 — 오류는 앱 코드가 아니라 시험의 깨진 응답(기간 없는 활동)으로 일으킨다. 실제 BE 검증이 아니다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";

const good = [{ id: 1, name: "실시간 협업 에디터", period: { start: "2025-03", end: "2025-06", ongoing: false }, experienceCount: 0 }];
// 그리다가 깨지는 응답 — 활동에 기간이 없다(계약 위반). 오류 화면을 띄우려는 시험 전용
const broken = [{ id: 1, name: "기간 없는 활동", experienceCount: 0 }];

async function install(page: Page, state: { activities: unknown[] }) {
  // 개발 서버의 오류 오버레이가 버튼을 가리지 않게
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities } });
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND_IN_TEST", message: "x" } } });
  });
}

test("없는 주소는 한국어 404 — 「홈으로 가기」로 돌아간다(FE#405)", async ({ page }) => {
  await install(page, { activities: good });
  const response = await page.goto("/invalid-route");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeVisible();
  await expect(page.getByText("주소가 잘못되었거나 사라진 페이지예요.")).toBeVisible();
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
  await expect(page).toHaveTitle("페이지를 찾을 수 없어요");
  await page.getByRole("link", { name: "홈으로 가기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("form", { name: "글 보내기" })).toBeVisible();
});

test("그리다가 오류가 나면 「문제가 생겼어요」 — 오류 내용은 보이지 않고, 다시 시도로 복구한다(FE#405)", async ({ page }) => {
  const state = { activities: broken as unknown[] };
  await install(page, state);
  await page.goto("/experience");
  await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toBeVisible();
  await expect(page.getByText("화면을 불러오는 도중 예기치 못한 오류가 일어났어요. 잠시 뒤 다시 시도해 주세요.")).toBeVisible();
  // 오류 내용(메시지 · 스택)은 화면에 없다 — 개발 서버 오버레이(nextjs-portal)는 개발에서만 있어 오류 화면(main)만 본다
  await expect(page.getByRole("main")).not.toContainText(/Application error|TypeError|Cannot read|undefined/);

  // 원인이 풀린 뒤(응답이 고쳐짐) 다시 시도하면 화면을 다시 그려 타임라인이 뜬다
  state.activities = good;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "내 경험", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toHaveCount(0);
});

test("오류 화면의 「홈으로 가기」는 홈으로 간다(FE#405)", async ({ page }) => {
  const state = { activities: broken as unknown[] };
  await install(page, state);
  await page.goto("/experience");
  await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toBeVisible();
  state.activities = good;
  await page.getByRole("link", { name: "홈으로 가기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("form", { name: "글 보내기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toHaveCount(0);
});
