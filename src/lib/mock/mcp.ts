import type { McpChange, McpConnection, McpCreated, McpUndoResult } from "@/lib/api/mcp";

// MOCK(mcp-connection): API 주소가 없을 때만 연결 관리를 모의한다. 실제 API 실패 대체용이 아니다.
// 저장소에는 비밀 주소 없이 연결 시각만 둔다. .invalid 주소는 Claude 에서 사용할 수 없다.
const KEY = "mock:mcp-connection:created-at";
const WRITE_KEY = "mock:mcp-connection:write-enabled";
export async function mockFetchConnection(): Promise<McpConnection> {
  const createdAt = sessionStorage.getItem(KEY);
  return createdAt && Number.isFinite(Date.parse(createdAt))
    ? { connected: true, writeEnabled: sessionStorage.getItem(WRITE_KEY) === "true", createdAt, lastUsedAt: null }
    : { connected: false, writeEnabled: false, createdAt: null, lastUsedAt: null };
}
export async function mockCreateConnection(): Promise<McpCreated> {
  const createdAt = new Date().toISOString();
  sessionStorage.setItem(KEY, createdAt);
  sessionStorage.removeItem(WRITE_KEY);
  return { url: "https://mcp-preview.invalid/mcp/not-a-real-connection", createdAt };
}
export async function mockDeleteConnection(): Promise<void> {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(WRITE_KEY);
}
export async function mockSetWrite(writeEnabled: boolean): Promise<McpConnection> {
  sessionStorage.setItem(WRITE_KEY, String(writeEnabled));
  return mockFetchConnection();
}

// MOCK(mcp-changes): API 주소가 없을 때만 변경 기록을 예시로 보이고, 맞아요 · 되돌리기는 이 탭의 메모리만 바꾼다. 실제 경험은 바뀌지 않는다.
const NONE = { reason: null, decidedAt: null, experience: null, source: null, application: null, supplement: null };
let changes: McpChange[] = [
  { ...NONE, id: 2, type: "UPDATE_EXPERIENCE", client: "claude-ai", reason: "(예시) 사용자가 대화에서 전부가 아니라 일부만 맡았다고 말함", status: "APPLIED", createdAt: "2026-11-05T10:20:00+09:00", undoable: true, undoBlockedReason: null,
    experience: { id: 1, activityId: 1, activityName: "(예시 활동)", beforeContent: "(예시) 백엔드 API 설계를 전부 맡았다", afterContent: "(예시) 백엔드 API 중 채팅 · 거래 API 를 설계했다", beforeSourceStatus: "SOURCE_CONFIRMED" } },
  { ...NONE, id: 1, type: "ADD_SOURCE", client: "claude-ai", status: "APPLIED", createdAt: "2026-11-05T10:15:00+09:00", undoable: true, undoBlockedReason: null,
    source: { id: 1, name: "claude-ai 에서 보냄 — 2026-11-05 10:15 (예시)", jobId: 1, jobStatus: "COMPLETED", experienceCount: 3 } },
];
function decide(id: number, status: "CONFIRMED" | "UNDONE") {
  const decided: McpChange = { ...changes.find((c) => c.id === id)!, status, decidedAt: new Date().toISOString(), undoable: false, undoBlockedReason: "DECIDED" };
  changes = changes.map((c) => c.id === id ? decided : c);
  return decided;
}
export async function mockFetchChanges() { return { changes }; }
export async function mockConfirmChange(id: number): Promise<McpChange> { return decide(id, "CONFIRMED"); }
export async function mockUndoChange(id: number): Promise<McpUndoResult> {
  const change = decide(id, "UNDONE");
  return { change, removedExperiences: change.type === "ADD_SOURCE" ? 2 : 0, keptExperiences: change.type === "ADD_SOURCE" ? 1 : 0 };
}
