import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import { mockConfirmChange, mockCreateConnection, mockDeleteConnection, mockFetchChanges, mockFetchConnection, mockSetWrite, mockUndoChange } from "@/lib/mock/mcp";
import type { JobStatus, SourceStatus } from "./types";

export type McpConnection =
  | { connected: false; writeEnabled: false; createdAt: null; lastUsedAt: null }
  | { connected: true; writeEnabled: boolean; createdAt: string; lastUsedAt: string | null };
export type McpCreated = { url: string; createdAt: string };

/** 변경 한 건 — type 에 맞는 칸(experience · source · application · supplement) 하나만 찬다(mcp-api.md 「변경 기록」) */
export type McpChange = {
  id: number;
  type: "ADD_SOURCE" | "UPDATE_EXPERIENCE" | "CREATE_APPLICATION" | "ANSWER_CLARIFICATION";
  /** 클라이언트가 보낸 이름 — 표시용 */
  client: string;
  /** UPDATE_EXPERIENCE 만 있다 */
  reason: string | null;
  status: "APPLIED" | "CONFIRMED" | "UNDONE";
  createdAt: string;
  decidedAt: string | null;
  undoable: boolean;
  undoBlockedReason: "DECIDED" | "CHANGED_AFTER" | "ANALYZING" | "ANALYSIS_FAILED" | null;
  experience: { id: number; activityId: number; activityName: string; beforeContent: string; afterContent: string; beforeSourceStatus: SourceStatus } | null;
  source: { id: number; name: string; jobId: number; jobStatus: JobStatus | "QUEUED"; experienceCount: number } | null;
  application: { id: number; organization: string | null; questionCount: number; analyzingCount: number } | null;
  supplement: { id: number; experienceId: number; activityName: string; question: string; answer: string } | null;
};
export type McpUndoResult = { change: McpChange; removedExperiences: number; keptExperiences: number };

/** 「Claude 가 고침」의 이름 — client 는 claude-ai 같은 기계 이름으로 온다 */
export const mcpClientName = (client: string) => /claude/i.test(client) ? "Claude" : client;

const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const invalid = () => new ApiError("INVALID_RESPONSE", "연결 응답을 확인하지 못했어요.");

function parseConnection(value: McpConnection): McpConnection {
  if (!value || (value.connected !== true && value.connected !== false)) throw invalid();
  if (value.connected ? !date(value.createdAt) || (value.lastUsedAt !== null && !date(value.lastUsedAt))
    : value.createdAt !== null || value.lastUsedAt !== null) throw invalid();
  // GET 에 예기치 않은 url 이 와도 화면 상태에 보관하지 않는다.
  return value.connected ? { connected: true, writeEnabled: value.writeEnabled === true, createdAt: value.createdAt, lastUsedAt: value.lastUsedAt }
    : { connected: false, writeEnabled: false, createdAt: null, lastUsedAt: null };
}

export async function fetchMcpConnection(): Promise<McpConnection> {
  return parseConnection(isMockMode() ? await mockFetchConnection() : await request<McpConnection>("/mcp/connection"));
}

/** PATCH /api/mcp/connection — 쓰기 켜기 · 끄기. 주소는 그대로다 */
export async function setMcpWrite(writeEnabled: boolean): Promise<McpConnection> {
  return parseConnection(isMockMode() ? await mockSetWrite(writeEnabled) : await request<McpConnection>("/mcp/connection", { writeEnabled }, "PATCH"));
}

export async function createMcpConnection(): Promise<McpCreated> {
  const value = isMockMode() ? await mockCreateConnection() : await request<McpCreated>("/mcp/connection", undefined, "POST");
  if (!value || !date(value.createdAt) || typeof value.url !== "string") throw invalid();
  try {
    const url = new URL(value.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw invalid();
  } catch { throw invalid(); }
  return { url: value.url, createdAt: value.createdAt };
}

export async function deleteMcpConnection(): Promise<void> {
  if (isMockMode()) return mockDeleteConnection();
  return request<void>("/mcp/connection", undefined, "DELETE");
}

/** GET /api/mcp/changes — 최근 100건, 새것 먼저 */
export async function fetchMcpChanges(): Promise<McpChange[]> {
  const value = isMockMode() ? await mockFetchChanges() : await request<{ changes: McpChange[] }>("/mcp/changes");
  if (!Array.isArray(value?.changes)) throw new ApiError("INVALID_RESPONSE", "변경 기록 응답을 확인하지 못했어요.");
  return value.changes;
}

export async function undoMcpChange(id: number): Promise<McpUndoResult> {
  return isMockMode() ? mockUndoChange(id) : request<McpUndoResult>(`/mcp/changes/${id}/undo`, undefined, "POST");
}

export async function confirmMcpChange(id: number): Promise<McpChange> {
  if (isMockMode()) return mockConfirmChange(id);
  return (await request<{ change: McpChange }>(`/mcp/changes/${id}/confirm`, undefined, "POST")).change;
}
