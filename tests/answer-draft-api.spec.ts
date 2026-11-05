// 실제 API 클라이언트를 시험 전용 fetch 응답으로 검증한다. 제품용 목은 없다.
import { test, expect } from "@playwright/test";
import { createQuestionDraft, fetchQuestion } from "../src/lib/api/questions";
import { onUnauthenticated } from "../src/lib/api/http";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import { DRAFT_EXAMPLE } from "./fixtures/draft-example";
const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api"; });
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("POST sends only selected IDs, receives 202 and reads draft via GET question with session cookies", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const analyzing = { ...DRAFT_EXAMPLE, status: "ANALYZING", sentences: [], omitted: [] };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return options?.method === "POST" ? Response.json(analyzing, { status: 202 }) : Response.json({ ...QUESTION_EXAMPLES[0], draft: DRAFT_EXAMPLE });
  };
  expect(await createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101] })).toEqual(analyzing);
  expect((await fetchQuestion(41)).draft).toEqual(DRAFT_EXAMPLE);
  expect(calls.map(c => [c.url, c.options?.method])).toEqual([["https://backend.example/api/questions/41/draft", "POST"], ["https://backend.example/api/questions/41", "GET"]]);
  expect(JSON.parse(calls[0].options!.body as string)).toEqual({ experienceIds: [101] });
  expect(calls.every(c => c.options?.credentials === "include" && c.options.cache === "no-store")).toBe(true);
});

test("invalid selections and unfinished questions never reach HTTP; missing base never falls back", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected HTTP"); };
  for (const experienceIds of [[], [101, 101], [101, 102, 103, 104], [102]])
    await expect(createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(createQuestionDraft({ ...QUESTION_EXAMPLES[0], status: "ANALYZING" }, { experienceIds: [101] })).rejects.toMatchObject({ code: "QUESTION_NOT_COMPLETED" });
  process.env.NEXT_PUBLIC_API_BASE_URL = "";
  await expect(createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101] })).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  expect(calls).toBe(0);
});

test("contract HTTP and network errors propagate, and 401 uses the shared authentication handler", async () => {
  for (const [status, code] of [[400, "INVALID_REQUEST"], [404, "QUESTION_NOT_FOUND"], [409, "QUESTION_NOT_COMPLETED"], [409, "DRAFT_IN_PROGRESS"], [429, "DAILY_LIMIT_EXCEEDED"]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "서버 오류" } }, { status });
    await expect(createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101] })).rejects.toMatchObject({ code, status });
  }
  globalThis.fetch = async () => { throw new Error("offline"); };
  await expect(createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101] })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  let signedOut = false;
  const unsubscribe = onUnauthenticated(() => { signedOut = true; });
  try {
    globalThis.fetch = async () => Response.json({ error: { code: "UNAUTHENTICATED", message: "로그인 만료" } }, { status: 401 });
    await expect(createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101] })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(signedOut).toBe(true);
  } finally { unsubscribe(); }
});
