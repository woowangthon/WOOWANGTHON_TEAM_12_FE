// MOCK(source-analysis): API 주소가 없는 목 모드에서만 자료 넣기 · 분석 작업을 모의한다.
// 탭 저장소(sessionStorage — 새로고침엔 남고 탭을 닫으면 사라진다)에 작업을 두고 정해진 결과로 끝낸다. 실제 API 실패 대체용이 아니다.
// 결과는 실제 분석이 아니다 — 활동 이름에 「목 결과」를 달고, 근거는 넣은 자료의 첫 줄을 「대조 안 함」으로 붙인다
// 주소에 ?analysis=fail · ?analysis=empty 를 붙이면 실패 · 활동 0개로 끝난다

import { ApiError } from "@/lib/api/errors";
import { MAX_TEXT_LENGTH, type ActivityDetail, type Job, type SourceRequest } from "@/lib/api/types";

const ANALYSIS_MS = 5000;
const JOBS_KEY = "mock:source-analysis:jobs";
const ADDED_KEY = "mock:source-analysis:activities";

type Outcome = "ok" | "fail" | "empty";
type StoredJob = {
  jobId: number;
  sourceId: number;
  name: string;
  firstLine: { text: string; line: number } | null;
  outcome: Outcome;
  startedAt: number;
  createdAt: string;
  activityIds: number[];
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면 새로고침 뒤 이어지지 않을 뿐이다
  }
}

/** 목 분석으로 더해진 활동 — 타임라인 목록 · 세부에 합쳐 보여 준다 */
export function mockAddedActivities(): ActivityDetail[] {
  return read<ActivityDetail[]>(ADDED_KEY, []);
}

function firstLineOf(text: string) {
  const lines = text.split("\n");
  const index = lines.findIndex((l) => l.trim());
  return index === -1 ? null : { text: lines[index].trim().slice(0, 200), line: index + 1 };
}

function nowText() {
  return new Date().toISOString();
}

export function mockSubmitSource(req: SourceRequest, outcome: Outcome) {
  if (!req.text.trim()) throw new ApiError("EMPTY_TEXT", "text 가 비었거나 공백뿐");
  if (req.kind === "FILE" && !/\.(md|txt|pdf|pptx)$/i.test(req.name)) {
    throw new ApiError("UNSUPPORTED_FILE_TYPE", ".md · .txt · .pdf · .pptx 가 아님");
  }
  if (req.text.length > MAX_TEXT_LENGTH) throw new ApiError("TEXT_TOO_LONG", `텍스트가 ${MAX_TEXT_LENGTH}자를 넘습니다`);

  const jobs = read<StoredJob[]>(JOBS_KEY, []);
  const jobId = 900 + jobs.length + 1;
  const job: StoredJob = {
    jobId,
    sourceId: 500 + jobs.length + 1,
    name: req.kind === "FILE" ? req.name : `붙여넣은 텍스트 ${new Date().toLocaleString("ko-KR")}`,
    firstLine: firstLineOf(req.text),
    outcome,
    startedAt: Date.now(),
    createdAt: nowText(),
    activityIds: [],
  };
  write(JOBS_KEY, [...jobs, job]);
  return { sourceId: job.sourceId, jobId, status: "ANALYZING" as const };
}

function finish(job: StoredJob) {
  if (job.outcome !== "ok" || job.activityIds.length) return;
  const added = mockAddedActivities();
  const id = 1000 + added.length + 1;
  const activity: ActivityDetail = {
    id,
    name: `${job.name} — 목 결과`,
    period: { start: null, end: null, ongoing: false },
    experiences: [
      {
        id: id * 10,
        activityId: id,
        content: "목 결과예요. 실제 AI 분석이 붙으면 이 자리에 자료에서 찾은 경험이 나와요",
        competencies: [],
        competenciesBy: "AI",
        actor: "UNKNOWN",
        sourceStatus: "NEEDS_REVIEW",
        citations: job.firstLine
          ? [
              {
                id: id * 100,
                sourceId: job.sourceId,
                sourceName: job.name,
                quote: job.firstLine.text,
                matched: null,
                location: { startLine: job.firstLine.line, endLine: job.firstLine.line },
              },
            ]
          : [],
      },
    ],
  };
  write(ADDED_KEY, [...added, activity]);
  job.activityIds = [id];
}

function toJob(job: StoredJob): Job {
  const done = Date.now() - job.startedAt >= ANALYSIS_MS;
  const base = { jobId: job.jobId, sourceId: job.sourceId, createdAt: job.createdAt, updatedAt: nowText() };
  if (!done) return { ...base, status: "ANALYZING", activityIds: [], error: null };
  if (job.outcome === "fail") {
    return {
      ...base,
      status: "FAILED",
      activityIds: [],
      error: { code: "AI_TIMEOUT", message: "AI 서버가 120초 안에 답하지 않았습니다" },
    };
  }
  return { ...base, status: "COMPLETED", activityIds: job.activityIds, error: null };
}

export function mockFetchJob(jobId: number): Job {
  const jobs = read<StoredJob[]>(JOBS_KEY, []);
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) throw new ApiError("JOB_NOT_FOUND", `작업 ${jobId} 이 없습니다`);
  if (Date.now() - job.startedAt >= ANALYSIS_MS) {
    finish(job);
    write(JOBS_KEY, jobs);
  }
  return toJob(job);
}

/** 다시 시도 — 목에선 두 번째엔 성공한다 */
export function mockRetryJob(jobId: number): Job {
  const jobs = read<StoredJob[]>(JOBS_KEY, []);
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) throw new ApiError("JOB_NOT_FOUND", `작업 ${jobId} 이 없습니다`);
  if (toJob(job).status !== "FAILED") throw new ApiError("JOB_NOT_FAILED", "실패 상태가 아닌 작업");
  Object.assign(job, { outcome: "ok", startedAt: Date.now() });
  write(JOBS_KEY, jobs);
  return toJob(job);
}
