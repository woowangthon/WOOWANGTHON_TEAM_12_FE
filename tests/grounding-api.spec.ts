// 실제 API 클라이언트의 계약 검증. HTTP 응답은 시험 전용이다.
import { test, expect } from "@playwright/test";
import { createGroundingCheck, fetchGroundingCheck } from "../src/lib/api/questions";
import { GROUNDING_EXAMPLE } from "./fixtures/grounding-example";
const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api"; });
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});
test("POST preserves exact answer, GET unwraps last check and null; cookies and no-store are shared", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(options?.method === "POST" ? { ...GROUNDING_EXAMPLE, status: "ANALYZING", sentences: [] } : { groundingCheck: GROUNDING_EXAMPLE }, { status: options?.method === "POST" ? 202 : 200 });
  };
  const text = "  직접 쓴 답입니다.\n고치지 않습니다. ";
  expect((await createGroundingCheck(41, { text })).status).toBe("ANALYZING");
  expect(await fetchGroundingCheck(41)).toEqual(GROUNDING_EXAMPLE);
  expect(calls.map(c => [c.url, c.options?.method])).toEqual([["https://backend.example/api/questions/41/grounding-check", "POST"], ["https://backend.example/api/questions/41/grounding-check", "GET"]]);
  expect(JSON.parse(calls[0].options!.body as string)).toEqual({ text });
  expect(calls.every(c => c.options?.credentials === "include" && c.options.cache === "no-store")).toBe(true);
  globalThis.fetch = async () => Response.json({ groundingCheck: null });
  expect(await fetchGroundingCheck(42)).toBeNull();
});
test("empty and over-limit text never reaches HTTP; exactly 5000 characters does", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(GROUNDING_EXAMPLE); };
  for (const text of ["", " \n\t"]) await expect(createGroundingCheck(41, { text })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(createGroundingCheck(41, { text: "가".repeat(5001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  expect(calls).toBe(0);
  await createGroundingCheck(41, { text: "가".repeat(5000) });
  expect(calls).toBe(1);
});
test("contract errors and missing API address propagate without a fixed fallback", async () => {
  for (const [status, code] of [[404, "QUESTION_NOT_FOUND"], [409, "GROUNDING_CHECK_IN_PROGRESS"], [429, "DAILY_LIMIT_EXCEEDED"]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: code } }, { status });
    await expect(createGroundingCheck(41, { text: "답" })).rejects.toMatchObject({ code, status });
  }
  globalThis.fetch = async () => { throw new Error("offline"); };
  await expect(fetchGroundingCheck(41)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  process.env.NEXT_PUBLIC_API_BASE_URL = "";
  await expect(createGroundingCheck(41, { text: "답" })).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
});
