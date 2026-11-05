import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import { JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, type JobRole, type OrganizationType } from "./question-types";
import { MAX_TEXT_LENGTH } from "./types";
import { mockParseApplication } from "../mock/application-parse";

export const ENTRANCE_KINDS = ["SOURCE", "APPLICATION", "ASK", "UNSURE"] as const;
export type EntranceKind = typeof ENTRANCE_KINDS[number];
export type EntranceRoute = { kind: EntranceKind; reason: string };
/** 지원 나누기 입력 최대 길이(자) — POST /api/entrance/parse-application */
export const MAX_PARSE_TEXT_LENGTH = 20000;
export type ParsedApplication = { organization: string | null; organizationType: OrganizationType | null; jobRole: JobRole | null; questions: string[] };

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

/** S-30: 붙여 넣은 글을 지원 칸 값으로 나눈다. 저장하지 않는다 — 사용자가 고친 뒤 POST /api/applications 로 넣는다. */
export async function parseApplication(text: string): Promise<ParsedApplication> {
  if (!text.trim()) throw new ApiError("EMPTY_TEXT", "글을 입력해 주세요.");
  if (text.length > MAX_PARSE_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "지원 칸 채우기는 한 번에 20,000자까지 읽어요. 줄여서 다시 넣어 주세요.");
  if (isMockMode()) {
    // MOCK(application-parse): API 주소가 없을 때만 규칙으로 나눈다. 실제 실패 대체용이 아니다.
    await new Promise(resolve => setTimeout(resolve, 400));
    return mockParseApplication(text);
  }
  const result = await request<ParsedApplication>("/entrance/parse-application", { text }, "POST");
  if (!Array.isArray(result?.questions)) throw new ApiError("INVALID_RESPONSE", "지원 나누기 결과를 읽지 못했어요. 다시 시도해 주세요.");
  // 닫힌 목록 밖의 값은 고를 수 없는 칸이 되니 비운다(S-42 — 둘 다 선택 칸)
  return {
    organization: result.organization?.trim() || null,
    organizationType: result.organizationType && result.organizationType in ORGANIZATION_TYPE_LABEL ? result.organizationType : null,
    jobRole: result.jobRole && result.jobRole in JOB_ROLE_LABEL ? result.jobRole : null,
    questions: result.questions.filter(q => typeof q === "string" && q.trim()),
  };
}
