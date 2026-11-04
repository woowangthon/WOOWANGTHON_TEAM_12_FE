// MOCK(question-matching): FE#30 · FE#38은 API 주소 설정과 관계없이 목 전용이다. 실제 연결은 FE#32.
// 실제 API 실패를 목으로 덮는 분기나 인증 요청은 두지 않는다.
import type { AddQuestionRequest, Application, ApplicationSubmitted, CreateApplicationRequest, CreateQuestionRequest, QuestionAdded, QuestionDetail, QuestionSubmitted, QuestionSummary } from "./question-types";
import { mockAddQuestion, mockFetchApplication, mockFetchApplications, mockFetchQuestion, mockFetchQuestions, mockRetryQuestion, mockSubmitApplication, mockSubmitQuestion, type MockQuestionScenario } from "../mock/questions";

export async function fetchQuestions(): Promise<QuestionSummary[]> { return mockFetchQuestions(); }
export async function fetchQuestion(id: number): Promise<QuestionDetail> { return mockFetchQuestion(id); }
export async function submitQuestion(req: CreateQuestionRequest, scenario: MockQuestionScenario = "ok"): Promise<QuestionSubmitted> { return mockSubmitQuestion(req, scenario); }
export async function retryQuestion(id: number): Promise<QuestionDetail> { return mockRetryQuestion(id); }
export async function fetchApplications(): Promise<Application[]> { return mockFetchApplications(); }
export async function fetchApplication(id: number): Promise<Application> { return mockFetchApplication(id); }
export async function submitApplication(req: CreateApplicationRequest, scenario: MockQuestionScenario = "ok"): Promise<ApplicationSubmitted> { return mockSubmitApplication(req, scenario); }
export async function addApplicationQuestion(applicationId: number, req: AddQuestionRequest, scenario: MockQuestionScenario = "ok"): Promise<QuestionAdded> { return mockAddQuestion(applicationId, req, scenario); }
