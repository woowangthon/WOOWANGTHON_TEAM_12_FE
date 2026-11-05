// MOCK(question-draft): 초안 목의 계약 상태 전이·검증·선택 격리를 직접 확인한다.
import { test, expect } from "@playwright/test";
import { createQuestionDraft, fetchDraftQuestion } from "../src/lib/api/questions";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";

test("draft mock follows POST/GET contract, rejects invalid selections and preserves one latest result", async () => {
  const q = structuredClone(QUESTION_EXAMPLES[0]);
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  let now = originalNow();
  Date.now = () => now;
  globalThis.fetch = async () => { throw new Error("draft must never call BE or AI"); };
  try {
    expect((await fetchDraftQuestion(q)).draft).toBeNull();
    for (const experienceIds of [[], [101, 101], [101, 102, 103, 104], [102]]) {
      await expect(createQuestionDraft(q, { experienceIds })).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    }
    await expect(createQuestionDraft({ ...q, status: "ANALYZING" }, { experienceIds: [101] })).rejects.toMatchObject({ code: "QUESTION_NOT_COMPLETED", status: 409 });
    const started = await createQuestionDraft(q, { experienceIds: [101] });
    expect(started).toMatchObject({ questionId: 41, status: "ANALYZING", error: null, experienceIds: [101], sentences: [], omitted: [] });
    expect(Object.keys(started).sort()).toEqual(["questionId", "status", "error", "experienceIds", "sentences", "omitted", "createdAt", "updatedAt"].sort());
    await expect(createQuestionDraft(q, { experienceIds: [101] })).rejects.toMatchObject({ code: "DRAFT_IN_PROGRESS", status: 409 });
    now += 2000;
    const completed = (await fetchDraftQuestion(q)).draft!;
    expect(completed.status).toBe("COMPLETED");
    expect(completed.sentences.map(s => s.evidence[0].id)).toEqual([201, 301]);
    expect(completed.omitted).toHaveLength(3);
    // 근거 삭제·보완 변경 뒤에도 문장 자체는 유지한다.
    const changed = structuredClone(q);
    changed.recommendations[0].experience.citations = [];
    changed.recommendations[0].experience.supplements[0].answer = "서버에 STOMP 엔드포인트를 만들었다";
    const refreshed = (await fetchDraftQuestion(changed)).draft!;
    expect(refreshed.sentences[0].evidence).toEqual([]);
    expect(refreshed.sentences[1].text).toBe(completed.sentences[1].text);
    expect(refreshed.sentences[1].evidence[0].text).toBe(changed.recommendations[0].experience.supplements[0].answer);
    await createQuestionDraft(q, { experienceIds: [101] }, true);
    now += 2000;
    expect((await fetchDraftQuestion(q)).draft).toMatchObject({ status: "FAILED", error: { code: "AI_TIMEOUT" }, sentences: [], omitted: [] });
    await createQuestionDraft(q, { experienceIds: [101] });
    now += 2000;
    expect((await fetchDraftQuestion(q)).draft?.status).toBe("COMPLETED");
    expect((await fetchDraftQuestion(QUESTION_EXAMPLES[1])).draft).toBeNull();
  } finally { Date.now = originalNow; globalThis.fetch = originalFetch; }
});

test("only selected matched citations, supplements and USER_ENTERED bodies become draft evidence", async () => {
  const q = structuredClone(QUESTION_EXAMPLES[1]);
  const e = q.recommendations[0].experience;
  e.citations[0].matched = false;
  e.sourceStatus = "NEEDS_REVIEW";
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    await createQuestionDraft(q, { experienceIds: [102] });
    now += 2000;
    expect((await fetchDraftQuestion(q)).draft?.sentences).toEqual([]);
    e.sourceStatus = "USER_ENTERED";
    await createQuestionDraft(q, { experienceIds: [102] });
    now += 2000;
    const result = (await fetchDraftQuestion(q)).draft!;
    expect(result.experienceIds).toEqual([102]);
    expect(result.sentences).toEqual([{ text: e.content, evidence: [{ type: "EXPERIENCE", id: 102, experienceId: 102, activityId: 7, text: e.content }] }]);
    expect(result.sentences.some(s => s.text.includes("STOMP"))).toBe(false);
  } finally { Date.now = originalNow; }
});
