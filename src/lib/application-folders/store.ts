// 내 지원서 폴더의 저장 자리 — 화면은 이 모양(ApplicationFolderStore)만 부른다 (FE#347)
// BE 폴더 API 가 생기면 memoryFolderStore 대신 같은 모양의 API 구현을 넘기면 된다. 모든 메서드는 바뀐 뒤 전체 상태를 돌려준다
import { addFolder, emptyFolderState, folderNameError, moveApplication, removeFolder, renameFolder, type FolderState } from "./rules";

export type ApplicationFolderStore = {
  /** 이 저장 자리가 임시(새로고침하면 사라짐)인가 — 화면이 안내를 보인다 */
  temporary: boolean;
  load(): Promise<FolderState>;
  create(name: string): Promise<FolderState>;
  rename(id: string, name: string): Promise<FolderState>;
  remove(id: string): Promise<FolderState>;
  move(applicationId: number, folderId: string | null): Promise<FolderState>;
};

export class FolderNameError extends Error {}

// MOCK(application-folders): 폴더 · 지원서 소속을 서버에 저장하지 않고 이 탭의 메모리에만 둔다 — 새로고침하면 사라진다.
// 화면에 임시 기능 안내를 보인다. 지원서 목록은 실제 GET /api/applications 다. ETC docs/ai-scope.md §3
export function memoryFolderStore(): ApplicationFolderStore {
  let state = emptyFolderState();
  let next = 1;
  const set = (s: FolderState) => {
    state = s;
    return Promise.resolve(state);
  };
  const checked = (name: string, exceptId?: string) => {
    const error = folderNameError(name, state.folders, exceptId);
    if (error) throw new FolderNameError(error);
  };
  return {
    temporary: true,
    load: () => Promise.resolve(state),
    create: async (name) => {
      checked(name);
      return set(addFolder(state, { id: `folder-${next++}`, name }));
    },
    rename: async (id, name) => {
      checked(name, id);
      return set(renameFolder(state, id, name));
    },
    remove: (id) => set(removeFolder(state, id)),
    move: (applicationId, folderId) => set(moveApplication(state, applicationId, folderId)),
  };
}

/** 앱 안에서 하나 — 다른 화면에 갔다 와도 남고, 새로고침하면 사라진다 */
export const applicationFolderStore: ApplicationFolderStore = memoryFolderStore();
