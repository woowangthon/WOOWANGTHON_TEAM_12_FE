"use client";

// 지금 돌고 있는 분석 작업 하나를 따라간다 — 2초마다 상태를 묻고, jobId 를 브라우저 저장소에 둬서 새로고침해도 이어진다 (SPEC S-02)
import { useEffect, useRef, useState } from "react";
import { ApiError, fetchJob, retryJob } from "@/lib/api/experience";
import type { Job } from "@/lib/api/types";

const POLL_MS = 2000;
const STORAGE_KEY = "analysis:pending-job";

type Pending = { jobId: number; name: string };

export type TrackedJob = Pending & {
  /** 마지막으로 받은 상태. 아직 한 번도 못 받았으면 null */
  job: Job | null;
  /** 상태 조회 자체가 실패했다(네트워크 등) — 분석이 실패한 것과 다르다 */
  checkFailed: boolean;
};

function loadPending(): Pending | null {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function savePending(pending: Pending | null) {
  try {
    if (pending) localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰면 새로고침 뒤 이어지지 않을 뿐이다
  }
}

/** onCompleted — 분석이 끝났을 때 한 번(활동이 0개여도) */
export function useAnalysisJob(onCompleted: (job: Job) => void) {
  const [tracked, setTracked] = useState<TrackedJob | null>(() => {
    const pending = loadPending();
    return pending && { ...pending, job: null, checkFailed: false };
  });
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  const jobId = tracked?.jobId;
  const waiting = !!tracked && !tracked.checkFailed && (tracked.job == null || tracked.job.status === "ANALYZING");

  useEffect(() => {
    if (jobId == null || !waiting) return;
    const timer = setTimeout(
      () => {
        fetchJob(jobId).then(
          (job) => {
            // 활동이 생긴 완료는 알림으로 끝 — 더 들고 있지 않는다. 0개 · 실패는 상태 화면에 남겨 둔다
            const done = job.status === "COMPLETED" && job.activityIds.length > 0;
            setTracked((prev) => (prev?.jobId !== jobId ? prev : done ? null : { ...prev, job }));
            if (job.status === "COMPLETED") {
              savePending(null);
              onCompletedRef.current(job);
            }
          },
          (e) => {
            // 저장해 둔 작업이 서버에 없다(지워졌거나 다른 브라우저 저장소) — 더 따라갈 게 없다
            if (e instanceof ApiError && e.code === "JOB_NOT_FOUND") {
              savePending(null);
              setTracked((prev) => (prev?.jobId === jobId ? null : prev));
              return;
            }
            setTracked((prev) => (prev?.jobId === jobId ? { ...prev, checkFailed: true } : prev));
          },
        );
      },
      // 새로고침 직후 첫 조회는 바로
      tracked?.job == null ? 0 : POLL_MS,
    );
    return () => clearTimeout(timer);
  }, [jobId, waiting, tracked?.job]);

  return {
    tracked,
    start(pending: Pending) {
      savePending(pending);
      setTracked({ ...pending, job: null, checkFailed: false });
    },
    /** 분석 실패 → 같은 원본으로 다시 */
    async retry() {
      if (!tracked) return;
      const job = await retryJob(tracked.jobId);
      setTracked({ ...tracked, job, checkFailed: false });
    },
    /** 상태 조회 실패 → 다시 묻기 */
    recheck() {
      if (tracked) setTracked({ ...tracked, checkFailed: false });
    },
    /** 알림을 닫는다 — 실패한 작업도 더 따라가지 않는다(자료는 BE 에 남아 있다) */
    dismiss() {
      savePending(null);
      setTracked(null);
    },
  };
}
