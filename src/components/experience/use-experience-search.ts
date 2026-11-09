"use client";

// 경험 찾기(S-58) 불러오기 — 낱말을 치는 동안 잠깐 기다렸다 부른다. AI · 한도와 상관없는 낱말 맞추기라 칠 때마다 불러도 된다
import { useEffect, useState } from "react";
import { searchExperiences, type MockMode } from "@/lib/api/experience";
import type { ExperienceResult, ExperienceSearch } from "@/lib/api/types";

export type ExperienceSearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  // forKey — 이 결과가 어느 조건의 것인지. 조건이 바뀌면 (기다리는 250ms 안에도) 새 결과를 찾는 중이다
  | { status: "ready"; total: number; experiences: ExperienceResult[]; refreshing: boolean; forKey: string };

const WAIT_MS = 250;

/** `version` 이 바뀌면 같은 조건으로 다시 부른다 — 활동 세부에서 경험을 고친 뒤. `enabled` 가 false 면 부르지 않는다 */
export function useExperienceSearch(search: ExperienceSearch, { mock = null, version = 0, enabled = true }: { mock?: MockMode; version?: number; enabled?: boolean } = {}) {
  const [state, setState] = useState<ExperienceSearchState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(search);

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const timer = setTimeout(() => {
      setState((prev) => prev.status === "ready" ? { ...prev, refreshing: true } : { status: "loading" });
      searchExperiences(JSON.parse(key) as ExperienceSearch, mock).then(
        (found) => { if (!stale) setState({ status: "ready", ...found, refreshing: false, forKey: key }); },
        (e: Error) => { if (!stale) setState({ status: "error", message: e.message }); },
      );
    }, WAIT_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [key, mock, version, attempt, enabled]);

  /** 다시 불러오는 동안에도 저장 표시가 앞 값으로 돌아가지 않게 받은 줄을 바로 고친다 */
  const patch = (id: number, change: Partial<ExperienceResult>) =>
    setState((prev) => prev.status === "ready" ? { ...prev, experiences: prev.experiences.map((e) => e.id === id ? { ...e, ...change } : e) } : prev);

  // 눌렀거나 친 순간부터 응답까지 true — 이전 결과는 그대로 두고 화면이 「찾는 중」임을 보이게 한다
  const view: ExperienceSearchState = state.status === "ready" && state.forKey !== key ? { ...state, refreshing: true } : state;

  return { state: view, retry: () => setAttempt((n) => n + 1), patch };
}
