// 지원 · 문항 · 되묻기 API — question-api.md 의 주소 · 메서드 · 본문 그대로 부르고, 실패를 그대로 던진다(FE#32)
import { test, expect } from "@playwright/test";
import { addApplicationQuestion, answerClarification, fetchApplication, fetchApplications, fetchQuestion, fetchQuestions, retryQuestion, submitApplication, submitQuestion } from "../src/lib/api/questions";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
type Call = { url: string; method?: string; body?: unknown };
let calls: Call[] = [];
/** 부를 때마다 respond 가 돌려준 응답 — 주소 · 메서드 · 본문을 남긴다 */
function serve(respond: (call: Call) => Response) {
  calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url: String(url), method: options?.method, body: options?.body ? JSON.parse(options.body as string) : undefined };
    calls.push(call);
    return respond(call);
  };
}
test.beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api"; });
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("reads unwrap lists and keep the contract shapes", async () => {
  const [a, b] = QUESTION_EXAMPLES;
  const application = { id: 21, organization: a.organization, questions: [{ id: 41, applicationId: 21, organization: a.organization, text: a.text, status: "COMPLETED", createdAt: a.createdAt }], createdAt: a.createdAt };
  serve(({ url }) => {
    if (url.endsWith("/applications")) return Response.json({ applications: [application] });
    if (url.endsWith("/applications/21")) return Response.json(application);
    if (url.endsWith("/questions")) return Response.json({ questions: application.questions });
    return Response.json(url.endsWith("/41") ? a : b);
  });
  expect(await fetchApplications()).toEqual([application]);
  expect(await fetchApplication(21)).toEqual(application);
  expect(await fetchQuestions()).toEqual(application.questions);
  expect(await fetchQuestion(41)).toEqual(a);
  expect(await fetchQuestion(42)).toEqual(b);
  expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
    "GET https://backend.example/api/applications", "GET https://backend.example/api/applications/21",
    "GET https://backend.example/api/questions", "GET https://backend.example/api/questions/41", "GET https://backend.example/api/questions/42",
  ]);
});

test("writes post the contract bodies", async () => {
  serve(({ url }) => {
    if (url.endsWith("/api/applications")) return Response.json({ applicationId: 21, questionIds: [41, 43] }, { status: 202 });
    if (url.endsWith("/applications/21/questions")) return Response.json({ questionId: 44, status: "ANALYZING" }, { status: 202 });
    if (url.endsWith("/api/questions")) return Response.json({ questionId: 45, applicationId: 24, status: "ANALYZING" }, { status: 202 });
    if (url.endsWith("/retry")) return Response.json({ ...QUESTION_EXAMPLES[0], status: "ANALYZING", requirements: [], recommendations: [], clarifications: [] }, { status: 202 });
    return Response.json({ experienceId: 101, supplement: QUESTION_EXAMPLES[0].recommendations[0].experience.supplements[0] }, { status: 201 });
  });
  expect(await submitApplication({ organization: null, questions: [{ text: "가" }, { text: "나" }] })).toEqual({ applicationId: 21, questionIds: [41, 43] });
  expect(await addApplicationQuestion(21, { text: "본인의 장단점을 적어 주세요." })).toEqual({ questionId: 44, status: "ANALYZING" });
  expect(await submitQuestion({ organization: "OO", text: "x".repeat(5000) })).toMatchObject({ questionId: 45 });
  expect(await retryQuestion(41)).toMatchObject({ status: "ANALYZING" });
  expect(await answerClarification(62, { answer: "두 기기로 확인했다" })).toMatchObject({ experienceId: 101 });
  expect(calls).toEqual([
    { method: "POST", url: "https://backend.example/api/applications", body: { organization: null, questions: [{ text: "가" }, { text: "나" }] } },
    { method: "POST", url: "https://backend.example/api/applications/21/questions", body: { text: "본인의 장단점을 적어 주세요." } },
    { method: "POST", url: "https://backend.example/api/questions", body: { organization: "OO", text: "x".repeat(5000) } },
    { method: "POST", url: "https://backend.example/api/questions/41/retry", body: undefined },
    { method: "POST", url: "https://backend.example/api/clarifications/62/answer", body: { answer: "두 기기로 확인했다" } },
  ]);
});

test("invalid input is rejected before any request", async () => {
  serve(() => { throw new Error("must not call the server"); });
  await expect(submitApplication({ questions: [] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(submitApplication({ questions: Array.from({ length: 11 }, () => ({ text: "a" })) })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(submitApplication({ questions: [{ text: "a" }, { text: " \n " }] })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(submitApplication({ questions: [{ text: "x".repeat(5001) }] })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  await expect(submitApplication({ organization: "o".repeat(101), questions: [{ text: "a" }] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(submitQuestion({ text: " " })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(addApplicationQuestion(21, { text: "x".repeat(5001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  await expect(answerClarification(62, { answer: "  " })).rejects.toMatchObject({ code: "EMPTY_ANSWER" });
  await expect(answerClarification(62, { answer: "x".repeat(2001) })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(calls).toEqual([]);
});

test("server errors surface as-is; nothing falls back to fixed results", async () => {
  serve(({ url }) => {
    if (url.endsWith("/applications")) return Response.json({ error: { code: "DAILY_LIMIT_EXCEEDED", message: "limit" } }, { status: 429 });
    if (url.endsWith("/answer")) return Response.json({ error: { code: "CLARIFICATION_ALREADY_ANSWERED", message: "answered" } }, { status: 409 });
    if (url.endsWith("/retry")) return Response.json({ error: { code: "QUESTION_NOT_FAILED", message: "not failed" } }, { status: 409 });
    return Response.json({ error: { code: "QUESTION_NOT_FOUND", message: "missing" } }, { status: 404 });
  });
  await expect(submitApplication({ questions: [{ text: "a" }] })).rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED", status: 429 });
  await expect(answerClarification(61, { answer: "a" })).rejects.toMatchObject({ code: "CLARIFICATION_ALREADY_ANSWERED", status: 409 });
  await expect(retryQuestion(41)).rejects.toMatchObject({ code: "QUESTION_NOT_FAILED", status: 409 });
  await expect(fetchQuestion(99)).rejects.toMatchObject({ code: "QUESTION_NOT_FOUND", status: 404 });
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await expect(fetchApplications()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});

test("without an API address the question API fails instead of using a mock", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  serve(() => { throw new Error("must not call the server"); });
  await expect(fetchApplications()).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  await expect(submitApplication({ questions: [{ text: "a" }] })).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  expect(calls).toEqual([]);
});
