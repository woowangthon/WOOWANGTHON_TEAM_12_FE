// ETC docs/contracts/chagok-api.md — 차곡이 일(S-31). 진행 중인 일 찾기만 work-api.md(S-47)
import { ApiError } from "./errors";
import { request } from "./http";
import type { Experience, Supplement } from "./types";
import { MAX_TEXT_LENGTH } from "./types";

export type ChagokRunStatus = "RUNNING" | "WAITING_CONFIRM" | "DONE" | "FAILED" | "CANCELED";
export type ChagokToolCallStep = {
  seq: number; type: "TOOL_CALL"; label: string; tool: string; arguments: unknown;
  ok: boolean; summary: string | null; result: unknown; error: { code: string; message: string } | null; at: string;
};
export type ChagokMessageStep = { seq: number; type: "MESSAGE"; label: null; text: string; at: string };
export type ChagokConfirmStep = { seq: number; type: "CONFIRM"; label: string; tool: string; arguments: unknown; at: string };
export type ChagokStep = ChagokToolCallStep | ChagokMessageStep | ChagokConfirmStep;
export type ChagokRunResult =
  | { tool: "create_application"; applicationId: number; questionIds: number[] }
  | { tool: "add_source"; sourceId: number; jobId: number };
export type ChagokRun = {
  runId: number;
  text: string;
  questionId: number | null;
  status: ChagokRunStatus;
  steps: ChagokStep[];
  result: ChagokRunResult | null;
  error: { code: string; message: string } | null;
  /** 일을 시작한 때 — 진행 중 지난 시간(FE#338). 처음 만든 로컬 Run 에는 아직 없다 */
  createdAt?: string;
};

function checked(run: ChagokRun | null | undefined): ChagokRun {
  if (!run || !Array.isArray(run.steps)) throw new ApiError("INVALID_RESPONSE", "차곡이 일을 읽지 못했어요. 다시 시도해 주세요.");
  return run;
}

export async function startChagokRun(text: string, questionId: number | null): Promise<number> {
  if (text.length > MAX_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", "한 번에 50,000자까지 부탁할 수 있어요.");
  const { runId } = await request<{ runId: number }>("/chagok/runs", { text, questionId }, "POST");
  return runId;
}
export const fetchChagokRun = async (runId: number) => checked(await request<ChagokRun>(`/chagok/runs/${runId}`));
export const confirmChagokRun = async (runId: number) => checked(await request<ChagokRun>(`/chagok/runs/${runId}/confirm`, undefined, "POST"));
export const cancelChagokRun = async (runId: number) => checked(await request<ChagokRun>(`/chagok/runs/${runId}/cancel`, undefined, "POST"));

/** 지금 도는 차곡이 일 — 409 RUN_IN_PROGRESS 뒤에 어느 일인지 찾는다(chagok-api 「POST /api/chagok/runs」). 없으면 null */
export async function findRunningChagokRun(): Promise<number | null> {
  const { inProgress } = await request<{ inProgress: { kind: string; status: string; runId: number | null }[] }>("/work");
  return inProgress.find(work => work.kind === "CHAGOK" && work.status === "RUNNING")?.runId ?? null;
}

export type FoundExperience = { activityName: string; experience: Experience & { supplements: Supplement[] } };
type ExperienceInResult = Experience & { activity?: { name: string } };

/** 읽기 도구의 결과에서 경험 카드를 꺼낸다 — search_experiences · get_activity 모양(mcp-api.md). list_activities 는 활동만이라 없다 */
export function foundExperiences(result: unknown): FoundExperience[] {
  if (typeof result !== "object" || result === null) return [];
  const { experiences, name } = result as { experiences?: ExperienceInResult[]; name?: string };
  if (!Array.isArray(experiences)) return [];
  return experiences.map(experience => ({
    activityName: experience.activity?.name ?? name ?? "활동",
    experience: { ...experience, citations: experience.citations ?? [], supplements: experience.supplements ?? [] },
  }));
}
