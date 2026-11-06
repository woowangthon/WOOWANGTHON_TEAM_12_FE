// 시험 전용 HTTP 응답. 제품용 목이 아니고 실제 BE 추천 결과도 아니다(S-38 · FE#98).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience } from "../src/lib/api/types";

const exp = (id: number, content: string, usedIn?: Experience["usedIn"]): Experience => ({
  id, activityId: 7, content, competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [], ...(usedIn ? { usedIn } : {}),
});

const ACTIVITY: ActivityDetail = {
  id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, links: [],
  experiences: [
    exp(101, "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다", [
      { applicationId: 22, organization: "OO 연합 동아리", applicationStatus: "PASSED", submittedMonth: "2025-02",
        questions: [{ id: 42, text: "팀 프로젝트에서 맡은 역할과, 팀과 함께 일한 방식을 적어 주세요." }] },
      { applicationId: 21, organization: "OO 백엔드 부트캠프", applicationStatus: "WRITING", submittedMonth: null,
        questions: [{ id: 41, text: "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요." }] },
    ]),
    exp(102, "매주 금요일 스프린트 회고를 했다", []),
    exp(103, "서비스를 AWS 에 배포했다"),
  ],
};

async function setup(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: ACTIVITY.name, period: ACTIVITY.period, note: null, experienceCount: 3 }] } });
    if (path === "/api/activities/7") return route.fulfill({ json: ACTIVITY });
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요/ }).filter({ visible: true }).first().click();
  await expect(page.locator("#experience-101")).toBeVisible();
}

test("used experience shows count; unused shows nothing; opening lists application · question · status", async ({ page }, info) => {
  await setup(page);
  const chip = page.locator("#experience-101").getByRole("button", { name: /지원서 2곳에 쓰임/ });
  await expect(chip).toBeVisible();
  await expect(page.locator("#experience-102")).not.toContainText("쓰임");
  await expect(page.locator("#experience-103")).not.toContainText("쓰임");

  await chip.click();
  const list = page.getByRole("list", { name: "이 경험이 쓰인 지원" });
  await expect(list).toContainText("OO 연합 동아리");
  await expect(list).toContainText("합격");
  await expect(list).toContainText("2025.02 냄");
  await expect(list).toContainText("팀 프로젝트에서 맡은 역할");
  await expect(list).toContainText("작성 중");
  if (process.env.UPDATE_USED_IN_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#experience-101").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/fe-98/used-in-${width}.png`, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await expect(list.getByRole("link", { name: "OO 연합 동아리" })).toHaveAttribute("href", "/questions?question=42");
  await expect(list.getByRole("link", { name: /기술적인 문제를/ })).toHaveAttribute("href", "/questions?question=41");

  await chip.click();
  await expect(list).toHaveCount(0);
});
