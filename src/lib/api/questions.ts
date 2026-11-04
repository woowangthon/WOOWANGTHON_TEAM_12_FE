// 지원 · 문항 · 추천 · 되묻기 — ETC docs/contracts/question-api.md. 실제 BE 만 부른다(FE#32).
// API 주소가 없는 목 모드에선 request 가 API_NOT_CONFIGURED 로 실패한다 — 정해진 결과로 대신 채우지 않는다(대회 규칙 2).
import { ApiError } from "./errors";
import { request } from "./http";
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

/** PATCH /api/applications/{id} — 지원처 종류 · 직무 바꾸기 · 비우기. 추천은 다시 돌지 않는다(S-42) */
export function updateApplication(id: number, req: UpdateApplicationRequest): Promise<Application> {
  return request(`/applications/${id}`, req, "PATCH");
}

/** PATCH /api/questions/{id} — 문항 유형 고치기(S-41). 고친 유형은 다시 시도 · 매칭이 덮어쓰지 않는다 */
export function updateQuestionType(id: number, questionType: QuestionType): Promise<QuestionDetail> {
  return request(`/questions/${id}`, { questionType }, "PATCH");
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
