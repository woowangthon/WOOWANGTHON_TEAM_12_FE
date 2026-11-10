"use client";

// 내 지원서 폴더 상태 — 저장 자리(ApplicationFolderStore)를 부르고 받은 상태를 그린다 (FE#347)
// BE 가 생기면 store 만 바꿔 넘긴다. 이름 규칙 오류는 FolderNameError 로 와서 대화창이 보인다
import { useEffect, useState } from "react";
import type { ApplicationFolderStore } from "@/lib/application-folders/store";
import type { FolderState } from "@/lib/application-folders/rules";

export function useApplicationFolders(store: ApplicationFolderStore) {
  const [state, setState] = useState<FolderState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    store.load().then(
      (s) => { if (live) setState(s); },
      () => { if (live) setError("폴더를 불러오지 못했어요."); },
    );
    return () => { live = false; };
  }, [store]);

  /** 바꾼 뒤 상태를 받아 그린다. 실패는 부른 쪽(대화창 · 메뉴)이 받는다 */
  const run = async (action: () => Promise<FolderState>) => {
    const next = await action();
    setState(next);
    setError(null);
    return next;
  };

  return {
    state,
    error,
    temporary: store.temporary,
    create: (name: string) => run(() => store.create(name)),
    rename: (id: string, name: string) => run(() => store.rename(id, name)),
    remove: (id: string) => run(() => store.remove(id)),
    move: (applicationId: number, folderId: string | null) => run(() => store.move(applicationId, folderId)),
  };
}
