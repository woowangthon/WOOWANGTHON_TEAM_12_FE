"use client";

// 지금 돌고 있는 분석 작업 하나를 따라간다 — 2초마다 상태를 묻고, jobId 를 브라우저 저장소에 둬서 새로고침해도 이어진다 (SPEC S-02)
import { useEffect, useRef, useState } from "react";
import { ApiError, fetchJob, retryJob, isMockMode } from "@/lib/api/experience";
import type { Job } from "@/lib/api/types";

const POLL_MS = 2000;
// 목 작업과 다른 서버의 작업 ID 를 현재 서버에 보내지 않는다.
const storageKey = () => `analysis:pending-job:${isMockMode() ? "mock" : process.env.NEXT_PUBLIC_API_BASE_URL!.trim().replace(/\/+$/, "")}`;

type Pending = { jobId: number; name: string };

export type TrackedJob = Pending & {
  /** 마지막으로 받은 상태. 아직 한 번도 못 받았으면 null */
  job: Job | null;
  /** 상태 조회 자체가 실패했다(네트워크 등) — 분석이 실패한 것과 다르다 */
  checkFailed: boolean;
  checkError?: string;
};

function loadPending(): Pending | null {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(storageKey());
    const value = raw ? JSON.parse(raw) : null;
    return value && Number.isSafeInteger(value.jobId) && value.jobId > 0 && typeof value.name === "string"
      ? { jobId: value.jobId, name: value.name }
      : null;
  } catch {
    return null;
  }
}

function savePending(pending: Pending | null) {
  try {
    if (pending) localStorage.setItem(storageKey(), JSON.stringify(pending));
    else localStorage.removeItem(storageKey());
  } catch {
    // 저장소를 못 쓰면 새로고침 뒤 이어지지 않을 뿐이다
  }
}

/** onCompleted — 분석이 끝났을 때 한 번(활동이 0개여도) */
export function useAnalysisJob(onCompleted: (job: Job) => void | Promise<void>) {
  const [tracked, setTracked] = useState<TrackedJob | null>(null);
  const generation = useRef(0);
  const retrying = useRef(false);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  const jobId = tracked?.jobId;
  useEffect(() => {
    // 서버 렌더링과 첫 클라이언트 렌더링을 같게 두고 저장소를 복원한다.
    const timer = setTimeout(() => {
      if (generation.current !== 0) return;
      const pending = loadPending();
      if (pending) setTracked({ ...pending, job: null, checkFailed: false });
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const waiting = !!tracked && !tracked.checkFailed && (tracked.job == null || tracked.job.status === "ANALYZING");

  useEffect(() => {
    if (jobId == null || !waiting) return;
    let cancelled = false;
    const version = generation.current;
    const timer = setTimeout(
      () => {
        fetchJob(jobId).then(
          (job) => {
            if (cancelled || version !== generation.current) return;
            // 활동이 생긴 완료는 알림으로 끝 — 더 들고 있지 않는다. 0개 · 실패는 상태 화면에 남겨 둔다
            const done = job.status === "COMPLETED" && job.activityIds.length > 0;
            setTracked((prev) => (prev?.jobId !== jobId ? prev : done ? null : { ...prev, job }));
            if (job.status === "COMPLETED") {
              savePending(null);
              void onCompletedRef.current(job);
            }
          },
          (e) => {
            if (cancelled || version !== generation.current) return;
            // 저장해 둔 작업이 서버에 없다(지워졌거나 다른 브라우저 저장소) — 더 따라갈 게 없다
            if (e instanceof ApiError && e.code === "JOB_NOT_FOUND") {
              savePending(null);
            }
            setTracked((prev) => (prev?.jobId === jobId ? {
              ...prev, checkFailed: true,
              checkError: e instanceof Error ? e.message : "분석 상태를 확인하지 못했어요.",
            } : prev));
          },
        );
      },
      // 새로고침 직후 첫 조회는 바로
      tracked?.job == null ? 0 : POLL_MS,
    );
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, waiting, tracked?.job]);

  return {
    tracked,
    start(pending: Pending) {
      ++generation.current;
      savePending(pending);
      setTracked({ ...pending, job: null, checkFailed: false });
    },
    /** 분석 실패 → 같은 원본으로 다시 */
    async retry() {
      if (!tracked || retrying.current) return;
      retrying.current = true;
      const version = ++generation.current;
      try {
        const job = await retryJob(tracked.jobId);
        if (version !== generation.current) return;
        savePending({ jobId: tracked.jobId, name: tracked.name });
        setTracked({ ...tracked, job, checkFailed: false, checkError: undefined });
      } finally {
        retrying.current = false;
      }
    },
    /** 상태 조회 실패 → 다시 묻기 */
    recheck() {
      ++generation.current;
      if (tracked) setTracked({ ...tracked, job: null, checkFailed: false, checkError: undefined });
    },
    /** 알림을 닫는다 — 실패한 작업도 더 따라가지 않는다(자료는 BE 에 남아 있다) */
    dismiss() {
      ++generation.current;
      savePending(null);
      setTracked(null);
    },
  };
}
