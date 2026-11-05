import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import { MAX_TEXT_LENGTH } from "./types";

export const ENTRANCE_KINDS = ["SOURCE", "APPLICATION", "ASK", "UNSURE"] as const;
export type EntranceKind = typeof ENTRANCE_KINDS[number];
export type EntranceRoute = { kind: EntranceKind; reason: string };

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
