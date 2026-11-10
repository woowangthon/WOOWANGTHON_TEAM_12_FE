// 내 지원서 폴더 — 폴더 · 지원서 소속을 다루는 순수 규칙 (FE#347)
// 저장 자리(store.ts)와 떼어 둔다 — BE 가 생겨도 미분류 · 개수 · 지우기 규칙은 그대로 쓴다. 브라우저 API 를 쓰지 않는다 — 단위 테스트가 그대로 부른다

export type Folder = { id: string; name: string };
export type FolderState = {
  /** 만든 순서 */
  folders: Folder[];
  /** 지원서 id → 폴더 id. 없으면 미분류. 한 지원서는 폴더 하나에만 */
  placement: Record<number, string>;
};
/** 보고 있는 묶음 — 전체 지원서 · 미분류 · 사용자 폴더 */
export type FolderView = { kind: "all" } | { kind: "unfiled" } | { kind: "folder"; id: string };

export const MAX_FOLDER_NAME = 30;
export const emptyFolderState = (): FolderState => ({ folders: [], placement: {} });

/** 폴더 이름 — 앞뒤 공백을 떼고 1 ~ 30자, 같은 이름(대소문자 무시)은 안 된다. 괜찮으면 null, 아니면 사용자에게 보일 이유 */
export function folderNameError(name: string, folders: Folder[], exceptId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "폴더 이름을 적어 주세요.";
  if (trimmed.length > MAX_FOLDER_NAME) return `폴더 이름은 ${MAX_FOLDER_NAME}자까지 쓸 수 있어요.`;
  if (trimmed === "전체 지원서" || trimmed === "미분류") return `「${trimmed}」는 이미 있는 묶음 이름이라 쓸 수 없어요.`;
  const lower = trimmed.toLowerCase();
  if (folders.some((f) => f.id !== exceptId && f.name.toLowerCase() === lower)) return "같은 이름의 폴더가 있어요.";
  return null;
}

export function addFolder(state: FolderState, folder: Folder): FolderState {
  return { ...state, folders: [...state.folders, { ...folder, name: folder.name.trim() }] };
}

export function renameFolder(state: FolderState, id: string, name: string): FolderState {
  return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) };
}

/** 폴더를 지운다 — 안의 지원서는 미분류로 돌아간다(지원서는 지우지 않는다) */
export function removeFolder(state: FolderState, id: string): FolderState {
  const placement = Object.fromEntries(Object.entries(state.placement).filter(([, folderId]) => folderId !== id));
  return { folders: state.folders.filter((f) => f.id !== id), placement };
}

/** 지원서를 폴더로 옮긴다. folderId 가 null 이거나 없는 폴더면 미분류로 */
export function moveApplication(state: FolderState, applicationId: number, folderId: string | null): FolderState {
  const placement = { ...state.placement };
  if (folderId && state.folders.some((f) => f.id === folderId)) placement[applicationId] = folderId;
  else delete placement[applicationId];
  return { ...state, placement };
}

/** 지원서가 든 폴더 — 없거나 지워진 폴더면 null(미분류) */
export function folderOf(state: FolderState, applicationId: number): Folder | null {
  const id = state.placement[applicationId];
  return (id && state.folders.find((f) => f.id === id)) || null;
}

/** 보고 있는 묶음의 지원서 — 받은 순서(최근에 넣은 것부터) 그대로 */
export function applicationsIn<T extends { id: number }>(view: FolderView, state: FolderState, applications: T[]): T[] {
  if (view.kind === "all") return applications;
  if (view.kind === "unfiled") return applications.filter((a) => !folderOf(state, a.id));
  return applications.filter((a) => folderOf(state, a.id)?.id === view.id);
}

/** 묶음마다 개수 — 지금 목록에 있는 지원서만 센다(다른 화면에서 사라진 지원서는 세지 않는다) */
export function folderCounts(state: FolderState, applications: { id: number }[]) {
  const byFolder: Record<string, number> = Object.fromEntries(state.folders.map((f) => [f.id, 0]));
  let unfiled = 0;
  for (const a of applications) {
    const folder = folderOf(state, a.id);
    if (folder) byFolder[folder.id]++;
    else unfiled++;
  }
  return { all: applications.length, unfiled, byFolder };
}

/** 지운 폴더를 보고 있었으면 전체 지원서로 */
export function validView(view: FolderView, state: FolderState): FolderView {
  return view.kind === "folder" && !state.folders.some((f) => f.id === view.id) ? { kind: "all" } : view;
}
