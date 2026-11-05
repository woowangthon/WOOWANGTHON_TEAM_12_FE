import { test, expect } from "@playwright/test";
import { ENTRANCE_KINDS, routeEntrance } from "../src/lib/api/entrance";

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
