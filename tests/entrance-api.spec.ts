import { test, expect } from "@playwright/test";
import { ENTRANCE_KINDS, parseApplication, routeEntrance, singleLink } from "../src/lib/api/entrance";
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

test("지원 나누기는 글을 POST 하고 목록 밖 값 · 빈 문항을 칸에 넣지 않으며 실패를 그대로 올린다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api/";
  const text = "[OO 부트캠프]\n1. 문항";
  globalThis.fetch = async (url, options) => {
    expect(String(url)).toBe("https://backend.example/api/entrance/parse-application");
    expect(options).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify({ text }) });
    return Response.json({ organization: " OO ", organizationType: "SCHOOL", jobRole: "BACKEND", questions: ["문항", " "],
      // 공고 요건 줄(S-91) — 목록 밖 칸 · 빈 줄은 버리고, 목록 밖 ksa 는 null, 300자로 자른다
      postingLines: [{ section: "REQUIRED", text: " 장애 대응 경험 ", ksa: "SKILL" }, { section: "BENEFIT", text: "점심 제공", ksa: null }, { section: "DUTY", text: " ", ksa: null }, { section: "STACK", text: "x".repeat(301), ksa: "TOOL" }],
      readFrom: "TEXT" });
  };
  expect(await parseApplication(text)).toEqual({ organization: "OO", organizationType: null, jobRole: "BACKEND", questions: ["문항"],
    postingLines: [{ section: "REQUIRED", text: "장애 대응 경험", ksa: "SKILL" }, { section: "STACK", text: "x".repeat(300), ksa: null }], readFrom: "TEXT" });
  for (const status of [502, 504]) {
    globalThis.fetch = async () => Response.json({ error: { code: "AI_FAILED", message: "실패" } }, { status });
    await expect(parseApplication(text)).rejects.toMatchObject({ status });
  }
  globalThis.fetch = async () => Response.json({ organization: null });
  await expect(parseApplication(text)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("지원 나누기 한도를 먼저 검사하고 목은 글에 적힌 번호 줄만 문항으로 읽는다", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  await expect(parseApplication(" ")).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(parseApplication("a".repeat(20001))).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  expect(await parseApplication("[OO 백엔드 부트캠프]\n안내\n1. 첫 문항\n2) 둘째 문항")).toEqual({ organization: "OO 백엔드 부트캠프", organizationType: "BOOTCAMP", jobRole: "BACKEND", questions: ["첫 문항", "둘째 문항"], postingLines: [], readFrom: "TEXT" });
  // MOCK(posting-lines) — 머리 줄 아래 글머리 줄만 그 칸으로, 글은 그대로
  expect((await parseApplication("[OO]\n자격요건\n- Java 경험\n- 협업 경험\n복지\n- 점심 제공\n우대:\n- 배포 경험")).postingLines).toEqual([
    { section: "REQUIRED", text: "Java 경험", ksa: null }, { section: "REQUIRED", text: "협업 경험", ksa: null }, { section: "PREFERRED", text: "배포 경험", ksa: null },
  ]);
  expect((await parseApplication("문항이 없는 글")).questions).toEqual([]);
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

test("공고 링크는 url 하나로 POST 하고 422 를 그대로 올리며, 링크 하나뿐인 입력만 링크로 본다 (S-46)", async () => {
  expect(singleLink("  https://example.com/recruit/1?a=b \n")).toBe("https://example.com/recruit/1?a=b");
  for (const text of ["공고 https://example.com", "https://a.com https://b.com", "ftp://example.com", "https://", `https://e.com/${"a".repeat(2000)}`]) expect(singleLink(text)).toBeNull();
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api/";
  globalThis.fetch = async (url, options) => {
    expect(String(url)).toBe("https://backend.example/api/entrance/parse-application");
    expect(options).toMatchObject({ method: "POST", body: JSON.stringify({ url: "https://example.com/r" }) });
    return Response.json({ organization: null, organizationType: null, jobRole: null, questions: [] });
  };
  expect((await parseApplication({ url: " https://example.com/r " })).questions).toEqual([]);
  globalThis.fetch = async () => Response.json({ error: { code: "URL_BLOCKED", message: "막아 두었어요" } }, { status: 422 });
  await expect(parseApplication({ url: "https://example.com/r" })).rejects.toMatchObject({ status: 422, code: "URL_BLOCKED", message: "막아 두었어요" });
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  await expect(parseApplication({ url: "javascript:alert(1)" })).rejects.toMatchObject({ code: "INVALID_URL" });
});

test("목 링크 읽기는 주소 낱말로 상태만 고르고 네트워크를 쓰지 않는다", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  expect((await parseApplication({ url: "https://example.com/recruit" })).questions).toHaveLength(2);
  expect((await parseApplication({ url: "https://example.com/form" })).questions).toEqual([]);
  await expect(parseApplication({ url: "https://example.com/blocked" })).rejects.toMatchObject({ status: 422, code: "URL_BLOCKED" });
  await expect(parseApplication({ url: "https://example.com/unreadable" })).rejects.toMatchObject({ status: 422, code: "URL_UNREADABLE" });
});
