"use client";

// 지금 돌고 있는 분석 작업들을 따라간다 — 2초마다 상태를 묻고, jobId 를 브라우저 저장소에 둬서 새로고침해도 이어진다 (SPEC S-02 · S-59)
// 작업 하나면 끝날 때 사라지고, 묶음(여러 파일)이면 파일마다 상태가 보이도록 사용자가 닫을 때까지 남는다
import { useEffect, useRef, useState } from "react";
import { ApiError, fetchJob, retryJob, isMockMode } from "@/lib/api/experience";
import { useWorkRefresh } from "@/components/work/work-provider";
import type { Job } from "@/lib/api/types";

const POLL_MS = 2000;
// 목 작업과 다른 서버의 작업 ID 를 현재 서버에 보내지 않는다.
const storageKey = () => `analysis:pending-job:${isMockMode() ? "mock" : process.env.NEXT_PUBLIC_API_BASE_URL!.trim().replace(/\/+$/, "")}`;

export type PendingJob = {
  jobId: number;
  name: string;
  /** 「자료 더하기」(S-60)로 넣은 활동 */
  targetActivityId?: number;
};
type Stored = PendingJob & {
  /** 완료를 이미 알렸다 — 새로고침 뒤 다시 알리지 않는다 */
  notified?: boolean;
};

export type TrackedJob = Stored & {
  /** 마지막으로 받은 상태. 아직 한 번도 못 받았으면 null */
  job: Job | null;
  /** 상태 조회 자체가 실패했다(네트워크 등) — 분석이 실패한 것과 다르다 */
  checkFailed: boolean;
  checkError?: string;
  /** 서버에 없는 작업 — 저장소에 다시 남기지 않는다 */
  gone?: boolean;
};

const isStored = (value: Stored | null): value is Stored =>
  !!value && Number.isSafeInteger(value.jobId) && value.jobId > 0 && typeof value.name === "string";
const stored = ({ jobId, name, targetActivityId, notified }: Stored): Stored => ({ jobId, name, targetActivityId, notified });

function loadPending(): Stored[] {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(storageKey());
    const value = raw ? JSON.parse(raw) : [];
    return (Array.isArray(value) ? value : [value]).filter(isStored).map(stored);
  } catch {
    return [];
  }
}

/** 넣은 자료의 분석을 아직 따라가는 중인가 — 다른 화면에서 「자료 넣기」로 넘어올 때(FE#64) */
export const hasPendingAnalysis = () => loadPending().some((p) => !p.notified);

function savePending(pending: Stored[]) {
  try {
    if (pending.length) localStorage.setItem(storageKey(), JSON.stringify(pending));
    else localStorage.removeItem(storageKey());
  } catch {
    // 저장소를 못 쓰면 새로고침 뒤 이어지지 않을 뿐이다
  }
}

export const isWaiting = (t: TrackedJob) => !t.checkFailed && (t.job == null || t.job.status === "ANALYZING" || t.job.status === "QUEUED");

/** 하나만 넣은 작업이 끝났을 때 더 보일 게 없나. 활동이 생긴 완료는 알림으로 끝, 0개 · 대상 못 찾음은 상태 화면에 남긴다 */
const nothingToShow = (job: Job) => (job.targetActivityId == null ? job.activityIds.length > 0 : job.targetMatched === true);

/** onCompleted — 작업마다 분석이 끝났을 때 한 번(활동이 0개여도). batch 면 묶음 안의 파일이다 */
export function useAnalysisJob(onCompleted: (job: Job, context: { batch: boolean }) => void | Promise<void>) {
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [tick, setTick] = useState(0);
  const jobsRef = useRef<TrackedJob[]>([]);
  const generation = useRef(0);
  const retrying = useRef(new Set<number>());
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  });
  // 우측 상단 「할 일 · 소식」을 이 화면의 띠와 같은 때에 맞춘다(FE#244) — 넣은 직후 · 다시 시도 · 끝난 직후
  const refreshWork = useWorkRefresh();

  useEffect(() => {
    // 서버 렌더링과 첫 클라이언트 렌더링을 같게 두고 저장소를 복원한다.
    const timer = setTimeout(() => {
      if (generation.current !== 0) return;
      const pending = loadPending();
      if (!pending.length) return;
      jobsRef.current = pending.map((p) => ({ ...p, job: null, checkFailed: false }));
      setJobs(jobsRef.current);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const waitingIds = jobs.filter(isWaiting).map((t) => t.jobId).join(",");
  // 새로고침 직후 · 다시 확인 뒤 첫 조회는 바로
  const unknown = jobs.some((t) => isWaiting(t) && t.job == null);

  useEffect(() => {
    if (!waitingIds) return;
    const ids = waitingIds.split(",").map(Number);
    let cancelled = false;
    const version = generation.current;
    const timer = setTimeout(async () => {
      const results = await Promise.allSettled(ids.map((id) => fetchJob(id)));
      if (cancelled) return;
      // 그새 다시 시도 · 다시 확인을 눌렀다 — 이 응답은 버리고 다음 차례에 다시 묻는다
      if (version !== generation.current) return setTick((n) => n + 1);
      const current = jobsRef.current;
      const batch = current.length > 1;
      const completed: Job[] = [];
      let finished = false;
      commit(current.flatMap((t): TrackedJob[] => {
        const index = ids.indexOf(t.jobId);
        if (index < 0) return [t];
        const result = results[index];
        if (result.status === "rejected") {
          const e = result.reason;
          // 저장해 둔 작업이 서버에 없다(지워졌거나 다른 브라우저 저장소) — 더 따라갈 게 없다
          const gone = e instanceof ApiError && e.code === "JOB_NOT_FOUND";
          return [{ ...t, gone, checkFailed: true, checkError: e instanceof Error ? e.message : "분석 상태를 확인하지 못했어요." }];
        }
        const job = result.value;
        if ((job.status === "COMPLETED" || job.status === "FAILED") && t.job?.status !== job.status) finished = true;
        if (job.status !== "COMPLETED") return [{ ...t, job }];
        if (!t.notified) completed.push(job);
        return !batch && nothingToShow(job) ? [] : [{ ...t, job, notified: true }];
      }));
      setTick((n) => n + 1);
      if (finished) refreshWork();
      completed.forEach((job) => void onCompletedRef.current(job, { batch }));
    }, unknown ? 0 : POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [waitingIds, unknown, tick, refreshWork]);

  function commit(next: TrackedJob[]) {
    jobsRef.current = next;
    setJobs(next);
    // 하나만 넣은 작업이 끝나면 다시 볼 게 없다. 「찾지 못했어요」는 새로고침해도 남긴다
    const finished = (t: TrackedJob) => next.length === 1 && t.job?.status === "COMPLETED" && t.targetActivityId == null;
    savePending(next.filter((t) => !t.gone && !finished(t)).map(stored));
  }

  /** 분석 실패 → 같은 원본으로 다시. 묶음의 작업도 차례를 기다리지 않고 바로 돈다 */
  const retryOne = async (jobId: number) => {
    if (retrying.current.has(jobId)) return;
    retrying.current.add(jobId);
    ++generation.current;
    try {
      const job = await retryJob(jobId);
      ++generation.current;
      commit(jobsRef.current.map((t) => (t.jobId === jobId ? { ...t, job, gone: false, checkFailed: false, checkError: undefined } : t)));
      refreshWork();
    } finally {
      retrying.current.delete(jobId);
    }
  };

  /** 상태 조회 실패 → 다시 묻기 */
  const recheckOne = (jobId: number) => {
    ++generation.current;
    commit(jobsRef.current.map((t) => (t.jobId === jobId ? { ...t, job: null, checkFailed: false, checkError: undefined } : t)));
  };

  return {
    /** 작업이 하나일 때 그 작업. 묶음이면 null — jobs 로 그린다 */
    tracked: jobs.length === 1 ? jobs[0] : null,
    jobs,
    /** 아직 끝나지 않은 작업이 있다 — 더 넣기를 막는다 */
    busy: jobs.some(isWaiting),
    start(pending: PendingJob[]) {
      ++generation.current;
      commit(pending.map((p) => ({ ...p, job: null, checkFailed: false })));
      refreshWork();
    },
    async retry() {
      if (jobsRef.current.length === 1) await retryOne(jobsRef.current[0].jobId);
    },
    recheck() {
      if (jobsRef.current.length === 1) recheckOne(jobsRef.current[0].jobId);
    },
    retryJob: retryOne,
    recheckJob: recheckOne,
    /** 알림을 닫는다 — 실패한 작업도 더 따라가지 않는다(자료는 BE 에 남아 있다) */
    dismiss() {
      ++generation.current;
      commit([]);
    },
  };
}
