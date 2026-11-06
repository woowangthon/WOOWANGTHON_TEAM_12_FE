"use client";

// 경험 찾기(S-58) 불러오기 — 낱말을 치는 동안 잠깐 기다렸다 부른다. AI · 한도와 상관없는 낱말 맞추기라 칠 때마다 불러도 된다
import { useEffect, useState } from "react";
import { searchExperiences, type MockMode } from "@/lib/api/experience";
import type { ExperienceResult, ExperienceSearch } from "@/lib/api/types";

export type ExperienceSearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; total: number; experiences: ExperienceResult[]; refreshing: boolean };

const WAIT_MS = 250;

/** `version` 이 바뀌면 같은 조건으로 다시 부른다 — 활동 세부에서 경험을 고친 뒤 */
export function useExperienceSearch(search: ExperienceSearch, { mock = null, version = 0 }: { mock?: MockMode; version?: number } = {}) {
  const [state, setState] = useState<ExperienceSearchState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(search);

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      setState((prev) => prev.status === "ready" ? { ...prev, refreshing: true } : { status: "loading" });
      searchExperiences(JSON.parse(key) as ExperienceSearch, mock).then(
        (found) => { if (!stale) setState({ status: "ready", ...found, refreshing: false }); },
        (e: Error) => { if (!stale) setState({ status: "error", message: e.message }); },
      );
    }, WAIT_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [key, mock, version, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
