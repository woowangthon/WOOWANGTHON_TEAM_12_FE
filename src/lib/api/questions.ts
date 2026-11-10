// 지원 · 문항 · 추천 · 되묻기 — ETC docs/contracts/question-api.md. 실제 BE 만 부른다(FE#32).
// API 주소가 없는 목 모드에선 request 가 API_NOT_CONFIGURED 로 실패한다 — 정해진 결과로 대신 채우지 않는다(대회 규칙 2).
import type { Answer, AnswerDraft, SaveNewFactRequest, SimilarAnswer } from "./question-types";
import type { Experience } from "./types";
import { ApiError } from "./errors";
import { request } from "./http";
import { activityError } from "./editing";
import { DRAFT_FRAMES } from "../draft-frames";
import { MAX_DRAFT_EXPERIENCES, MAX_GROUNDING_TEXT_LENGTH, type GroundingCheck, type CreateDraftRequest, type Draft } from "./question-types";
import {
  MAX_ANSWER_LENGTH, MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, MAX_QUESTIONS_PER_SUBMIT,
  type AddQuestionRequest, type AnswerClarificationRequest, type Application, type ApplicationSubmitted, type ClarificationAnswered,
  type CreateApplicationRequest, type CreateQuestionRequest, type QuestionAdded, type QuestionDetail, type QuestionSubmitted, type QuestionSummary,
  type QuestionType, type UpdateApplicationRequest,
} from "./question-types";

/** 서버도 같은 규칙으로 막지만, 보내기 전에 걸러 하루 분석 횟수 · 왕복을 아낀다 */
function checkText(text: string) {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "지원 문항을 입력해 주세요.");
  if (text.length > MAX_QUESTION_LENGTH) throw new ApiError("TEXT_TOO_LONG", "지원 문항은 5,000자까지 입력할 수 있어요.");
}
function checkOrganization(organization?: string | null) {
  if ((organization?.length ?? 0) > MAX_ORGANIZATION_LENGTH) throw new ApiError("INVALID_REQUEST", "지원처 이름은 100자까지 입력할 수 있어요.");
}

/** GET /api/questions — 최근에 넣은 것부터 */
export async function fetchQuestions(): Promise<QuestionSummary[]> {
  return (await request<{ questions: QuestionSummary[] }>("/questions")).questions;
}

/** GET /api/questions/{id} — 요구사항 · 추천 · 되묻기(분석 중 · 실패면 빈 배열) */
export function fetchQuestion(id: number): Promise<QuestionDetail> {
  return request(`/questions/${id}`);
}

/** GET /api/questions/{id}/similar-answers — 가까운 것부터 최대 5개(S-43). AI · 분석 횟수를 쓰지 않는다 */
export async function fetchSimilarAnswers(id: number): Promise<SimilarAnswer[]> {
  return (await request<{ answers: SimilarAnswer[] }>(`/questions/${id}/similar-answers`)).answers;
}

/** POST /api/questions — 문항 하나짜리 지원 */
export async function submitQuestion(req: CreateQuestionRequest): Promise<QuestionSubmitted> {
  checkText(req.text);
  checkOrganization(req.organization);
  return request("/questions", req, "POST");
}

/** POST /api/questions/{id}/retry — 같은 문항으로 추천을 다시 돌린다 */
export function retryQuestion(id: number): Promise<QuestionDetail> {
  return request(`/questions/${id}/retry`, undefined, "POST");
}

/** GET /api/applications — 최근에 넣은 지원부터, 문항은 넣은 순서 */
export async function fetchApplications(): Promise<Application[]> {
  return (await request<{ applications: Application[] }>("/applications")).applications;
}

/** GET /api/applications/{id} */
export function fetchApplication(id: number): Promise<Application> {
  return request(`/applications/${id}`);
}

/** POST /api/applications — 지원 + 문항 1 ~ 10개, 문항마다 추천 시작 */
export async function submitApplication(req: CreateApplicationRequest): Promise<ApplicationSubmitted> {
  if (!req.questions.length || req.questions.length > MAX_QUESTIONS_PER_SUBMIT) throw new ApiError("INVALID_REQUEST", "문항은 한 번에 1 ~ 10개까지 넣을 수 있어요.");
  req.questions.forEach(q => checkText(q.text));
  checkOrganization(req.organization);
  return request("/applications", req, "POST");
}

/** PATCH /api/applications/{id} — 지원처 이름(S-73) · 종류 · 직무(S-42) · 상태(S-36) · 낸 달(S-37) 바꾸기. 추천은 다시 돌지 않는다 */
export function updateApplication(id: number, req: UpdateApplicationRequest): Promise<Application> {
  return request(`/applications/${id}`, req, "PATCH");
}

/** 지원 칸(이름 · 종류 · 직무 · 상태 · 낸 달) 저장 실패의 이유 한 문장 — 사용자 말로(FE#240).
 *  서버의 검증 문구(400 INVALID_REQUEST)엔 필드 이름이 들어 있어 그대로 보이지 않는다. 연결 · 서버 오류 문구는 공통 요청이 이미 사용자 말로 만든다.
 *  「○○을 저장하지 못했어요.」는 부르는 쪽이 앞에 붙인다. 늘 마침표로 끝난다 */
export function applicationSaveError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "APPLICATION_NOT_FOUND") return "이 지원을 찾지 못했어요. 지원 목록을 새로고침해 주세요.";
    if (e.code === "INVALID_REQUEST" || e.status === 400) return "서버가 이 값을 받지 않았어요.";
    if (e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE" || e.code.startsWith("HTTP_")) return e.message;
  }
  return "잠시 뒤 다시 시도해 주세요.";
}

/** PATCH /api/questions/{id} — 문항 유형 고치기(S-41). 고친 유형은 다시 시도 · 매칭이 덮어쓰지 않는다 */
export function updateQuestionType(id: number, questionType: QuestionType): Promise<QuestionDetail> {
  return request(`/questions/${id}`, { questionType }, "PATCH");
}

/** PATCH /api/questions/{id} — 목표 글자 수(S-77). null 이면 비운다. 유형 출처(questionTypeBy)는 그대로 */
export function updateQuestionTargetLength(id: number, targetLength: number | null): Promise<QuestionDetail> {
  return request(`/questions/${id}`, { targetLength }, "PATCH");
}

/** POST /api/applications/{id}/questions — 그 지원에 문항 더하기 */
export async function addApplicationQuestion(applicationId: number, req: AddQuestionRequest): Promise<QuestionAdded> {
  checkText(req.text);
  return request(`/applications/${applicationId}/questions`, req, "POST");
}

/** POST /api/clarifications/{id}/answer — 답이 그 경험의 보완이 된다(201) */
export async function answerClarification(id: number, req: AnswerClarificationRequest): Promise<ClarificationAnswered> {
  if (!req.answer.trim()) throw new ApiError("EMPTY_ANSWER", "답을 입력해 주세요.");
  if (req.answer.length > MAX_ANSWER_LENGTH) throw new ApiError("INVALID_REQUEST", "답은 2,000자까지 입력할 수 있어요.");
  return request(`/clarifications/${id}/answer`, req, "POST");
}

/** POST /api/questions/{id}/draft → 202 Draft. 결과 조회는 기존 fetchQuestion의 draft 필드다. */
export async function createQuestionDraft(question: QuestionDetail, req: CreateDraftRequest): Promise<Draft> {
  const ids = req.experienceIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DRAFT_EXPERIENCES || new Set(ids).size !== ids.length
    || ids.some(id => !question.recommendations.some(r => r.experience.id === id))) {
    throw new ApiError("INVALID_REQUEST", "이 문항의 추천 활동을 하나 이상 골라 주세요.", 400);
  }
  if (question.status !== "COMPLETED") throw new ApiError("QUESTION_NOT_COMPLETED", "문항 분석이 끝난 뒤 초안을 만들 수 있어요.", 409);
  if (req.frame !== undefined && !(Object.keys(DRAFT_FRAMES) as string[]).includes(req.frame)) throw new ApiError('INVALID_REQUEST', '구성 틀을 골라 주세요.', 400);
  return request(`/questions/${question.id}/draft`, {
    experienceIds: ids, ...(req.frame === undefined ? {} : { frame: req.frame }), ...(req.useContext === undefined ? {} : { useContext: req.useContext }),
  }, "POST");
}

/** POST /api/draft-sentences/{id}/confirm — 카드의 「맞아요」(S-79). 204, 다시 눌러도 같다. 다시 만들어 사라진 문장이면 404 */
export function confirmDraftSentence(sentenceId: number): Promise<void> {
  return request(`/draft-sentences/${sentenceId}/confirm`, undefined, "POST");
}

/** S-45: 실패를 고정 결과로 대체하지 않고, 공백과 길이는 HTTP 전에 확인한다. */
export async function createGroundingCheck(questionId: number, req: { text: string }): Promise<GroundingCheck> {
  if (!req.text.trim()) throw new ApiError("EMPTY_TEXT", "점검할 답을 입력해 주세요.");
  if (req.text.length > MAX_GROUNDING_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "답은 5,000자까지 입력할 수 있어요.");
  return request(`/questions/${questionId}/grounding-check`, req, "POST");
}

export async function fetchGroundingCheck(questionId: number): Promise<GroundingCheck | null> {
  return (await request<{ groundingCheck: GroundingCheck | null }>(`/questions/${questionId}/grounding-check`)).groundingCheck;
}

/** PUT /api/questions/{id}/answer-draft — 쓰는 중인 답 자동 저장(S-72). AI 를 부르지 않는다. 빈 글도 저장한다.
 *  fromDraft 는 초안을 답칸에 넣은 저장일 때만 true — 수정 이력에 DRAFT_OVERWRITE 로 남는다(S-80) */
export async function saveAnswerDraft(questionId: number, req: { text: string; state: Record<string, unknown> | null; fromDraft?: boolean }): Promise<AnswerDraft> {
  if (req.text.length > MAX_GROUNDING_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "답이 5,000자를 넘어 저장하지 못했어요.");
  return (await request<{ answerDraft: AnswerDraft }>(`/questions/${questionId}/answer-draft`, req, "PUT")).answerDraft;
}

/** S-48: 먼저 답을 저장하고, 성공한 뒤에만 후보 찾기를 시작한다. */
export async function confirmAnswer(questionId: number, text: string): Promise<Answer> {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "저장할 답을 입력해 주세요.");
  if (text.length > MAX_GROUNDING_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "답은 5,000자까지 입력할 수 있어요.");
  return (await request<{ answer: Answer }>(`/questions/${questionId}/answer`, { text }, "PUT")).answer;
}
export async function findNewFacts(questionId: number): Promise<Answer> {
  return (await request<{ answer: Answer }>(`/questions/${questionId}/answer/new-facts`, undefined, "POST")).answer;
}
export async function saveNewFact(id: number, data: SaveNewFactRequest): Promise<Experience> {
  const target = data.newActivity ? !!data.newActivity.name.trim() : Number.isInteger(data.activityId) && data.activityId! > 0;
  if (!data.content.trim() || !target || !["ME", "TEAM", "UNKNOWN"].includes(data.actor)) {
    throw new ApiError("INVALID_REQUEST", "경험 문장 · 수행 주체 · 붙일 활동을 확인해 주세요.");
  }
  if (data.newActivity) {
    const period = data.newActivity.period;
    const invalid = period && activityError(data.newActivity.name, period);
    if (invalid) throw new ApiError("INVALID_PERIOD", invalid);
    // 계약: 이름은 앞뒤 공백을 걷는다 · 기간은 빼면 「기간 모름」
    return request(`/new-fact-candidates/${id}/save`, { content: data.content, actor: data.actor, newActivity: { name: data.newActivity.name.trim(), ...(period ? { period } : {}) } }, "POST");
  }
  return request(`/new-fact-candidates/${id}/save`, data, "POST");
}
export function dismissNewFact(id: number): Promise<void> {
  return request(`/new-fact-candidates/${id}/dismiss`, undefined, "POST");
}
