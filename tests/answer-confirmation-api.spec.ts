// 시험 전용 HTTP 응답. 실제 서버와 AI를 호출하지 않는다.
import { test, expect } from "@playwright/test";
import { confirmAnswer, findNewFacts, saveNewFact, dismissNewFact } from "../src/lib/api/questions";
const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api"; });
test.afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase; });
test("PUT preserves exact text; finding and dismissing have no body; save sends edits and unwraps Experience", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const answer = { questionId: 41, text: "답", confirmedAt: "now", newFacts: null };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("dismiss")) return new Response(null, { status: 204 });
    return Response.json(String(url).endsWith("save") ? { id: 108 } : { answer });
  };
  await expect(confirmAnswer(41, "  직접 쓴 답.\n ")).resolves.toEqual(answer);
  await expect(findNewFacts(41)).resolves.toEqual(answer);
  await expect(saveNewFact(801, { activityId: 7, content: "고친 경험", actor: "TEAM" })).resolves.toEqual({ id: 108 });
  await dismissNewFact(802);
  expect(calls.map(c => [c.url.replace("https://backend.example/api", ""), c.options?.method])).toEqual([["/questions/41/answer", "PUT"], ["/questions/41/answer/new-facts", "POST"], ["/new-fact-candidates/801/save", "POST"], ["/new-fact-candidates/802/dismiss", "POST"]]);
  expect(JSON.parse(calls[0].options!.body as string)).toEqual({ text: "  직접 쓴 답.\n " });
  expect(calls[1].options!.body).toBeUndefined(); expect(calls[3].options!.body).toBeUndefined();
  expect(calls.every(c => c.options?.credentials === "include" && c.options.cache === "no-store")).toBe(true);
});
test("invalid text and missing activity never reach HTTP; API errors propagate", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ answer: {} }); };
  await expect(confirmAnswer(41, " ")).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(confirmAnswer(41, "가".repeat(5001))).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  await expect(saveNewFact(801, { activityId: 0, content: "경험", actor: "ME" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(calls).toBe(0); await confirmAnswer(41, "가".repeat(5000)); expect(calls).toBe(1);
  for (const [status, code] of [[429, "DAILY_LIMIT_EXCEEDED"], [409, "NEW_FACTS_IN_PROGRESS"]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: code } }, { status });
    await expect(findNewFacts(41)).rejects.toMatchObject({ code, status });
  }
});
