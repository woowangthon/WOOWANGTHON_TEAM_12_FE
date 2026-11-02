import { test, expect } from "@playwright/test";
import { fetchActivities, fetchActivity, updateActivity, updateExperience, isMockMode, ApiError } from "../src/lib/api/experience";
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
