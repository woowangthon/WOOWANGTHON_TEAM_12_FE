import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import {
  JOB_ROLE_LABEL, MAX_POSTING_LINE_LENGTH, MAX_POSTING_LINES, ORGANIZATION_TYPE_LABEL, POSTING_SECTIONS,
  type JobRole, type Ksa, type OrganizationType, type PostingSection, type ReadFrom,
} from "./question-types";
import { MAX_TEXT_LENGTH } from "./types";
import { mockParseApplication, mockParseApplicationUrl } from "../mock/application-parse";
import { mockAsk, type MockAskResult } from "../mock/ask";
import type { Recommendation } from "./question-types";

export const ENTRANCE_KINDS = ["SOURCE", "APPLICATION", "ASK", "UNSURE"] as const;
export type EntranceKind = typeof ENTRANCE_KINDS[number];
export type EntranceRoute = { kind: EntranceKind; reason: string };
/** 지원 나누기 입력 최대 길이(자) — POST /api/entrance/parse-application */
export const MAX_PARSE_TEXT_LENGTH = 20000;
/** 나눈 공고 요건 줄 하나(S-91) — text 는 공고 원문 그대로, section · ksa 는 AI 해석 */
export type ParsedPostingLine = { section: PostingSection; text: string; ksa: Ksa | null };
export type ParsedApplication = {
  organization: string | null; organizationType: OrganizationType | null; jobRole: JobRole | null; questions: string[];
  postingLines: ParsedPostingLine[]; readFrom: ReadFrom;
};
const KSA: readonly Ksa[] = ["KNOWLEDGE", "SKILL", "ATTITUDE"];
const READ_FROM: readonly ReadFrom[] = ["TEXT", "URL", "IMAGE"];
/** 목록 밖 칸 · 빈 줄은 버리고 40줄 · 300자로 자른다 — 넣기 요청이 400 이 되지 않게 */
function postingLinesOf(value: unknown): ParsedPostingLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(line => {
    const { section, text, ksa } = (line ?? {}) as Record<string, unknown>;
    if (!POSTING_SECTIONS.includes(section as PostingSection) || typeof text !== "string" || !text.trim()) return [];
    return [{ section: section as PostingSection, text: text.trim().slice(0, MAX_POSTING_LINE_LENGTH), ksa: KSA.includes(ksa as Ksa) ? ksa as Ksa : null }];
  }).slice(0, MAX_POSTING_LINES);
}

/** S-28: 분류만 한다. 자료 · 지원 저장은 각 입력 화면에서 사용자가 확인한 뒤 한다. */
export async function routeEntrance(text: string, mockKind: EntranceKind = "UNSURE"): Promise<EntranceRoute> {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "글을 입력해 주세요.");
  if (text.length > MAX_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "한 번에 50,000자까지 넣을 수 있어요.");
  if (isMockMode()) {
    // MOCK(entrance-route): API 주소가 없을 때만 명시적으로 고른 네 분류를 돌려준다. 실제 실패 대체용이 아니다.
    await new Promise(resolve => setTimeout(resolve, 400));
    return { kind: mockKind, reason: "목 모드에서 고른 분류예요. AI 판단이 아니에요." };
  }
  const result = await request<EntranceRoute>("/entrance/route", { text }, "POST");
  if (!ENTRANCE_KINDS.includes(result?.kind)) throw new ApiError("INVALID_RESPONSE", "가르기 결과를 읽지 못했어요. 다시 시도해 주세요.");
  return result;
}

/** 공고 원문 링크 최대 길이(자) — parse-application `url` · applications `postingUrl` */
export const MAX_POSTING_URL_LENGTH = 2000;
/** `http(s)://` 링크 하나인가 — 계약의 INVALID_URL 과 같은 기준(공백이 없는 주소 하나) */
export const isPostingUrl = (value: string) => value.length <= MAX_POSTING_URL_LENGTH && /^https?:\/\/[^\s/?#]+\S*$/i.test(value);
/** 홈 입력이 앞뒤 공백을 빼고 링크 하나뿐이면 그 링크 — 가르기를 부르지 않고 바로 링크로 나눈다(S-46, 코드로 판단) */
export function singleLink(text: string): string | null {
  const value = text.trim();
  return isPostingUrl(value) ? value : null;
}

/** S-30 · S-46: 붙여 넣은 글(또는 공고 링크)을 지원 칸 값으로 나눈다. 저장하지 않는다 — 사용자가 고친 뒤 POST /api/applications 로 넣는다.
 *  링크를 못 읽으면 422(URL_BLOCKED · URL_UNREADABLE)를 그대로 올린다 — 정해진 값으로 채우지 않는다 */
export async function parseApplication(input: string | { url: string }): Promise<ParsedApplication> {
  const body: { text: string } | { url: string } = typeof input === "string" ? { text: input } : { url: input.url.trim() };
  if ("text" in body) {
    if (!body.text.trim()) throw new ApiError("EMPTY_TEXT", "글을 입력해 주세요.");
    if (body.text.length > MAX_PARSE_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "지원 칸 채우기는 한 번에 20,000자까지 읽어요. 줄여서 다시 넣어 주세요.");
  } else if (!isPostingUrl(body.url)) throw new ApiError("INVALID_URL", "http:// 나 https:// 로 시작하는 링크 하나를 넣어 주세요(2,000자까지).");
  if (isMockMode()) {
    // MOCK(application-parse): API 주소가 없을 때만 규칙으로 나눈다. 실제 실패 대체용이 아니다.
    await new Promise(resolve => setTimeout(resolve, 400));
    return "text" in body ? mockParseApplication(body.text) : mockParseApplicationUrl(body.url);
  }
  const result = await request<Omit<ParsedApplication, "postingLines"> & { postingLines?: unknown }>("/entrance/parse-application", body, "POST");
  if (!Array.isArray(result?.questions)) throw new ApiError("INVALID_RESPONSE", "지원 나누기 결과를 읽지 못했어요. 다시 시도해 주세요.");
  // 닫힌 목록 밖의 값은 고를 수 없는 칸이 되니 비운다(S-42 — 둘 다 선택 칸)
  return {
    organization: result.organization?.trim() || null,
    organizationType: result.organizationType && result.organizationType in ORGANIZATION_TYPE_LABEL ? result.organizationType : null,
    jobRole: result.jobRole && result.jobRole in JOB_ROLE_LABEL ? result.jobRole : null,
    questions: result.questions.filter(q => typeof q === "string" && q.trim()),
    postingLines: postingLinesOf(result.postingLines),
    readFrom: READ_FROM.includes(result.readFrom) ? result.readFrom : "url" in body ? "URL" : "TEXT",
  };
}

/** 꺼내기 질문 최대 길이(자) — POST /api/ask */
export const MAX_ASK_TEXT_LENGTH = 2000;
/** question-api 「Recommendation」에서 emphasis · gaps 를 뺀 것 — reason 은 AI 해석 */
export type AskRecommendation = Omit<Recommendation, "emphasis" | "gaps">;

/** S-29: 한 줄 질문에 쌓인 경험 0 ~ 3개로 답한다. 저장하지 않는다 · 하루 분석 한도를 1회 센다. */
export async function askExperiences(text: string, mockResult: MockAskResult = "CARDS"): Promise<AskRecommendation[]> {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "글을 입력해 주세요.");
  if (text.length > MAX_ASK_TEXT_LENGTH) throw new ApiError("INVALID_REQUEST", "꺼내기 질문은 2,000자까지 읽어요. 줄여서 물어보거나 지원으로 만들어 주세요.");
  if (isMockMode()) {
    // MOCK(entrance-ask): API 주소가 없을 때만 고정 예시(카드 있는 답 · 0개 답)를 돌려준다. 실제 실패 대체용이 아니다.
    await new Promise(resolve => setTimeout(resolve, 400));
    return mockAsk(mockResult);
  }
  const result = await request<{ recommendations: AskRecommendation[] }>("/ask", { text }, "POST");
  if (!Array.isArray(result?.recommendations)) throw new ApiError("INVALID_RESPONSE", "꺼내기 결과를 읽지 못했어요. 다시 시도해 주세요.");
  return result.recommendations.slice(0, 3).map(r => ({ ...r, evidence: r.evidence ?? [], experience: { ...r.experience, citations: r.experience.citations ?? [], supplements: r.experience.supplements ?? [] } }));
}
