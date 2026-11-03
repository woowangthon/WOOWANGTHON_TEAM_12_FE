// MOCK(question-matching): FE#30은 API 주소 설정과 관계없이 목 전용이다. 실제 연결은 FE#32.
// 실제 API 실패를 목으로 덮는 분기나 인증 요청은 두지 않는다.
import type { CreateQuestionRequest, QuestionDetail, QuestionSubmitted, QuestionSummary } from "./question-types";
import { mockFetchQuestion, mockFetchQuestions, mockRetryQuestion, mockSubmitQuestion, type MockQuestionScenario } from "../mock/questions";

export async function fetchQuestions(): Promise<QuestionSummary[]> { return mockFetchQuestions(); }
export async function fetchQuestion(id: number): Promise<QuestionDetail> { return mockFetchQuestion(id); }
export async function submitQuestion(req: CreateQuestionRequest, scenario: MockQuestionScenario = "ok"): Promise<QuestionSubmitted> { return mockSubmitQuestion(req, scenario); }
export async function retryQuestion(id: number): Promise<QuestionDetail> { return mockRetryQuestion(id); }
