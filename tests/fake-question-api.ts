// 시험용 가짜 BE — question-api.md 대로 지원 · 문항 · 되묻기 · 보완과, 추천 활동을 여는 타임라인(활동 7)만 흉내 낸다.
// 화면이 계약대로 부르고 그 응답을 그대로 그리는지 보려는 것이다. 추천 내용은 계약 예시(문항 41 · 42)를 그대로 쓴다 — AI 판단을 흉내 내지 않는다.
import type { Page, Route } from "@playwright/test";
import type { Application, ApplicationStatus, Clarification, JobRole, OrganizationType, QuestionDetail, QuestionSummary, SimilarAnswer } from "../src/lib/api/question-types";
import type { ActivityDetail, Supplement } from "../src/lib/api/types";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import { DRAFT_EXAMPLE } from "./fixtures/draft-example";

export const ANALYSIS_MS = 1500;

type Stored = { detail: QuestionDetail; template: QuestionDetail; startedAt: number; fail: boolean };
export type FakeOptions = {
  /** 처음부터 빈 계정(지원 0개) */
  empty?: boolean;
  /** 계약 예시 문항 둘을 같은 지원에 둔다 — 탭을 오가며 상태를 확인 */
  sameApplication?: boolean;
  /** 넣는 문항마다 분석이 실패한다(AI_TIMEOUT). 다시 시도하면 끝난다 */
  fail?: boolean;
  /** 넣는 문항마다 추천 0개 · 요구사항은 모두 「자료에서 확인 안 됨」 */
  noMatch?: boolean;
  /** 넣기 · 더하기가 429 DAILY_LIMIT_EXCEEDED */
  limit?: boolean;
};

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
const error = (route: Route, status: number, code: string, message = code) => route.fulfill({ status, json: { error: { code, message } } });

export class FakeQuestionApi {
  questions: Stored[] = [];
  /** 경험 ID → 보완(만든 순서) — 보완은 경험에 딸린다 */
  supplements = new Map<number, Supplement[]>();
  /** 화면이 보낸 요청(인증 빼고) — 「METHOD /api/…」와 본문 */
  calls: { call: string; body: unknown }[] = [];
  /** 켜 두면 GET /api/applications 가 503 — 불러오기 실패 화면 */
  listDown = false;
  /** 켜 두면 PATCH(지원처 종류 · 직무 · 상태 · 낸 달 · 문항 유형)가 503 — 저장 실패 */
  patchDown = false;
  /** 지원 ID → 지원처 종류 · 직무(S-42) */
  types = new Map<number, { organizationType: OrganizationType | null; jobRole: JobRole | null }>();
  /** 지원 ID → 상태 · 낸 달(S-36 · S-37). 없으면 새 지원처럼 작성 중 */
  statuses = new Map<number, { applicationStatus: ApplicationStatus; submittedMonth: string | null }>();
  /** 지원 ID → 공고 원문 링크(S-46) */
  postingUrls = new Map<number, string | null>();
  /** 문항 ID → 앞으로 실패시킬 GET 횟수 — 폴링의 일시 · 연속 연결 실패 */
  questionFailures = new Map<number, number>();
  /** GET similar-answers(S-43)가 돌려줄 목록 */
  similarAnswers: SimilarAnswer[] = [];
  /** 켜 두면 GET similar-answers 가 503 */
  similarDown = false;
  /** 초안 HTTP 계약 시험 제어. 제품 실행에서는 사용하지 않는다. */
  draftError: { status: number; code: string } | null = null;
  failDraft = false;
  holdDraft = false;
  private draftStarted = new Map<number, number>();
  private nextQuestion = 43;
  private nextApplication = 23;
  private nextClarification = 66;
  private nextSupplement = 302;
  private applications = new Map<number, string | null>();

  constructor(private options: FakeOptions = {}) {
    if (options.empty) return;
    for (const sample of QUESTION_EXAMPLES) {
      const detail = structuredClone(sample);
      detail.draft = null;
      if (options.sameApplication) {
        detail.applicationId = 22;
        detail.organization = QUESTION_EXAMPLES[1].organization;
      }
      detail.createdAt = new Date(Date.now() - (sample.id === 41 ? 1200000 : 600000)).toISOString();
      this.questions.push({ detail, template: sample, startedAt: 0, fail: false });
      this.applications.set(detail.applicationId, detail.organization);
    }
    for (const sample of QUESTION_EXAMPLES) for (const r of sample.recommendations) for (const s of r.experience.supplements) {
      const list = this.supplements.get(r.experience.id) ?? [];
      if (!list.some(x => x.id === s.id)) list.push(structuredClone(s));
      this.supplements.set(r.experience.id, list);
    }
  }

  /** 문항 하나를 고쳐 화면이 드문 모양(추천 3개 · 근거 없음 등)을 그리는지 본다 */
  edit(id: number, change: (detail: QuestionDetail) => void) { change(this.find(id)!.detail); }

  async install(page: Page) {
    await page.route("**/api/**", route => this.handle(route));
    return this;
  }

  private find(id: number) { return this.questions.find(q => q.detail.id === id); }

  private settle() {
    for (const q of this.questions) {
      if (q.detail.status !== "ANALYZING" || Date.now() - q.startedAt < ANALYSIS_MS) continue;
      q.detail.updatedAt = new Date().toISOString();
      if (q.fail) { q.detail.status = "FAILED"; q.detail.error = { code: "AI_TIMEOUT", message: "AI 응답 시간이 지났습니다" }; continue; }
      const noMatch = this.options.noMatch;
      q.detail.status = "COMPLETED";
      // 사용자가 고른 유형은 매칭이 덮어쓰지 않는다(question-api.md)
      if (q.detail.questionTypeBy !== "USER") {
        q.detail.questionType = q.template.questionType ?? null;
        q.detail.questionTypeBy = q.detail.questionType ? "AI" : null;
      }
      q.detail.requirements = q.template.requirements.map(r => noMatch ? { ...r, status: "NOT_FOUND", experienceIds: [] } : structuredClone(r));
      q.detail.recommendations = noMatch ? [] : structuredClone(q.template.recommendations);
      // 보완에 이미 있는 질문은 다시 묻지 않는다(계약 예시의 모양 — AI#21)
      q.detail.clarifications = noMatch ? [] : q.template.clarifications
        .filter(c => !(this.supplements.get(c.experienceId) ?? []).some(s => s.question === c.question))
        .map((c): Clarification => ({ ...c, id: this.nextClarification++, supplementId: null }));
    }
    for (const q of this.questions) {
      const draft = q.detail.draft;
      if (this.holdDraft || draft?.status !== "ANALYZING" || !this.draftStarted.has(q.detail.id) || Date.now() - this.draftStarted.get(q.detail.id)! < 800) continue;
      q.detail.draft = { ...draft, status: this.failDraft ? "FAILED" : "COMPLETED",
        error: this.failDraft ? { code: "AI_TIMEOUT", message: "AI 응답 시간이 초과됐어요." } : null,
        sentences: this.failDraft ? [] : structuredClone(DRAFT_EXAMPLE.sentences).filter(s => s.evidence.every(e => draft.experienceIds.includes(e.experienceId))),
        omitted: this.failDraft ? [] : structuredClone(DRAFT_EXAMPLE.omitted)
          .filter(item => item.experienceId === null || draft.experienceIds.includes(item.experienceId))
          .filter(item => item.experienceId === null || !(this.supplements.get(item.experienceId) ?? []).some(s => s.question === item.question))
          .map(item => ({ ...item, clarificationId: item.experienceId === null ? null : this.nextClarification++ })), updatedAt: new Date().toISOString() };
    }
  }

  private summary({ detail }: Stored): QuestionSummary {
    return {
      id: detail.id, applicationId: detail.applicationId, organization: detail.organization, text: detail.text,
      questionType: detail.questionType ?? null, questionTypeBy: detail.questionTypeBy ?? null, status: detail.status, createdAt: detail.createdAt,
    };
  }

  /** 추천의 경험은 지금 상태로 — 문항 뒤에 생긴 보완도 싣는다 */
  private now(detail: QuestionDetail): QuestionDetail {
    const out = structuredClone(detail);
    for (const r of out.recommendations) r.experience.supplements = structuredClone(this.supplements.get(r.experience.id) ?? []);
    return out;
  }

  private application(id: number): Application | null {
    if (!this.applications.has(id)) return null;
    const questions = this.questions.filter(q => q.detail.applicationId === id).map(q => this.summary(q));
    const { organizationType = null, jobRole = null } = this.types.get(id) ?? {};
    const { applicationStatus = "WRITING", submittedMonth = null } = this.statuses.get(id) ?? {};
    return { id, organization: this.applications.get(id) ?? null, organizationType, jobRole, postingUrl: this.postingUrls.get(id) ?? null, applicationStatus, submittedMonth, questions, createdAt: questions[0].createdAt };
  }

  private push(applicationId: number, text: string) {
    const now = new Date().toISOString();
    const id = this.nextQuestion++;
    const template = QUESTION_EXAMPLES.find(sample => sample.text === text.trim()) ?? QUESTION_EXAMPLES[0];
    this.questions.push({ template, startedAt: Date.now(), fail: !!this.options.fail, detail: {
      id, applicationId, organization: this.applications.get(applicationId) ?? null, text, status: "ANALYZING", error: null,
      requirements: [], recommendations: [], clarifications: [], createdAt: now, updatedAt: now,
    } });
    return id;
  }

  private activity(): ActivityDetail {
    const [a, b] = QUESTION_EXAMPLES;
    const experiences = [a.recommendations[0].experience, b.recommendations[0].experience]
      .map(e => ({ ...structuredClone(e), supplements: structuredClone(this.supplements.get(e.id) ?? []) }));
    const { id, name, period } = a.recommendations[0].activity;
    return { id, name, period, experiences };
  }

  private async handle(route: Route) {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback(); // 로그인 확인은 signed-in 픽스처
    const method = req.method();
    const body = req.postData() ? req.postDataJSON() : undefined;
    this.calls.push({ call: `${method} ${path}`, body });
    this.settle();
    let m: RegExpMatchArray | null;

    if (method === "GET" && path === "/api/applications") {
      if (this.listDown) return error(route, 503, "INTERNAL_ERROR", "잠시 뒤 다시 시도해 주세요");
      const ids = [...this.applications.keys()].sort((x, y) => y - x);
      return json(route, { applications: ids.map(id => this.application(id)!).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) });
    }
    if ((m = path.match(/^\/api\/applications\/(\d+)$/)) && method === "PATCH") {
      if (this.patchDown) return error(route, 503, "INTERNAL_ERROR", "잠시 뒤 다시 시도해 주세요");
      if (!this.applications.has(+m[1])) return error(route, 404, "APPLICATION_NOT_FOUND");
      const { applicationStatus, submittedMonth, organization, ...types } = body;
      if (organization !== undefined) this.applications.set(+m[1], organization);
      if (!Object.keys(body).length || applicationStatus === null || submittedMonth === null) return error(route, 400, "INVALID_REQUEST");
      if (submittedMonth !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(submittedMonth)) return error(route, 400, "INVALID_REQUEST");
      // 낸 달 규칙(question-api.md 「지원 Application」) — 작성 중을 벗어날 때 값이 없으면 그 달, 되돌리면 null, 보낸 달이 이긴다
      const was = this.statuses.get(+m[1]) ?? { applicationStatus: "WRITING" as ApplicationStatus, submittedMonth: null };
      const next = applicationStatus ?? was.applicationStatus;
      if (next === "WRITING" && submittedMonth !== undefined) return error(route, 400, "INVALID_REQUEST");
      this.statuses.set(+m[1], { applicationStatus: next, submittedMonth: next === "WRITING" ? null : submittedMonth ?? was.submittedMonth ?? new Date().toISOString().slice(0, 7) });
      const now = this.types.get(+m[1]) ?? { organizationType: null, jobRole: null };
      this.types.set(+m[1], { ...now, ...types });
      return json(route, this.application(+m[1]));
    }
    if ((m = path.match(/^\/api\/questions\/(\d+)\/similar-answers$/)) && method === "GET") {
      if (this.similarDown) return error(route, 503, "INTERNAL_ERROR", "잠시 뒤 다시 시도해 주세요.");
      return this.find(+m[1]) ? json(route, { answers: this.similarAnswers }) : error(route, 404, "QUESTION_NOT_FOUND");
    }
    if ((m = path.match(/^\/api\/questions\/(\d+)$/)) && method === "PATCH") {
      if (this.patchDown) return error(route, 503, "INTERNAL_ERROR", "잠시 뒤 다시 시도해 주세요");
      const q = this.questions.find(x => x.detail.id === +m![1]);
      if (!q) return error(route, 404, "QUESTION_NOT_FOUND");
      if (!body?.questionType) return error(route, 400, "INVALID_REQUEST");
      q.detail.questionType = body.questionType;
      q.detail.questionTypeBy = "USER";
      return json(route, this.now(q.detail));
    }
    if (method === "POST" && path === "/api/applications") {
      if (this.options.limit) return error(route, 429, "DAILY_LIMIT_EXCEEDED", "오늘 분석 횟수를 다 썼습니다");
      const applicationId = this.nextApplication++;
      this.applications.set(applicationId, body.organization ?? null);
      this.types.set(applicationId, { organizationType: body.organizationType ?? null, jobRole: body.jobRole ?? null });
      this.postingUrls.set(applicationId, body.postingUrl ?? null);
      const questionIds = body.questions.map((q: { text: string }) => this.push(applicationId, q.text));
      return json(route, { applicationId, questionIds }, 202);
    }
    if ((m = path.match(/^\/api\/applications\/(\d+)\/questions$/)) && method === "POST") {
      if (!this.applications.has(+m[1])) return error(route, 404, "APPLICATION_NOT_FOUND");
      if (this.options.limit) return error(route, 429, "DAILY_LIMIT_EXCEEDED");
      return json(route, { questionId: this.push(+m[1], body.text), status: "ANALYZING" }, 202);
    }
    if ((m = path.match(/^\/api\/applications\/(\d+)$/)) && method === "GET") {
      const application = this.application(+m[1]);
      return application ? json(route, application) : error(route, 404, "APPLICATION_NOT_FOUND");
    }
    if (method === "GET" && path === "/api/questions") {
      return json(route, { questions: this.questions.map(q => this.summary(q)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) });
    }
    if ((m = path.match(/^\/api\/questions\/(\d+)$/)) && method === "GET") {
      const remaining = this.questionFailures.get(+m[1]) ?? 0;
      if (remaining > 0) {
        this.questionFailures.set(+m[1], remaining - 1);
        return error(route, 503, "INTERNAL_ERROR", "잠시 뒤 다시 시도해 주세요");
      }
      const q = this.find(+m[1]);
      return q ? json(route, this.now(q.detail)) : error(route, 404, "QUESTION_NOT_FOUND");
    }
    if (/^\/api\/questions\/\d+\/grounding-check$/.test(path) && method === "GET") return json(route, { groundingCheck: null });
    if ((m = path.match(/^\/api\/questions\/(\d+)\/draft$/)) && method === "POST") {
      if (this.draftError) return error(route, this.draftError.status, this.draftError.code);
      const q = this.find(+m[1]);
      if (!q) return error(route, 404, "QUESTION_NOT_FOUND");
      const ids = body?.experienceIds;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !q.detail.recommendations.some(r => r.experience.id === id))) return error(route, 400, "INVALID_REQUEST");
      if (q.detail.status !== "COMPLETED") return error(route, 409, "QUESTION_NOT_COMPLETED");
      if (q.detail.draft?.status === "ANALYZING") return error(route, 409, "DRAFT_IN_PROGRESS");
      const now = new Date().toISOString();
      q.detail.draft = { questionId: q.detail.id, status: "ANALYZING", error: null, experienceIds: ids, frame: body.frame ?? "NONE", guidelines: [], sentences: [], omitted: [], createdAt: now, updatedAt: now };
      this.draftStarted.set(q.detail.id, Date.now());
      return json(route, q.detail.draft, 202);
    }
    if ((m = path.match(/^\/api\/questions\/(\d+)\/retry$/)) && method === "POST") {
      const q = this.find(+m[1]);
      if (!q) return error(route, 404, "QUESTION_NOT_FOUND");
      if (q.detail.status !== "FAILED") return error(route, 409, "QUESTION_NOT_FAILED");
      q.fail = false; q.startedAt = Date.now();
      q.detail = { ...q.detail, status: "ANALYZING", error: null, requirements: [], recommendations: [], clarifications: [] };
      return json(route, q.detail, 202);
    }
    if ((m = path.match(/^\/api\/clarifications\/(\d+)\/answer$/)) && method === "POST") {
      const owner = this.questions.find(q => q.detail.clarifications.some(c => c.id === +m![1])
        || q.detail.draft?.omitted.some(c => c.clarificationId === +m![1]));
      const omitted = owner?.detail.draft?.omitted.find(c => c.clarificationId === +m![1]);
      const c = owner?.detail.clarifications.find(c => c.id === +m![1]) ?? (omitted?.experienceId != null && omitted.question !== null ? { ...omitted, experienceId: omitted.experienceId, question: omitted.question } : undefined);
      if (!owner || !c) return error(route, 404, "CLARIFICATION_NOT_FOUND");
      if (c.supplementId !== null) return error(route, 409, "CLARIFICATION_ALREADY_ANSWERED");
      const now = new Date().toISOString();
      const supplement: Supplement = { id: this.nextSupplement++, question: c.question, answer: body.answer, questionId: owner.detail.id, createdAt: now, updatedAt: now };
      this.supplements.set(c.experienceId, [...(this.supplements.get(c.experienceId) ?? []), supplement]);
      c.supplementId = supplement.id;
      if (omitted) omitted.supplementId = supplement.id;
      return json(route, { experienceId: c.experienceId, supplement }, 201);
    }
    if (method === "GET" && path === "/api/activities") {
      const { experiences, ...summary } = this.activity();
      return json(route, { activities: [{ ...summary, experienceCount: experiences.length }] });
    }
    if (method === "GET" && path === "/api/activities/7") return json(route, this.activity());
    return error(route, 404, "NOT_FOUND", `가짜 BE 에 없는 요청: ${method} ${path}`);
  }
}
