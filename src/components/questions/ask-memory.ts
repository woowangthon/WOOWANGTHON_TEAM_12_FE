"use client";

// 차곡이 되묻기를 이 브라우저에만 기억한다(S-23 · FE#547) — 서버에 보내지 않는다.
// localStorage 를 못 쓰면(시크릿 창 · 막힘) 이번 화면에서만 기억한다
import { useSyncExternalStore } from "react";

const LIMIT = 500;
const EMPTY: ReadonlySet<number> = new Set();

function idStore(key: string) {
  let ids: number[] | null = null;
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  const load = () => {
    if (ids) return;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      ids = Array.isArray(parsed) ? parsed.filter((v): v is number => Number.isInteger(v)) : [];
    } catch { ids = []; }
    snapshot = new Set(ids);
  };
  return {
    get() { load(); return snapshot; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(changed: number[], on: boolean) {
      load();
      const rest = ids!.filter(id => !changed.includes(id));
      // 오래된 것부터 버린다 — 지운 문항의 id 가 끝없이 쌓이지 않게
      ids = (on ? [...rest, ...changed] : rest).slice(-LIMIT);
      snapshot = new Set(ids);
      try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* 못 쓰면 이번 화면에서만 */ }
      listeners.forEach(l => l());
    },
  };
}

/** 건너뛴 되묻기 ID(문항 되묻기 · 초안 빈칸 질문) */
const skipped = idStore("chagok:skipped-asks");
/** 「차곡이가 물어볼 것」을 한 번 펼쳐 본 문항 ID — 처음 볼 때만 펼친다 */
const seen = idStore("chagok:asks-seen");

export function useSkippedAsks() {
  return useSyncExternalStore(skipped.subscribe, skipped.get, () => EMPTY);
}
export const skipAsks = (ids: number[]) => skipped.set(ids, true);
export const unskipAsks = (ids: number[]) => skipped.set(ids, false);

export const asksSeen = (questionId: number) => seen.get().has(questionId);
export const markAsksSeen = (questionId: number) => { if (!asksSeen(questionId)) seen.set([questionId], true); };
