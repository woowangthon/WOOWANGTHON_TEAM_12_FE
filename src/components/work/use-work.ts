"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compareWorkTimes, fetchWork, markWorkSeen, type WorkSnapshot } from "@/lib/api/work";
import { isMockMode } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";

const later = (a: string | null, b: string | null) => !a || (b && compareWorkTimes(b, a) > 0) ? b : a;

/** 공통 틀에서 한 요청이 끝난 뒤 다음 요청을 예약한다. 숨김·로그아웃은 진행 중 요청도 취소한다. */
export function useWork() {
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenError, setSeenError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const refreshRef = useRef(() => {});
  const session = useRef<{ alive: boolean; seen: AbortController | null; queuedSeen: string | null }>({ alive: false, seen: null, queuedSeen: null });
  const seenAt = useRef<string | null>(null);

  useEffect(() => {
    if (isMockMode()) return;
    const scope = { alive: true, seen: null as AbortController | null, queuedSeen: null as string | null };
    session.current = scope;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: AbortController | null = null;
    let activeCount = 0;
    let unauthorized = false;
    // 읽는 중에 새로 읽어 달라는 요청이 왔다 — 그 응답은 자료를 넣기 전 상태일 수 있어 끝나는 대로 한 번 더 읽는다(FE#244)
    let again = false;
    const read = async () => {
      clearTimeout(timer);
      if (current) { again = true; return; }
      if (!scope.alive || document.hidden || unauthorized) return;
      const controller = new AbortController();
      current = controller;
      try {
        const next = await fetchWork(controller.signal);
        if (!scope.alive || controller.signal.aborted) return;
        seenAt.current = later(seenAt.current, next.seenAt);
        activeCount = next.inProgress.length;
        setSnapshot({ ...next, seenAt: seenAt.current });
        setError(null);
      } catch (e) {
        if (!scope.alive || controller.signal.aborted) return;
        unauthorized = e instanceof ApiError && e.status === 401;
        if (unauthorized) setSnapshot(null);
        setError(e instanceof Error ? e.message : "작업 상태를 불러오지 못했어요.");
      } finally {
        if (current === controller) {
          current = null;
          const now = again;
          again = false;
          if (scope.alive && !document.hidden && !unauthorized) timer = setTimeout(read, now ? 0 : activeCount ? 3000 : 30000);
        }
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) { current?.abort(); current = null; again = false; }
      else void read();
    };
    refreshRef.current = () => { void read(); };
    document.addEventListener("visibilitychange", visibility);
    void read();
    return () => {
      scope.alive = false;
      clearTimeout(timer);
      current?.abort(); scope.seen?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const markSeen = useCallback(async function saveSeen(value: string | null): Promise<void> {
    const scope = session.current;
    if (!value || !scope.alive) return;
    if (scope.seen) { scope.queuedSeen = later(scope.queuedSeen, value); return; }
    const controller = new AbortController();
    scope.seen = controller;
    setMarking(true); setSeenError(null);
    try {
      const saved = await markWorkSeen(value, controller.signal);
      if (!scope.alive) return;
      seenAt.current = later(seenAt.current, saved.seenAt);
      setSnapshot(prev => prev && ({ ...prev, seenAt: seenAt.current }));
    } catch (e) {
      if (scope.alive) setSeenError(e instanceof Error ? e.message : "읽음 상태를 저장하지 못했어요.");
    } finally {
      scope.seen = null;
      if (scope.alive) {
        setMarking(false);
        const queued = scope.queuedSeen;
        scope.queuedSeen = null;
        if (queued && (!seenAt.current || compareWorkTimes(queued, seenAt.current) > 0)) void saveSeen(queued);
      }
    }
  }, []);
  return { snapshot, error, seenError, marking, markSeen, refresh: () => refreshRef.current() };
}
