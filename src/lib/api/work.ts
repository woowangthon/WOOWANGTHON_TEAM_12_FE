import { request } from "./http";
import { ApiError } from "./errors";

/** ETC work-api.md (S-47). 제품에서는 서버 응답만 사용한다. */
export type WorkKind = "SOURCE_ANALYSIS" | "MATCH" | "GROUNDING_CHECK" | "DRAFT" | "CHAGOK";
export type WorkItem = {
  key: string; kind: WorkKind;
  status: "QUEUED" | "ANALYZING" | "RUNNING" | "WAITING_CONFIRM" | "COMPLETED" | "DONE" | "FAILED";
  label: string; startedAt: string; finishedAt: string | null; errorCode: string | null;
  sourceId: number | null; jobId: number | null; applicationId: number | null; questionId: number | null; runId: number | null;
};
export type WorkSnapshot = { seenAt: string | null; inProgress: WorkItem[]; recent: WorkItem[] };
export async function fetchWork(signal?: AbortSignal) {
  const snapshot = await request<WorkSnapshot>("/work", undefined, "GET", "include", signal);
  if (!snapshot || !Array.isArray(snapshot.inProgress) || !Array.isArray(snapshot.recent)) throw new ApiError("INVALID_RESPONSE", "작업 상태 응답을 읽지 못했어요. 다시 불러와 주세요.");
  return snapshot;
}
export const markWorkSeen = (seenAt: string, signal?: AbortSignal) => request<{ seenAt: string }>("/work/seen", { seenAt }, "POST", "include", signal);
/** BE의 ISO 시각은 밀리초보다 정밀할 수 있다. 오프셋은 Date로, 남은 소수 자리는 문자열로 비교한다. */
export function compareWorkTimes(a: string, b: string) {
  const milliseconds = Date.parse(a) - Date.parse(b);
  if (milliseconds) return milliseconds;
  const tail = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? "").slice(3).padEnd(6, "0");
  const left = tail(a), right = tail(b);
  return left > right ? 1 : left < right ? -1 : 0;
}
export const isUnread = (item: WorkItem, seenAt: string | null) => !!item.finishedAt && (seenAt === null || compareWorkTimes(item.finishedAt, seenAt) > 0);
export function latestFinished(items: WorkItem[]) {
  return items.reduce<string | null>((latest, item) => item.finishedAt && (!latest || compareWorkTimes(item.finishedAt, latest) > 0) ? item.finishedAt : latest, null);
}
export const WORK_KIND: Record<WorkKind, string> = { SOURCE_ANALYSIS: "자료 분석", MATCH: "문항 경험 추천", GROUNDING_CHECK: "근거 점검", DRAFT: "답변 초안", CHAGOK: "차곡이 일" };
export const WORK_STATUS: Record<WorkItem["status"], string> = { QUEUED: "기다림", ANALYZING: "분석 중", RUNNING: "실행 중", WAITING_CONFIRM: "사용자 확인 대기", COMPLETED: "완료", DONE: "완료", FAILED: "실패" };

/** 기존 화면에 복원용 식별자를 전달한다. 식별자가 없으면 다른 작업으로 보내지 않는다. */
export function workHref(item: WorkItem): string | null {
  if (item.kind === "SOURCE_ANALYSIS") return item.jobId ? `/experience?workJob=${item.jobId}${item.sourceId ? `&source=${item.sourceId}` : ""}` : null;
  if (item.kind === "CHAGOK") return item.runId ? `/questions?run=${item.runId}${item.questionId ? `&question=${item.questionId}` : ""}` : null;
  if (!item.questionId) return null;
  const area = item.kind === "DRAFT" ? "draft" : item.kind === "GROUNDING_CHECK" ? "answer" : "question";
  return `/questions?question=${item.questionId}&workArea=${area}`;
}
