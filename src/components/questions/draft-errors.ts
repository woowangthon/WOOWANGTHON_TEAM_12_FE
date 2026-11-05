import { ApiError } from "@/lib/api/errors";
import type { Draft } from "@/lib/api/question-types";

export function requestError(e: unknown) {
  const labels: Record<string, string> = {
    INVALID_REQUEST: "이 문항의 추천 경험을 1 ~ 3개 다시 골라 주세요.",
    QUESTION_NOT_FOUND: "이 문항을 찾을 수 없어요. 지원 목록에서 문항을 다시 확인해 주세요.",
    QUESTION_NOT_COMPLETED: "문항 분석이 아직 끝나지 않았어요. 문항 상태를 다시 확인해 주세요.",
    DRAFT_IN_PROGRESS: "이미 초안을 만들고 있어요. 서버의 현재 상태를 확인했어요.",
    DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 기존 초안은 그대로예요.",
  };
  return e instanceof ApiError ? labels[e.code] ?? e.message : e instanceof Error ? e.message : "초안 요청을 처리하지 못했어요. 상태를 확인하고 다시 시도해 주세요.";
}
export function failureReason(error: Draft["error"]) {
  return error?.code === "AI_TIMEOUT" ? "AI 응답 시간이 초과됐어요."
    : error?.code === "AI_UNAVAILABLE" ? "AI 서버에 연결하지 못했어요."
    : error?.code === "AI_FAILED" ? "AI가 올바른 초안을 만들지 못했어요."
    : error?.message ?? "서버에서 초안을 만들지 못했어요.";
}
