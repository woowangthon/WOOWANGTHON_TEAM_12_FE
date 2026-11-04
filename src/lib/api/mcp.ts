import { ApiError } from "./errors";
import { isMockMode, request } from "./http";
import { mockCreateConnection, mockDeleteConnection, mockFetchConnection } from "@/lib/mock/mcp";

export type McpConnection =
  | { connected: false; createdAt: null; lastUsedAt: null }
  | { connected: true; createdAt: string; lastUsedAt: string | null };
export type McpCreated = { url: string; createdAt: string };

const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const invalid = () => new ApiError("INVALID_RESPONSE", "연결 응답을 확인하지 못했어요.");

export async function fetchMcpConnection(): Promise<McpConnection> {
  const value = isMockMode() ? await mockFetchConnection() : await request<McpConnection>("/mcp/connection");
  if (!value || (value.connected !== true && value.connected !== false)) throw invalid();
  if (value.connected ? !date(value.createdAt) || (value.lastUsedAt !== null && !date(value.lastUsedAt))
    : value.createdAt !== null || value.lastUsedAt !== null) throw invalid();
  // GET 에 예기치 않은 url 이 와도 화면 상태에 보관하지 않는다.
  return value.connected ? { connected: true, createdAt: value.createdAt, lastUsedAt: value.lastUsedAt }
    : { connected: false, createdAt: null, lastUsedAt: null };
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
