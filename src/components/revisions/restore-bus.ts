"use client";

// 헤더 「최근 수정」에서 되돌린 결과를 열어 둔 화면에 알린다(FE#401 · S-80).
// 항목 이력(경험 · 활동 메뉴, 답칸 줄)은 그 화면이 직접 받으니 여기를 거치지 않는다
import { useEffect, useRef } from "react";
import type { RestoreResult, Revision } from "@/lib/api/revisions";

export type RestoreListener = {
  /** 되돌리기 직전 — 답칸은 기다리던 자동 저장을 먼저 보낸다(늦게 도착해 되돌린 글을 덮지 않게) */
  before?: (revision: Revision) => Promise<unknown> | void;
  /** 되돌린 결과 — 이 화면에 반영했으면 true */
  restored: (result: RestoreResult) => boolean;
};

const listeners = new Set<{ current: RestoreListener }>();

/** 화면이 열려 있는 동안 듣는다. 넘긴 함수는 렌더마다 바뀌어도 된다 */
export function useRestoreListener(listener: RestoreListener) {
  const ref = useRef(listener);
  useEffect(() => { ref.current = listener; });
  useEffect(() => { listeners.add(ref); return () => { listeners.delete(ref); }; }, []);
}

export async function beforeRestore(revision: Revision) {
  await Promise.all([...listeners].map(l => l.current.before?.(revision)));
}

/** 반영한 화면이 하나라도 있으면 true */
export function publishRestored(result: RestoreResult) {
  let handled = false;
  for (const l of [...listeners]) if (l.current.restored(result)) handled = true;
  return handled;
}
