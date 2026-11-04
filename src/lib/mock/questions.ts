// MOCK(question-matching): 문항·선택·분석 시작 시각을 localStorage에 저장한다. 서버·AI를 호출하지 않는다.
// 임의 문항은 기술 예시, 문항 42와 같은 텍스트는 협업 예시로 끝난다. 실제 내용 분석이 아니다.
// 지원(FE#38)은 따로 저장하지 않고 문항의 applicationId 로 묶어 계약의 Application 모양으로 돌려준다.
// 되묻기 답(FE#31)은 경험 ID 별 보완으로 보관하고, 문항 · 활동 세부를 돌려줄 때 경험에 지금 보완을 싣는다.
import { ApiError } from "../api/errors";
import { MAX_ANSWER_LENGTH, MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, MAX_QUESTIONS_PER_APPLICATION, MAX_QUESTIONS_PER_SUBMIT, type AddQuestionRequest, type Application, type ApplicationSubmitted, type ClarificationAnswered, type CreateApplicationRequest, type CreateQuestionRequest, type QuestionAdded, type QuestionDetail, type QuestionSubmitted, type QuestionSummary } from "../api/question-types";
import type { ActivityDetail, Supplement } from "../api/types";
import { QUESTION_EXAMPLES } from "./question-examples";
import { MOCK_ACTIVITIES } from "./activities";

export const QUESTION_STORAGE_KEY = "mock:question-matching:v1";
export const QUESTION_ANALYSIS_MS = 3000;
/** limit — 넣을 때 429 DAILY_LIMIT_EXCEEDED(아무것도 저장하지 않는다) */
export type MockQuestionScenario = "ok" | "fail" | "empty" | "limit";
type StoredQuestion = { detail: QuestionDetail; templateId: number; scenario: MockQuestionScenario; startedAt: number };
/** supplements — 경험 ID → 그 경험에 쌓인 보완(만든 순서). 계약에서 보완은 문항이 아니라 경험에 딸린다 */
type Store = { questions: StoredQuestion[]; selectedId: number | null; supplements: Record<string, Supplement[]> };

/** 계약 예시의 보완(301)을 처음 상태로 — 문항 41 에서 답했고 문항 42 에서 근거로 쓰인다(S-25) */
function exampleSupplements(): Record<string, Supplement[]> {
  const out: Record<string, Supplement[]> = {};
  for (const sample of QUESTION_EXAMPLES) for (const { experience } of sample.recommendations) {
    const list = out[experience.id] ??= [];
    for (const supplement of experience.supplements) if (!list.some(s => s.id === supplement.id)) list.push(structuredClone(supplement));
  }
  return out;
}

function write(store: Store) {
  try { localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(store)); }
  catch { throw new ApiError("STORAGE_UNAVAILABLE", "이 브라우저에 문항을 보관하지 못했어요. 저장소 설정을 확인한 뒤 다시 시도해 주세요."); }
}

function read(): Store {
  let raw: string | null;
  try { raw = localStorage.getItem(QUESTION_STORAGE_KEY); }
  catch { throw new ApiError("STORAGE_UNAVAILABLE", "브라우저에 보관한 문항을 읽지 못했어요."); }
  if (raw === null) {
    // 계약 예시의 날짜는 가상 시각이므로 목록용 시간만 첫 방문 시각에 맞춘다. 새 입력이 맨 위에 온다.
    const questions = QUESTION_EXAMPLES.map((sample, i) => {
      const detail = structuredClone(sample);
      detail.createdAt = new Date(Date.now() - (2 - i) * 600000).toISOString();
      detail.updatedAt = detail.createdAt;
      return { detail, templateId: sample.id, scenario: "ok" as const, startedAt: 0 };
    });
    const store = { questions, selectedId: 42, supplements: exampleSupplements() };
    write(store);
    return store;
  }
  try {
    const store: Store = JSON.parse(raw);
    if (!Array.isArray(store.questions) || !store.questions.every(q =>
      q.detail && Number.isSafeInteger(q.detail.id) && typeof q.detail.text === "string"
      && (q.detail.applicationId === undefined || (Number.isSafeInteger(q.detail.applicationId) && q.detail.applicationId > 0))
      && ["ANALYZING", "COMPLETED", "FAILED"].includes(q.detail.status)
      && Array.isArray(q.detail.requirements) && Array.isArray(q.detail.recommendations)
      && Array.isArray(q.detail.clarifications) && Number.isFinite(q.startedAt)
      && QUESTION_EXAMPLES.some(sample => sample.id === q.templateId)
      && ["ok", "fail", "empty", "limit"].includes(q.scenario))) throw new Error("Invalid store");
    // #64 이전에 보관한 목 기록만 보완한다. 문항 ID·선택·상태·결과는 유지한다.
    let nextApplicationId = Math.max(22, ...store.questions.map(q => q.detail.applicationId ?? 0)) + 1;
    let upgraded = false;
    for (const q of store.questions) if (q.detail.applicationId === undefined) {
      q.detail.applicationId = QUESTION_EXAMPLES.find(sample => sample.id === q.detail.id)?.applicationId ?? nextApplicationId++;
      upgraded = true;
    }
    // FE#31 이전 기록 — 보완 칸을 예시로 채우고, 템플릿에서 그대로 복사돼 겹친 되묻기 ID 를 새로 붙인다(답하기가 ID 로 찾으므로)
    if (store.supplements === undefined) {
      store.supplements = exampleSupplements();
      const seen = new Set<number>();
      let nextId = Math.max(0, ...store.questions.flatMap(q => q.detail.clarifications.map(c => c.id))) + 1;
      for (const q of store.questions) for (const c of q.detail.clarifications) {
        if (seen.has(c.id)) c.id = nextId++;
        seen.add(c.id);
      }
      upgraded = true;
    } else if (typeof store.supplements !== "object" || store.supplements === null || !Object.values(store.supplements).every(Array.isArray)) throw new Error("Invalid store");
    if (upgraded) write(store);
    return store;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("INVALID_STORAGE", "보관한 문항 기록을 읽지 못했어요. 기록을 임의로 지우지 않았어요.");
  }
}

function settle(store: Store) {
  let changed = false;
  for (const q of store.questions) {
    if (q.detail.status !== "ANALYZING" || Date.now() - q.startedAt < QUESTION_ANALYSIS_MS) continue;
    changed = true;
    q.detail.updatedAt = new Date().toISOString();
    if (q.scenario === "fail") {
      q.detail.status = "FAILED";
      q.detail.error = { code: "AI_TIMEOUT", message: "목 실패 시나리오예요. 실제 AI 서버를 호출하지 않았어요." };
      continue;
    }
    const example = QUESTION_EXAMPLES.find(sample => sample.id === q.templateId)!;
    q.detail.status = "COMPLETED";
    q.detail.error = null;
    q.detail.requirements = structuredClone(example.requirements);
    q.detail.recommendations = q.scenario === "empty" ? [] : structuredClone(example.recommendations);
    // 새로 끝난 문항의 되묻기는 새 ID · 아직 답 안 함. 그 경험의 보완에 이미 있는 질문은 다시 묻지 않는다(S-25 모양만 재현)
    let nextClarificationId = Math.max(0, ...store.questions.flatMap(other => other.detail.clarifications.map(c => c.id))) + 1;
    q.detail.clarifications = q.scenario === "empty" ? [] : example.clarifications
      .filter(c => !(store.supplements[c.experienceId] ?? []).some(s => s.question === c.question))
      .map(c => ({ ...c, id: nextClarificationId++, supplementId: null }));
    if (q.scenario === "empty") q.detail.requirements = q.detail.requirements.map(r => ({ ...r, status: "NOT_FOUND", experienceIds: [] }));
  }
  if (changed) write(store);
  return store;
}

const summary = ({ detail }: StoredQuestion): QuestionSummary => ({
  id: detail.id, applicationId: detail.applicationId, organization: detail.organization, text: detail.text, status: detail.status, createdAt: detail.createdAt,
});

export function mockFetchQuestions(): QuestionSummary[] {
  return settle(read()).questions.map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

function applicationsOf(store: Store): Application[] {
  const groups = new Map<number, StoredQuestion[]>();
  for (const q of store.questions) groups.set(q.detail.applicationId, [...(groups.get(q.detail.applicationId) ?? []), q]);
  return [...groups].map(([id, qs]) => {
    const questions = qs.map(summary).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
    return { id, organization: questions[0].organization, questions, createdAt: questions[0].createdAt };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function mockFetchApplications(): Application[] { return applicationsOf(settle(read())); }

export function mockFetchApplication(id: number): Application {
  const application = applicationsOf(settle(read())).find(a => a.id === id);
  if (!application) throw new ApiError("APPLICATION_NOT_FOUND", "지원을 찾지 못했어요.");
  return application;
}

function validateText(text: string) {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "지원 문항을 입력해 주세요.");
  if (text.length > MAX_QUESTION_LENGTH) throw new ApiError("TEXT_TOO_LONG", "지원 문항은 5,000자까지 입력할 수 있어요.");
}
const limitError = () => new ApiError("DAILY_LIMIT_EXCEEDED", "오늘 분석 횟수를 다 썼어요. 내일 다시 넣어 주세요.", 429);

/** 문항 하나를 분석 중으로 넣는다. 저장(write)은 부르는 쪽이 한 번에 */
function push(store: Store, applicationId: number, organization: string | null, text: string, scenario: MockQuestionScenario, now: string) {
  const id = Math.max(42, ...store.questions.map(q => q.detail.id)) + 1;
  const templateId = text.trim() === QUESTION_EXAMPLES[1].text ? 42 : 41;
  store.questions.push({ templateId, scenario, startedAt: Date.now(), detail: {
    id, applicationId, organization, text, status: "ANALYZING", error: null,
    requirements: [], recommendations: [], clarifications: [], createdAt: now, updatedAt: now,
  } });
  return id;
}

export function mockSubmitApplication(req: CreateApplicationRequest, scenario: MockQuestionScenario): ApplicationSubmitted {
  if (!Array.isArray(req.questions) || req.questions.length === 0 || req.questions.length > MAX_QUESTIONS_PER_SUBMIT) throw new ApiError("INVALID_REQUEST", "문항은 한 번에 1 ~ 10개까지 넣을 수 있어요.");
  for (const q of req.questions) validateText(q.text);
  if ((req.organization?.length ?? 0) > MAX_ORGANIZATION_LENGTH) throw new ApiError("INVALID_REQUEST", "지원처 이름은 100자까지 입력할 수 있어요.");
  if (scenario === "limit") throw limitError();
  const store = read();
  const applicationId = Math.max(22, ...store.questions.map(q => q.detail.applicationId)) + 1;
  const now = new Date().toISOString();
  const organization = req.organization?.trim() || null;
  const questionIds = req.questions.map(q => push(store, applicationId, organization, q.text, scenario, now));
  store.selectedId = questionIds[0];
  write(store);
  return { applicationId, questionIds };
}

export function mockAddQuestion(applicationId: number, req: AddQuestionRequest, scenario: MockQuestionScenario): QuestionAdded {
  validateText(req.text);
  const store = read();
  const siblings = store.questions.filter(q => q.detail.applicationId === applicationId);
  if (!siblings.length) throw new ApiError("APPLICATION_NOT_FOUND", "지원을 찾지 못했어요.");
  if (siblings.length >= MAX_QUESTIONS_PER_APPLICATION) throw new ApiError("INVALID_REQUEST", "지원 하나에 문항은 20개까지 넣을 수 있어요.");
  if (scenario === "limit") throw limitError();
  const questionId = push(store, applicationId, siblings[0].detail.organization, req.text, scenario, new Date().toISOString());
  store.selectedId = questionId;
  write(store);
  return { questionId, status: "ANALYZING" };
}

/** 추천의 `experience` 는 지금 상태로(question-api.md) — 문항 뒤에 생긴 보완도 보인다. `evidence` 는 추천했을 때 그대로 */
function withSupplements(store: Store, detail: QuestionDetail): QuestionDetail {
  const out = structuredClone(detail);
  for (const r of out.recommendations) r.experience.supplements = structuredClone(store.supplements[r.experience.id] ?? []);
  return out;
}

export function mockFetchQuestion(id: number): QuestionDetail {
  const store = settle(read());
  const q = store.questions.find(q => q.detail.id === id);
  if (!q) throw new ApiError("QUESTION_NOT_FOUND", "문항을 찾지 못했어요.");
  return withSupplements(store, q.detail);
}

/** 되묻기에 답하기 — 답을 그 경험의 보완으로 쌓는다. 경험 본문 · 근거 · 출처 상태는 건드리지 않는다(S-23) */
export function mockAnswerClarification(clarificationId: number, answer: string): ClarificationAnswered {
  if (typeof answer !== "string") throw new ApiError("INVALID_REQUEST", "답을 입력해 주세요.");
  if (!answer.trim()) throw new ApiError("EMPTY_ANSWER", "답을 입력해 주세요.");
  if (answer.length > MAX_ANSWER_LENGTH) throw new ApiError("INVALID_REQUEST", "답은 2,000자까지 입력할 수 있어요.");
  const store = read();
  const owner = store.questions.find(q => q.detail.clarifications.some(c => c.id === clarificationId));
  const clarification = owner?.detail.clarifications.find(c => c.id === clarificationId);
  if (!owner || !clarification) throw new ApiError("CLARIFICATION_NOT_FOUND", "질문을 찾지 못했어요.", 404);
  if (clarification.supplementId !== null) throw new ApiError("CLARIFICATION_ALREADY_ANSWERED", "이미 답한 질문이에요.", 409);
  const now = new Date().toISOString();
  const id = Math.max(300, ...Object.values(store.supplements).flat().map(s => s.id)) + 1;
  const supplement: Supplement = { id, question: clarification.question, answer, questionId: owner.detail.id, createdAt: now, updatedAt: now };
  (store.supplements[clarification.experienceId] ??= []).push(supplement);
  clarification.supplementId = id;
  write(store);
  return { experienceId: clarification.experienceId, supplement: structuredClone(supplement) };
}

export function mockSubmitQuestion(req: CreateQuestionRequest, scenario: MockQuestionScenario): QuestionSubmitted {
  const { applicationId, questionIds: [id] } = mockSubmitApplication({ organization: req.organization, questions: [{ text: req.text }] }, scenario);
  return { questionId: id, applicationId, status: "ANALYZING" };
}

export function mockRetryQuestion(id: number): QuestionDetail {
  const store = settle(read());
  const q = store.questions.find(q => q.detail.id === id);
  if (!q) throw new ApiError("QUESTION_NOT_FOUND", "문항을 찾지 못했어요.");
  if (q.detail.status !== "FAILED") throw new ApiError("QUESTION_NOT_FAILED", "실패한 문항만 다시 시도할 수 있어요.");
  q.scenario = "ok";
  q.startedAt = Date.now();
  q.detail = { ...q.detail, status: "ANALYZING", error: null, requirements: [], recommendations: [], clarifications: [], updatedAt: new Date().toISOString() };
  write(store);
  return structuredClone(q.detail);
}

export function selectedMockQuestion(): number | null { return read().selectedId; }
export function selectMockQuestion(id: number) {
  const store = read();
  if (!store.questions.some(q => q.detail.id === id)) throw new ApiError("QUESTION_NOT_FOUND", "문항을 찾지 못했어요.");
  store.selectedId = id;
  write(store);
}

/** 추천의 활동 세부도 목 데이터만 쓴다. 기존 타임라인의 실제 API 분기는 바꾸지 않는다. */
export function questionMockActivities(): ActivityDetail[] {
  const { supplements } = read();
  const activities = structuredClone(MOCK_ACTIVITIES);
  for (const sample of QUESTION_EXAMPLES) for (const recommendation of sample.recommendations) {
    const activity = activities.find(a => a.id === recommendation.activity.id);
    if (!activity) continue;
    activity.experiences = activity.experiences.map(e => e.id === recommendation.experience.id ? structuredClone(recommendation.experience) : e);
  }
  for (const activity of activities) activity.experiences = activity.experiences.map(e => ({ ...e, supplements: structuredClone(supplements[e.id] ?? []) }));
  return activities;
}
