import type { McpConnection, McpCreated } from "@/lib/api/mcp";

// MOCK(mcp-connection): API 주소가 없을 때만 연결 관리를 모의한다. 실제 API 실패 대체용이 아니다.
// 저장소에는 비밀 주소 없이 연결 시각만 둔다. .invalid 주소는 Claude 에서 사용할 수 없다.
const KEY = "mock:mcp-connection:created-at";
export async function mockFetchConnection(): Promise<McpConnection> {
  const createdAt = sessionStorage.getItem(KEY);
  return createdAt && Number.isFinite(Date.parse(createdAt))
    ? { connected: true, createdAt, lastUsedAt: null }
    : { connected: false, createdAt: null, lastUsedAt: null };
}
export async function mockCreateConnection(): Promise<McpCreated> {
  const createdAt = new Date().toISOString();
  sessionStorage.setItem(KEY, createdAt);
  return { url: "https://mcp-preview.invalid/mcp/not-a-real-connection", createdAt };
}
export async function mockDeleteConnection(): Promise<void> {
  sessionStorage.removeItem(KEY);
}
