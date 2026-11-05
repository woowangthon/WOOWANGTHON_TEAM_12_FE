import { test, expect } from "@playwright/test";
import { fetchActivities, fetchActivity, updateActivity, updateExperience, isMockMode, ApiError, submitSource, fetchJob, retryJob, createExperience, deleteExperience } from "../src/lib/api/experience";
import { activityError, validDate } from "../src/lib/api/editing";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;

test("activity note PATCH trims, clears with null, preserves omission and returns the server value", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; method?: string; body: unknown }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: JSON.parse(options!.body as string) });
    return Response.json({ id: 7, note: "서버에서 돌려준 메모" });
  };
  expect(await updateActivity(7, { note: "  당시 생각  " })).toMatchObject({ note: "서버에서 돌려준 메모" });
  await updateActivity(7, { note: "   " });
  await updateActivity(7, { note: null });
  await updateActivity(7, { name: "이름만 수정" });
  await updateActivity(7, { note: `  ${"가".repeat(200)}  ` });
  expect(calls.map(c => c.body)).toEqual([{ note: "당시 생각" }, { note: null }, { note: null }, { name: "이름만 수정" }, { note: "가".repeat(200) }]);
  expect(calls.every(c => c.method === "PATCH" && c.url === "https://backend.example/api/activities/7")).toBe(true);
});

test("activity note rejects more than 200 UTF-16 units or newlines before HTTP and never mocks a save", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ id: 7, note: null }); };
  for (const note of ["가".repeat(201), "😀".repeat(101), "첫 줄\n둘째 줄", "첫 줄\r둘째 줄"]) {
    await expect(updateActivity(7, { note })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  }
  expect(calls).toBe(0);
  process.env.NEXT_PUBLIC_API_BASE_URL = "";
  await expect(updateActivity(7, { note: "한 줄" })).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  expect(calls).toBe(0);
});

test("note save failures and a response missing note do not look successful", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  for (const [status, code] of [[400, "INVALID_REQUEST"], [404, "ACTIVITY_NOT_FOUND"], [503, "INTERNAL_ERROR"]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "저장 실패" } }, { status });
    await expect(updateActivity(7, { note: "남길 내용" })).rejects.toMatchObject({ code, message: "저장 실패" });
  }
  globalThis.fetch = async () => Response.json({ id: 7 });
  await expect(updateActivity(7, { note: "남길 내용" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
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
  expect(calls[0].options).toEqual({ method: "GET", cache: "no-store", credentials: "include" });
});

test("PATCH sends JSON and preserves server status and citations", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; options?: RequestInit }[] = [];
  const response = { id: 101, competencies: [], sourceStatus: "USER_ENTERED", citations: [{ id: 201, quote: "original" }] };
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json(response); };
  expect(await updateExperience(101, { content: "changed", actor: "TEAM" })).toEqual(response);
  await updateActivity(7, { period: { start: "2025", end: null, ongoing: true } });
  expect(calls[0].url).toBe("https://backend.example/api/experiences/101");
  expect(calls[0].options).toEqual({ method: "PATCH", cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "changed", actor: "TEAM" }) });
  expect(calls[1].url).toBe("https://backend.example/api/activities/7");
});

test("PATCH distinguishes empty competencies from an omitted field", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const bodies: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options!.body as string));
    return Response.json({ id: 101, competencies: [], sourceStatus: "USER_ENTERED", citations: [] });
  };
  expect(await updateExperience(101, { competencies: [] })).toMatchObject({ competencies: [] });
  await updateExperience(101, { actor: "TEAM" });
  expect(bodies).toEqual([{ competencies: [] }, { actor: "TEAM" }]);
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

test("mock reads stay available; unsupported writes fail without HTTP or mutation", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  expect(isMockMode()).toBe(true);
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  const before = await fetchActivity(7);
  expect((await fetchActivities()).length).toBeGreaterThan(0);
  await expect(updateActivity(7, { name: "fake" })).rejects.toBeInstanceOf(ApiError);
  await expect(deleteExperience(101)).rejects.toMatchObject({ code: "API_NOT_CONFIGURED" });
  expect(await fetchActivity(7)).toEqual(before);
  expect(await fetchActivities("empty")).toEqual([]);
  await expect(fetchActivities("error")).rejects.toMatchObject({ code: "MOCK_ERROR" });
});

test("mock PATCH preserves competency provenance until actual change; direct POST is USER", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = async () => { throw new Error("unexpected HTTP"); };
  const original = (await fetchActivity(8)).experiences[0];
  expect(original.competenciesBy).toBe("AI");
  expect(await updateExperience(original.id, { competencies: [...original.competencies] })).toEqual(original);
  expect(await updateExperience(original.id, { content: "Content only" })).toMatchObject({ competenciesBy: "AI", sourceStatus: "USER_ENTERED", citations: original.citations });
  expect(await updateExperience(original.id, { actor: "TEAM" })).toMatchObject({ competenciesBy: "AI" });
  expect(await updateExperience(original.id, { competencies: [] })).toMatchObject({ competenciesBy: "USER", competencies: [] });
  const created = await createExperience(8, { content: "Manual", actor: "ME", competencies: ["COLLABORATION"] });
  expect(created).toMatchObject({ competenciesBy: "USER", sourceStatus: "USER_ENTERED", citations: [] });
  expect((await fetchActivity(8)).experiences.at(-1)).toEqual(created);
  const { MOCK_ACTIVITIES } = await import("../src/lib/mock/activities");
  const seed = MOCK_ACTIVITIES.find((a) => a.id === 9)!.experiences[0];
  const saved = [...seed.competencies];
  seed.competencies = ["IMPLEMENTATION", "COLLABORATION"];
  try {
    expect(await updateExperience(seed.id, { competencies: ["COLLABORATION", "IMPLEMENTATION"] })).toMatchObject({ competenciesBy: "USER" });
  } finally { seed.competencies = saved; }
});

for (const competenciesBy of ["AI", "USER", undefined]) {
  test(`real PATCH preserves server competenciesBy=${competenciesBy}`, async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
    const response = { id: 101, competencies: ["IMPLEMENTATION"], competenciesBy, sourceStatus: "USER_ENTERED", citations: [] };
    globalThis.fetch = async () => Response.json(response);
    expect(await updateExperience(101, { competencies: ["COLLABORATION"] })).toEqual(JSON.parse(JSON.stringify(response)));
  });
}

test("partial dates, leap years, real dates, empty name and reversed periods", () => {
  for (const value of [null, "2025", "2025-06", "2024-02-29", "0099-12-31", "0000", "0000-02", "0000-02-29"]) expect(validDate(value)).toBe(true);
  for (const value of ["", "2025-02-29", "2024-04-31", "2025-13", "2025-00", "2025-1", "2025-06-00", "0000-02-30", "0000-13"]) expect(validDate(value)).toBe(false);
  expect(activityError(" ", { start: null, end: null, ongoing: false })).toBeTruthy();
  expect(activityError("name", { start: "2026", end: "2025", ongoing: false })).toBeTruthy();
  expect(activityError("name", { start: null, end: "2025", ongoing: true })).toBeTruthy();
  expect(activityError("name", { start: "2025", end: null, ongoing: true })).toBeNull();
});

test("period ordering matches BE common precision, including year zero and ongoing", () => {
  const valid = [
    { start: "2025-03", end: "2025", ongoing: false },
    { start: "2025", end: "2025-03", ongoing: false },
    { start: "2025-03-31", end: "2025-03", ongoing: false },
    { start: "2025-03", end: "2025-03-01", ongoing: false },
    { start: "2024", end: "2025", ongoing: false },
    { start: "2025-01", end: "2025-12", ongoing: false },
    { start: "2025-03-01", end: "2025-03-31", ongoing: false },
    { start: "0000-02-29", end: "0000", ongoing: false },
    { start: "0000", end: "0000-12", ongoing: false },
    { start: "0000", end: null, ongoing: true },
    { start: null, end: null, ongoing: true },
    { start: "2025-03", end: null, ongoing: false },
  ];
  const invalid = [
    { start: "2026", end: "2025-12", ongoing: false },
    { start: "2026-01", end: "2025", ongoing: false },
    { start: "2025-04", end: "2025-03-31", ongoing: false },
    { start: "2025-03-31", end: "2025-03-01", ongoing: false },
    { start: "0001", end: "0000", ongoing: false },
    { start: "0000-03", end: "0000-02", ongoing: false },
    { start: "0000", end: "0000-12", ongoing: true },
  ];
  for (const period of valid) expect(activityError("name", period), JSON.stringify(period)).toBeNull();
  for (const period of invalid) expect(activityError("name", period), JSON.stringify(period)).toBeTruthy();
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
  expect(calls[0]).toEqual({ url: "https://backend.example/api/sources", options: { method: "POST", cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source) } });
  expect(JSON.parse(calls[1].options!.body as string)).toEqual({ kind: "FILE", name: "note.md", text: "file text" });
  expect(calls[2]).toEqual({ url: "https://backend.example/api/jobs/34", options: { method: "GET", cache: "no-store", credentials: "include" } });
  expect(calls[3]).toEqual({ url: "https://backend.example/api/jobs/34/retry", options: { method: "POST", cache: "no-store", credentials: "include" } });
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

test("experience POST returns the server record; DELETE accepts empty 204 without JSON or request body", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  const calls: { url: string; options?: RequestInit }[] = [];
  const experience = { id: 107, activityId: 7, content: "Manual", competencies: ["COLLABORATION"], actor: "ME", sourceStatus: "USER_ENTERED", citations: [] };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return options?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(experience, { status: 201 });
  };
  const body = { content: "Manual", competencies: ["COLLABORATION" as const], actor: "ME" as const };
  expect(await createExperience(7, body)).toEqual(experience);
  expect(await deleteExperience(107)).toBeUndefined();
  expect(calls).toEqual([
    { url: "https://backend.example/api/activities/7/experiences", options: { method: "POST", cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } },
    { url: "https://backend.example/api/experiences/107", options: { method: "DELETE", cache: "no-store", credentials: "include" } },
  ]);
});

test("experience mutations propagate HTTP and network errors; old perspective responses are rejected", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://backend.example/api";
  for (const [status, code] of [[400, "INVALID_REQUEST"], [404, "ACTIVITY_NOT_FOUND"]] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "Create rejected" } }, { status });
    await expect(createExperience(7, { content: "Manual", actor: "ME" })).rejects.toMatchObject({ code, status });
  }
  globalThis.fetch = async () => Response.json({ error: { code: "EXPERIENCE_NOT_FOUND", message: "Missing" } }, { status: 404 });
  await expect(deleteExperience(107)).rejects.toMatchObject({ code: "EXPERIENCE_NOT_FOUND", status: 404 });
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await expect(deleteExperience(107)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  for (const competencies of [undefined, null, ["UNKNOWN"], ["PLANNING", "PLANNING"], ["PLANNING", "ANALYSIS", "OPERATION", "LEARNING"]]) {
    globalThis.fetch = async () => Response.json({ id: 7, experiences: [{ id: 101, perspective: null, competencies }] });
    await expect(fetchActivity(7)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  }
});
