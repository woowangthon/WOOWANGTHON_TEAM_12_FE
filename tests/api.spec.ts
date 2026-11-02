import { test, expect } from "@playwright/test";
import { fetchActivities, fetchActivity, updateActivity, updateExperience, isMockMode, ApiError, submitSource, fetchJob, retryJob } from "../src/lib/api/experience";
import { activityError, validDate } from "../src/lib/api/editing";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("GET unwraps activities, uses configured base, no auth, no cache", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api/";
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(String(url).endsWith("/activities") ? { activities: [{ id: 7 }] } : { id: 7, experiences: [] });
  };
  expect(await fetchActivities("error")).toEqual([{ id: 7 }]);
  expect(await fetchActivity(7)).toEqual({ id: 7, experiences: [] });
  expect(calls.map((c) => c.url)).toEqual(["https://backend.example/api/activities", "https://backend.example/api/activities/7"]);
  expect(calls[0].options).toEqual({ method: "GET", cache: "no-store" });
});

test("PATCH sends JSON and preserves server status and citations", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; options?: RequestInit }[] = [];
  const response = { id: 101, sourceStatus: "USER_ENTERED", citations: [{ id: 201, quote: "original" }] };
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json(response); };
  expect(await updateExperience(101, { content: "changed", actor: "TEAM" })).toEqual(response);
  await updateActivity(7, { period: { start: "2025", end: null, ongoing: true } });
  expect(calls[0].url).toBe("https://backend.example/api/experiences/101");
  expect(calls[0].options).toEqual({ method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "changed", actor: "TEAM" }) });
  expect(calls[1].url).toBe("https://backend.example/api/activities/7");
});

test("PATCH distinguishes explicit null perspective from an omitted field", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const bodies: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options!.body as string));
    return Response.json({ id: 101, perspective: null, sourceStatus: "USER_ENTERED", citations: [] });
  };
  expect(await updateExperience(101, { perspective: null })).toMatchObject({ perspective: null });
  await updateExperience(101, { actor: "TEAM" });
  expect(bodies).toEqual([{ perspective: null }, { actor: "TEAM" }]);
});

test("HTTP, network and invalid JSON errors remain distinguishable; never fallback", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  globalThis.fetch = async () => Response.json({ error: { code: "INVALID_PERIOD", message: "period rejected" } }, { status: 400 });
  await expect(updateActivity(7, { name: "changed" })).rejects.toMatchObject({ code: "INVALID_PERIOD", message: "period rejected", status: 400 });
  globalThis.fetch = async () => { throw new TypeError("network failed"); };
  await expect(fetchActivities()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  globalThis.fetch = async () => new Response("<html>Access denied</html>", { status: 403 });
  await expect(fetchActivity(7)).rejects.toMatchObject({ code: "HTTP_403", status: 403 });
  globalThis.fetch = async () => new Response("invalid", { status: 200 });
  await expect(fetchActivity(7)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  for (const code of ["ACTIVITY_NOT_FOUND", "EXPERIENCE_NOT_FOUND"]) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "Resource missing" } }, { status: 404 });
    const request = code === "ACTIVITY_NOT_FOUND" ? fetchActivity(999999) : updateExperience(999999, { actor: "ME" });
    await expect(request).rejects.toMatchObject({ code, message: "Resource missing", status: 404 });
  }
});

test("mock reads stay available, mock writes fail without HTTP or mutation", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  expect(isMockMode()).toBe(true);
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  const before = await fetchActivity(7);
  expect((await fetchActivities()).length).toBeGreaterThan(0);
  await expect(updateActivity(7, { name: "fake" })).rejects.toBeInstanceOf(ApiError);
  await expect(updateExperience(101, { content: "fake" })).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  expect(await fetchActivity(7)).toEqual(before);
  expect(await fetchActivities("empty")).toEqual([]);
  await expect(fetchActivities("error")).rejects.toMatchObject({ code: "MOCK_ERROR" });
});

test("partial dates, leap years, real dates, empty name and reversed periods", () => {
  for (const value of [null, "2025", "2025-06", "2024-02-29", "0099-12-31"]) expect(validDate(value)).toBe(true);
  for (const value of ["", "2025-02-29", "2024-04-31", "2025-13", "2025-00", "2025-1", "0000", "2025-06-00"]) expect(validDate(value)).toBe(false);
  expect(activityError(" ", { start: null, end: null, ongoing: false })).toBeTruthy();
  expect(activityError("name", { start: "2026", end: "2025", ongoing: false })).toBeTruthy();
  expect(activityError("name", { start: null, end: "2025", ongoing: true })).toBeTruthy();
  expect(activityError("name", { start: "2025", end: null, ongoing: true })).toBeNull();
});

test("source POST, job GET and bodyless retry POST follow the BE contract", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; options?: RequestInit }[] = [];
  const job = { jobId: 34, sourceId: 12, status: "ANALYZING", activityIds: [], error: null, createdAt: "2026-11-02T21:00:00+09:00", updatedAt: "2026-11-02T21:00:00+09:00" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(String(url).endsWith("/sources") ? { sourceId: 12, jobId: 34, status: "ANALYZING" } : job, { status: options?.method === "POST" ? 202 : 200 });
  };
  const source = { kind: "TEXT" as const, name: null, text: "원본\ntext" };
  expect(await submitSource(source, "fail")).toEqual({ sourceId: 12, jobId: 34, status: "ANALYZING" });
  await submitSource({ kind: "FILE", name: "note.md", text: "file text" });
  expect(await fetchJob(34)).toEqual(job);
  expect(await retryJob(34)).toEqual(job);
  expect(calls[0]).toEqual({ url: "https://backend.example/api/sources", options: { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source) } });
  expect(JSON.parse(calls[1].options!.body as string)).toEqual({ kind: "FILE", name: "note.md", text: "file text" });
  expect(calls[2]).toEqual({ url: "https://backend.example/api/jobs/34", options: { method: "GET", cache: "no-store" } });
  expect(calls[3]).toEqual({ url: "https://backend.example/api/jobs/34/retry", options: { method: "POST", cache: "no-store" } });
});

test("source limit uses UTF-16 length; source and retry errors never fallback", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ sourceId: 12, jobId: 34, status: "ANALYZING" }); };
  await submitSource({ kind: "TEXT", name: null, text: "😀".repeat(25000) });
  await expect(submitSource({ kind: "TEXT", name: null, text: "😀".repeat(25000) + "a" })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  await expect(submitSource({ kind: "TEXT", name: null, text: " \n " })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  expect(calls).toBe(1);
  for (const [code, status] of [["EMPTY_TEXT", 400], ["UNSUPPORTED_FILE_TYPE", 400], ["TEXT_TOO_LONG", 413], ["INVALID_REQUEST", 400]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "Source rejected" } }, { status });
    await expect(submitSource({ kind: "TEXT", name: null, text: "text" })).rejects.toMatchObject({ code, status });
  }
  globalThis.fetch = async () => Response.json({ error: { code: "JOB_NOT_FAILED", message: "Not failed" } }, { status: 409 });
  await expect(retryJob(34)).rejects.toMatchObject({ code: "JOB_NOT_FAILED", status: 409 });
  globalThis.fetch = async () => Response.json({ error: { code: "JOB_NOT_FOUND", message: "Not found" } }, { status: 404 });
  await expect(fetchJob(34)).rejects.toMatchObject({ code: "JOB_NOT_FOUND", status: 404 });
});
