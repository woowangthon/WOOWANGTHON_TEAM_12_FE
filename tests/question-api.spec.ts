import { test, expect } from "@playwright/test";
import { fetchQuestion, fetchQuestions, retryQuestion, submitQuestion } from "../src/lib/api/questions";
import { QUESTION_EXAMPLES } from "../src/lib/mock/question-examples";
import { QUESTION_ANALYSIS_MS, QUESTION_STORAGE_KEY, questionMockActivities, selectedMockQuestion, selectMockQuestion } from "../src/lib/mock/questions";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = 0;

test.beforeEach(() => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  clock = originalNow();
  Date.now = () => clock;
  globalThis.fetch = async () => { throw new Error("Question mock must not call a server"); };
});
test.afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
});

test("question examples preserve 41/42 order, actors, citations and supplement 301", async () => {
  expect((await fetchQuestions()).map(q => [q.id, q.applicationId])).toEqual([[42, 22], [41, 21]]);
  const a = await fetchQuestion(41);
  const b = await fetchQuestion(42);
  expect(a.applicationId).toBe(21);
  expect(b.applicationId).toBe(22);
  expect(a.recommendations.map(r => r.experience.id)).toEqual([101]);
  expect(b.recommendations.map(r => r.experience.id)).toEqual([102, 101]);
  expect(a.recommendations).toEqual(QUESTION_EXAMPLES[0].recommendations);
  expect(b.recommendations).toEqual(QUESTION_EXAMPLES[1].recommendations);
  expect(b.recommendations[0].experience.actor).toBe("TEAM");
  expect(b.recommendations[1].evidence).toContainEqual({ type: "SUPPLEMENT", id: 301 });
  for (const q of [a, b]) for (const r of q.recommendations) {
    expect(r.experience.competenciesBy).toBe("AI");
    for (const ref of r.evidence) expect((ref.type === "CITATION" ? r.experience.citations : r.experience.supplements).some(item => item.id === ref.id)).toBe(true);
  }
  expect(a.clarifications.find(c => c.id === 61)?.supplementId).toBe(301);
  const activity = questionMockActivities().find(a => a.id === 7)!;
  expect(activity.experiences.find(e => e.id === 101)).toEqual(b.recommendations[1].experience);
});

test("question input limits, optional organization and persisted ANALYZING completion", async () => {
  await expect(submitQuestion({ text: " \n " })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(submitQuestion({ text: "x".repeat(5001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  await expect(submitQuestion({ text: "valid", organization: "x".repeat(101) })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  const created = await submitQuestion({ text: "x".repeat(5000) });
  expect(created).toEqual({ questionId: 43, applicationId: 23, status: "ANALYZING" });
  expect(await fetchQuestion(43)).toMatchObject({ applicationId: 23, organization: null, requirements: [], recommendations: [], clarifications: [], error: null });
  const persisted = localStorage.getItem(QUESTION_STORAGE_KEY)!;
  expect(JSON.parse(persisted).selectedId).toBe(43);
  expect((await fetchQuestions())[0].id).toBe(43);
  clock += QUESTION_ANALYSIS_MS - 1;
  expect((await fetchQuestion(43)).status).toBe("ANALYZING");
  clock += 1;
  expect(await fetchQuestion(43)).toMatchObject({ status: "COMPLETED", text: "x".repeat(5000) });
  expect((await fetchQuestion(43)).recommendations.map(r => r.experience.id)).toEqual([101]);
  expect((await fetchQuestions())[0].status).toBe("COMPLETED");
  expect((await submitQuestion({ organization: "o".repeat(100), text: QUESTION_EXAMPLES[1].text })).questionId).toBe(44);
  clock += QUESTION_ANALYSIS_MS;
  expect((await fetchQuestion(44)).recommendations.map(r => r.experience.id)).toEqual([102, 101]);
});

test("failed question retry keeps ID, input, creation time and list size", async () => {
  const { questionId } = await submitQuestion({ organization: "Org", text: "Failure example" }, "fail");
  const before = await fetchQuestion(questionId);
  clock += QUESTION_ANALYSIS_MS;
  expect(await fetchQuestion(questionId)).toMatchObject({ status: "FAILED", error: { code: "AI_TIMEOUT" }, requirements: [], recommendations: [], clarifications: [] });
  expect(await retryQuestion(questionId)).toMatchObject({ id: questionId, applicationId: before.applicationId, status: "ANALYZING", text: before.text, createdAt: before.createdAt, error: null, recommendations: [] });
  expect(await fetchQuestions()).toHaveLength(3);
  await expect(retryQuestion(questionId)).rejects.toMatchObject({ code: "QUESTION_NOT_FAILED" });
  clock += QUESTION_ANALYSIS_MS;
  expect((await fetchQuestion(questionId)).status).toBe("COMPLETED");
  expect(await fetchQuestions()).toHaveLength(3);
});

test("empty recommendations remain NOT_FOUND; selecting a question persists", async () => {
  const { questionId } = await submitQuestion({ text: "Empty result" }, "empty");
  clock += QUESTION_ANALYSIS_MS;
  const result = await fetchQuestion(questionId);
  expect(result).toMatchObject({ status: "COMPLETED", recommendations: [], clarifications: [] });
  expect(result.requirements.every(r => r.status === "NOT_FOUND" && r.experienceIds.length === 0)).toBe(true);
  selectMockQuestion(41);
  expect(selectedMockQuestion()).toBe(41);
  await expect(fetchQuestion(99999)).rejects.toMatchObject({ code: "QUESTION_NOT_FOUND" });
  await expect(retryQuestion(99999)).rejects.toMatchObject({ code: "QUESTION_NOT_FOUND" });
});

test("storage errors never pretend a question was saved or erase damaged records", async () => {
  await fetchQuestions();
  const before = localStorage.getItem(QUESTION_STORAGE_KEY);
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("Storage full"); };
  await expect(submitQuestion({ text: "Not saved" })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  expect(localStorage.getItem(QUESTION_STORAGE_KEY)).toBe(before);
  localStorage.setItem = setItem;
  localStorage.setItem(QUESTION_STORAGE_KEY, "broken JSON");
  await expect(fetchQuestions()).rejects.toMatchObject({ code: "INVALID_STORAGE" });
  expect(localStorage.getItem(QUESTION_STORAGE_KEY)).toBe("broken JSON");
});

test("pre-64 saved questions gain applicationId without resetting results or pending analysis", async () => {
  const pending = await submitQuestion({ text: "Existing pending question" });
  const completed = await fetchQuestion(41);
  const before = JSON.parse(localStorage.getItem(QUESTION_STORAGE_KEY)!);
  const legacy = JSON.parse(JSON.stringify(before));
  for (const q of legacy.questions) delete q.detail.applicationId;
  localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(legacy));
  expect((await fetchQuestions()).map(q => [q.id, q.applicationId])).toEqual([[43, 23], [42, 22], [41, 21]]);
  expect(await fetchQuestion(41)).toEqual(completed);
  expect(selectedMockQuestion()).toBe(pending.questionId);
  const migrated = JSON.parse(localStorage.getItem(QUESTION_STORAGE_KEY)!);
  expect(migrated.questions.at(-1).startedAt).toBe(before.questions.at(-1).startedAt);
  expect((await fetchQuestion(pending.questionId)).status).toBe("ANALYZING");
  const next = await submitQuestion({ text: "Another single question" });
  expect(next.applicationId).toBe(24);
  clock += QUESTION_ANALYSIS_MS;
  expect((await fetchQuestion(pending.questionId)).applicationId).toBe(23);
});

test("applications group questions in submitted order and enforce contract limits", async () => {
  const { submitApplication, addApplicationQuestion, fetchApplications, fetchApplication } = await import("../src/lib/api/questions");
  const { applicationId, questionIds } = await submitApplication({ organization: " OO 부트캠프 ", questions: [{ text: "가" }, { text: "나" }] });
  expect(questionIds).toHaveLength(2);
  const app = await fetchApplication(applicationId);
  expect(app.organization).toBe("OO 부트캠프");
  expect(app.questions.map(q => q.text)).toEqual(["가", "나"]);
  expect((await fetchApplications())[0].id).toBe(applicationId);
  const { questionId } = await addApplicationQuestion(applicationId, { text: "다" });
  expect((await fetchApplication(applicationId)).questions.at(-1)?.id).toBe(questionId);
  await expect(submitApplication({ questions: [] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(submitApplication({ questions: Array.from({ length: 11 }, () => ({ text: "x" })) })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(submitApplication({ questions: [{ text: "x" }, { text: " " }] })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  await expect(submitApplication({ questions: [{ text: "x" }] }, "limit")).rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED" });
  await expect(addApplicationQuestion(9999, { text: "x" })).rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND" });
  for (let i = 0; i < 17; i++) await addApplicationQuestion(applicationId, { text: `q${i}` });
  await expect(addApplicationQuestion(applicationId, { text: "21번째" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
});

// FE#31 — 되묻기 답 → 그 경험의 보완(S-23) · 다른 문항에서 다시 묻지 않기(S-25 모양)
test("answering a clarification stores a supplement on that experience only and never rewrites the experience", async () => {
  const { answerClarification } = await import("../src/lib/api/questions");
  const before = await fetchQuestion(41);
  await expect(answerClarification(62, { answer: "  " })).rejects.toMatchObject({ code: "EMPTY_ANSWER" });
  await expect(answerClarification(62, { answer: "x".repeat(2001) })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(answerClarification(9999, { answer: "x" })).rejects.toMatchObject({ code: "CLARIFICATION_NOT_FOUND" });
  await expect(answerClarification(61, { answer: "x" })).rejects.toMatchObject({ code: "CLARIFICATION_ALREADY_ANSWERED" });
  const answered = await answerClarification(62, { answer: "두 기기로 동시에 보내 보며 지연을 확인했다" });
  expect(answered).toMatchObject({ experienceId: 101, supplement: { id: 302, question: before.clarifications[1].question, answer: "두 기기로 동시에 보내 보며 지연을 확인했다", questionId: 41 } });
  await expect(answerClarification(62, { answer: "again" })).rejects.toMatchObject({ code: "CLARIFICATION_ALREADY_ANSWERED" });
  const after = await fetchQuestion(41);
  expect(after.clarifications.find(c => c.id === 62)?.supplementId).toBe(302);
  const { supplements, ...experience } = after.recommendations[0].experience;
  const { supplements: oldSupplements, ...oldExperience } = before.recommendations[0].experience;
  expect(experience).toEqual(oldExperience);
  expect(supplements.map(s => s.id)).toEqual([...oldSupplements.map(s => s.id), 302]);
  expect(after.recommendations[0].evidence).toEqual(before.recommendations[0].evidence);
  // 다른 문항(42)의 같은 경험에도 지금 보완이 실리고, 활동 세부에도 보인다
  expect((await fetchQuestion(42)).recommendations[1].experience.supplements.map(s => s.id)).toEqual([301, 302]);
  const activity = questionMockActivities().find(a => a.id === 7)!;
  expect(activity.experiences.find(e => e.id === 101)?.supplements?.map(s => s.id)).toEqual([301, 302]);
  expect(activity.experiences.find(e => e.id === 102)?.supplements).toEqual([]);
});

test("a later question gets fresh clarification IDs and does not re-ask facts already in supplements", async () => {
  const { answerClarification } = await import("../src/lib/api/questions");
  const { questionId } = await submitQuestion({ text: "기술 문제 해결 다른 지원" });
  clock += QUESTION_ANALYSIS_MS;
  const q = await fetchQuestion(questionId);
  // 61 은 보완 301 로 이미 답해서 빠지고, 62 는 새 ID · 아직 답 안 함
  expect(q.clarifications).toEqual([{ id: 64, experienceId: 101, question: QUESTION_EXAMPLES[0].clarifications[1].question, supplementId: null }]);
  await answerClarification(64, { answer: "확인 방법" });
  expect((await fetchQuestion(41)).clarifications.find(c => c.id === 62)?.supplementId).toBeNull();
  const { questionId: third } = await submitQuestion({ text: "또 다른 기술 문항" });
  clock += QUESTION_ANALYSIS_MS;
  expect((await fetchQuestion(third)).clarifications).toEqual([]);
});

test("pre-FE#31 saved records gain example supplements and unique clarification IDs", async () => {
  const { questionId } = await submitQuestion({ text: "옛 기록" });
  clock += QUESTION_ANALYSIS_MS;
  await fetchQuestion(questionId);
  const legacy = JSON.parse(localStorage.getItem(QUESTION_STORAGE_KEY)!);
  delete legacy.supplements;
  legacy.questions.at(-1).detail.clarifications = structuredClone(QUESTION_EXAMPLES[0].clarifications);
  localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(legacy));
  const ids = (await Promise.all([41, 42, questionId].map(id => fetchQuestion(id)))).flatMap(q => q.clarifications.map(c => c.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect((await fetchQuestion(41)).recommendations[0].experience.supplements.map(s => s.id)).toEqual([301]);
});
