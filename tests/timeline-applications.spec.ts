// 시험 전용 HTTP 응답. 제품용 목이 아니고 실제 BE 동작 검증도 아니다(S-37 · FE#97).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { Application } from "../src/lib/api/question-types";

const app = (id: number, organization: string, applicationStatus: Application["applicationStatus"], submittedMonth: string | null): Application => ({
  id, organization, applicationStatus, submittedMonth,
  questions: [{ id: id * 10, applicationId: id, organization, text: "지원 동기", status: "COMPLETED", createdAt: "2026-01-01T00:00:00Z" }],
  createdAt: "2026-01-01T00:00:00Z",
});

async function setup(page: Page) {
  const state = { calls: 0, fail: false };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [
      { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, experienceCount: 1 },
    ] } });
    if (path === "/api/applications") {
      state.calls++;
      if (state.fail) return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요." } } });
      return route.fulfill({ json: { applications: [
        app(1, "OO 부트캠프", "WRITING", null),
        app(2, "UX 리서치 학회", "PASSED", "2025-08"),
        app(3, "OO 기업 인턴", "SUBMITTED", "2024-05"),
      ] } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  await expect(page.getByRole("button", { name: /바꿔요/ }).first()).toBeVisible();
  return state;
}

test("지원도 같이 보기 — 기본 꺼짐, 켜면 낸 달에 한 줄 · 작성 중은 빠짐 · 누르면 그 지원", async ({ page }) => {
  await setup(page);
  const toggle = page.getByLabel("지원도 같이 보기");
  await expect(toggle).not.toBeChecked();
  // 사이드바 지원서(FE#147)가 먼저 받아도 타임라인에는 켜기 전까지 끼지 않는다
  await expect(page.locator("main").getByRole("link", { name: /UX 리서치 학회/ })).toHaveCount(0);

  await toggle.check();
  const row = page.locator("main").getByRole("link", { name: /UX 리서치 학회/ });
  await expect(row).toContainText("2025.08 · 지원 · 합격");
  await expect(row).toHaveAttribute("href", "/questions?question=20");
  // 지원만 있는 해(2024)도 연도로 선다
  await expect(page.getByRole("region", { name: "2024년" }).getByRole("link", { name: /OO 기업 인턴/ })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: /OO 부트캠프/ })).toHaveCount(0);

  // 새로고침해도 켠 채로(브라우저에 저장)
  await page.reload();
  await expect(page.getByLabel("지원도 같이 보기")).toBeChecked();
  await expect(page.locator("main").getByRole("link", { name: /UX 리서치 학회/ })).toBeVisible();

  await page.getByLabel("지원도 같이 보기").uncheck();
  await expect(page.locator("main").getByRole("link", { name: /UX 리서치 학회/ })).toHaveCount(0);
});

test("지원을 못 받으면 활동은 그대로 두고 지원 자리에 오류 · 다시 시도", async ({ page }) => {
  const state = await setup(page);
  state.fail = true;
  await page.getByLabel("지원도 같이 보기").check();
  await expect(page.getByRole("alert").filter({ hasText: "지원을 불러오지 못했어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: /바꿔요/ }).first()).toBeVisible();
  state.fail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator("main").getByRole("link", { name: /UX 리서치 학회/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "지원을 불러오지 못했어요" })).toHaveCount(0);
});
