import { test, expect } from "@playwright/test";
import { ENTRANCE_KINDS, routeEntrance } from "../src/lib/api/entrance";
import { thisTimeLastYear } from "../src/lib/home-overview";
import type { ActivityDetail, Period } from "../src/lib/api/types";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("가르기는 원문과 세션 쿠키를 POST하고 실제 오류를 목으로 바꾸지 않는다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api/";
  const text = "  문항\n전체 글  ";
  globalThis.fetch = async (url, options) => {
    expect(String(url)).toBe("https://backend.example/api/entrance/route");
    expect(options).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", body: JSON.stringify({ text }) });
    return Response.json({ kind: "APPLICATION", reason: "문항" });
  };
  expect(await routeEntrance(text, "SOURCE")).toEqual({ kind: "APPLICATION", reason: "문항" });
  for (const status of [502, 504]) {
    globalThis.fetch = async () => Response.json({ error: { code: "AI_FAILED", message: "분류 실패" } }, { status });
    await expect(routeEntrance(text, "SOURCE")).rejects.toMatchObject({ status });
  }
  globalThis.fetch = async () => Response.json({ kind: "OTHER" });
  await expect(routeEntrance(text)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("입력 한도를 먼저 검사하고 목 모드에서만 네 종류를 고른다", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  await expect(routeEntrance("  ")).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(routeEntrance("a".repeat(50001))).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  for (const kind of ENTRANCE_KINDS) expect((await routeEntrance("입력", kind)).kind).toBe(kind);
});

test("작년 이맘때는 월을 모르는 기간을 추측하지 않고 겹치는 최근 활동을 고른다", () => {
  const activity = (id: number, period: Period): ActivityDetail => ({ id, name: "시험 활동", period, experiences: [{ id, activityId: id, content: "시험 경험", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [] }] });
  const now = new Date("2026-11-05T03:00:00Z");
  const unknown = activity(1, { start: "2025", end: "2025", ongoing: false });
  const unknownEnd = activity(2, { start: "2025-01", end: "2025", ongoing: false });
  const old = activity(3, { start: "2024-09", end: null, ongoing: true });
  const recent = activity(4, { start: "2025-10", end: "2025-12", ongoing: false });
  expect(thisTimeLastYear([unknown, unknownEnd], now)).toBeNull();
  expect(thisTimeLastYear([unknown, unknownEnd, old, recent], now)?.id).toBe(4);
  expect(thisTimeLastYear([activity(5, { start: "2026-01", end: null, ongoing: true })], now)).toBeNull();
});
