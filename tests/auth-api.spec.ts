import { test, expect } from "@playwright/test";
import { dailyLimitMessage, fetchMe, isDailyLimit, login, logout, signup, signupError, authErrorMessage } from "../src/lib/api/auth";
import { ApiError } from "../src/lib/api/errors";
import { onUnauthenticated } from "../src/lib/api/http";
import { fetchActivities } from "../src/lib/api/experience";

// FE#37 — 계약 auth-api 의 요청 모양 · 오류 처리. 실제 BE 검증이 아니다
const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

const me = { id: 7, loginId: "mina_01", dailyAnalysis: { used: 3, limit: 20 } };

test("auth calls use the contract paths, methods, JSON body and cookies", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).endsWith("/logout") ? new Response(null, { status: 204 }) : Response.json(me);
  };
  const body = { loginId: "mina_01", password: "password1" };
  expect(await fetchMe()).toEqual(me);
  expect(await login(body)).toEqual(me);
  expect(await signup(body)).toEqual(me);
  expect(await logout()).toBeUndefined();
  expect(calls.map((c) => [c.options?.method, c.url])).toEqual([
    ["GET", "https://backend.example/api/auth/me"],
    ["POST", "https://backend.example/api/auth/login"],
    ["POST", "https://backend.example/api/auth/signup"],
    ["POST", "https://backend.example/api/auth/logout"],
  ]);
  for (const c of calls) expect(c.options?.credentials).toBe("include");
  expect(JSON.parse(String(calls[1].options?.body))).toEqual(body);
  expect(calls[3].options?.body).toBeUndefined();
});

test("401 UNAUTHENTICATED from any API notifies listeners; wrong password does not", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  let notified = 0;
  const off = onUnauthenticated(() => notified++);
  globalThis.fetch = async () => Response.json({ error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다" } }, { status: 401 });
  await expect(fetchActivities()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  expect(notified).toBe(1);
  globalThis.fetch = async () => Response.json({ error: { code: "INVALID_CREDENTIALS", message: "틀림" } }, { status: 401 });
  await expect(login({ loginId: "a", password: "b" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  expect(notified).toBe(1);
  off();
  globalThis.fetch = async () => Response.json({ error: { code: "UNAUTHENTICATED", message: "x" } }, { status: 401 });
  await expect(fetchMe()).rejects.toMatchObject({ status: 401 });
  expect(notified).toBe(1);
});

test("signup rules follow the contract; error codes become screen messages", () => {
  expect(signupError({ loginId: "Mina_01", password: "12345678" })).toBeNull();
  expect(signupError({ loginId: "  mina.k-1  ", password: "12345678" })).toBeNull();
  expect(signupError({ loginId: "ab", password: "12345678" })).toContain("3 ~ 30자");
  expect(signupError({ loginId: "a".repeat(31), password: "12345678" })).toContain("3 ~ 30자");
  expect(signupError({ loginId: "미나", password: "12345678" })).toContain("영문");
  expect(signupError({ loginId: "mina", password: "1234567" })).toContain("8자 이상");
  expect(signupError({ loginId: "mina", password: "가".repeat(24) })).toBeNull(); // 72 바이트
  expect(signupError({ loginId: "mina", password: "가".repeat(25) })).toContain("너무 길어요");
  expect(authErrorMessage(new ApiError("INVALID_CREDENTIALS", "x", 401))).toBe("아이디 또는 비밀번호가 맞지 않아요.");
  expect(authErrorMessage(new ApiError("LOGIN_ID_TAKEN", "x", 409))).toContain("이미 쓰고 있는 아이디");
  expect(authErrorMessage(new ApiError("NETWORK_ERROR", "서버에 연결하지 못했어요."))).toBe("서버에 연결하지 못했어요.");
  expect(isDailyLimit(new ApiError("DAILY_LIMIT_EXCEEDED", "x", 429))).toBe(true);
  expect(isDailyLimit(new ApiError("TEXT_TOO_LONG", "x", 413))).toBe(false);
  expect(dailyLimitMessage("new")).toContain("저장하지 않았어요");
  expect(dailyLimitMessage("retry")).toContain("저장돼 있으니");
});
