// 수정 이력(S-80 · ADR-013) — 경험 · 활동 · 답을 고친 전후를 보고 고른 줄의 그때 값으로 되돌린다(revision-api.md).
// AI 를 부르지 않는다. 목 모드에는 이력이 없다 — request 가 「서버에 저장할 수 없어요」 오류를 낸다
import { ApiError } from "./errors";
import { request } from "./http";
import type { AnswerDraft } from "./question-types";
import type { Actor, Competency, Experience, Period, SourceStatus } from "./types";

export type RevisionTargetType = "EXPERIENCE" | "ACTIVITY" | "ANSWER";
export type RevisionKind = "EDIT" | "CONFIRM" | "DRAFT_OVERWRITE" | "RESTORE";

export type ExperienceSnapshot = { content: string; actor: Actor; competencies: Competency[]; competenciesBy: "AI" | "USER"; sourceStatus: SourceStatus };
export type ActivitySnapshot = { name: string; period: Period };
export type AnswerSnapshot = { text: string };
type Snapshot = Partial<ExperienceSnapshot & ActivitySnapshot & AnswerSnapshot>;

export type Revision = {
  id: number;
  targetType: RevisionTargetType;
  /** 경험 · 활동 ID, 답은 문항 ID */
  targetId: number;
  kind: RevisionKind;
  by: "USER" | "EXTERNAL_AI";
  client: string | null;
  mcpChangeId: number | null;
  restoredFromId: number | null;
  createdAt: string;
  /** 기록한 때의 이름 — deleted 만 지금 값 */
  target: { deleted: boolean; activityId: number | null; activityName: string | null; questionId: number | null; questionText: string | null; applicationId: number | null; organization: string | null };
  before: Snapshot;
  after: Snapshot;
};
export type RevisionPage = { revisions: Revision[]; nextCursor: string | null };
export type RestoreResult = { revision: Revision; experience: Experience | null; activity: { id: number; name: string; period: Period } | null; answerDraft: AnswerDraft | null };

export type RevisionTarget = { type: RevisionTargetType; id: number };

const invalid = () => new ApiError("INVALID_RESPONSE", "수정 이력 응답을 확인하지 못했어요.");

/** GET /api/revisions — target 이 없으면 「최근 수정」(전체), 있으면 그 항목만. 새것 먼저 */
export async function fetchRevisions(target: RevisionTarget | null, cursor: string | null): Promise<RevisionPage> {
  const query = new URLSearchParams();
  if (target) { query.set("targetType", target.type); query.set("targetId", String(target.id)); }
  if (cursor) query.set("cursor", cursor);
  const qs = query.toString();
  const value = await request<RevisionPage>(`/revisions${qs ? `?${qs}` : ""}`);
  if (!Array.isArray(value?.revisions)) throw invalid();
  return { revisions: value.revisions, nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null };
}

/** 어느 쪽으로 되돌리나 — AFTER 는 그 줄에 보이는 그때 값, BEFORE 는 그 수정 전 값(「처음 값」 줄) */
export type RestoreTo = "BEFORE" | "AFTER";

/** POST /api/revisions/{id}/restore — 그 기록의 after · before 로. 새 RESTORE 기록이 하나 더 생긴다. 답은 임시 글로 들어간다 */
export async function restoreRevision(id: number, to: RestoreTo): Promise<RestoreResult> {
  const value = await request<RestoreResult>(`/revisions/${id}/restore`, { to }, "POST");
  if (!value?.revision) throw invalid();
  return value;
}
