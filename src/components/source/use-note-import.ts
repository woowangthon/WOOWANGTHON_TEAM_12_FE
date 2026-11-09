"use client";

// 폴더 · Notion ZIP 가져오기 — 노트 목록을 만들고 10개까지 고른다. 고른 노트는 useFilePicks 로 넘겨 S-59 그대로 넣는다 (SPEC S-62 · S-63, FE#127)
// 글자는 브라우저 안에서만 읽는다. 링크를 찾으려고 .md · .txt 는 목록을 만들 때 읽는다
import { useRef, useState } from "react";
import { fileType, MAX_FILE_BYTES } from "@/lib/source-file/read";
import { isFolderNote, linkedNotes, splitPath, type NotePath } from "@/lib/source-file/notes";
import { emptySelection, toggleNote, type NoteSelection } from "@/lib/source-file/note-select";
import type { PickedFile } from "./use-file-picks";

export type ImportNote = NotePath & { file: File; links: string[] };
export type FolderItem = { file: File; path: string };

export type NoteImport =
  | { status: "idle" }
  | { status: "reading"; from: "folder" | "notion" }
  | { status: "error"; message: string }
  | { status: "ready"; from: "folder" | "notion"; label: string; notes: ImportNote[] };

const NO_NOTES = "이 폴더에서 노트를 찾지 못했어요 — .md · .txt · .pdf · .pptx 파일이 있는지 확인해 주세요. 점(.)으로 시작하는 폴더는 읽지 않아요.";
const NOT_READ = "노트 목록을 만들지 못했어요. 다시 골라 주세요.";

/** 목록 안 노트마다 링크한 노트를 찾는다 — 글은 링크를 찾는 데만 쓴다 */
function withLinks(items: (NotePath & { file: File; text: string | null })[]): ImportNote[] {
  const paths: NotePath[] = items.map(({ path, original }) => ({ path, original }));
  return items.map(({ path, original, file, text }) => ({ path, original, file, links: text ? linkedNotes(path, text, paths) : [] }));
}

/** 끌어 놓은 폴더를 따라 내려가며 노트만 모은다 — 점 폴더는 들어가지 않는다 */
async function walk(entry: FileSystemEntry, out: FolderItem[]) {
  if (entry.isFile) {
    if (!fileType(entry.name)) return;
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path: entry.fullPath.replace(/^\/+/, "") });
    return;
  }
  if (!entry.isDirectory || entry.name.startsWith(".") || entry.name === "__MACOSX") return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries 는 한 번에 일부만 준다 — 빈 배열이 올 때까지
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await walk(child, out);
  }
}

/** 끌어 놓은 것 — 폴더면 그 안 노트, .zip 하나면 그 파일. 둘 다 아니면 null(보통 파일 넣기). drop 이벤트 안에서 바로 불러야 한다 */
export function droppedImport(data: DataTransfer): { kind: "folder"; read: () => Promise<FolderItem[]> } | { kind: "zip"; file: File } | null {
  const entries = [...data.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.some((e) => e.isDirectory)) {
    return {
      kind: "folder",
      read: async () => {
        const out: FolderItem[] = [];
        for (const entry of entries) await walk(entry, out);
        return out;
      },
    };
  }
  const files = [...data.files];
  return files.length === 1 && /\.zip$/i.test(files[0].name) ? { kind: "zip", file: files[0] } : null;
}

export function useNoteImport(max: number) {
  const [state, setState] = useState<NoteImport>({ status: "idle" });
  const [selection, setSelection] = useState<NoteSelection>(emptySelection);
  // 늦게 끝난 앞 목록이 뒤에 고른 것을 덮지 않게
  const version = useRef(0);

  const start = (from: "folder" | "notion") => {
    setSelection(emptySelection());
    setState({ status: "reading", from });
    return ++version.current;
  };
  const finish = (current: number, next: NoteImport) => {
    if (version.current === current) setState(next);
  };

  const fromFolder = async (read: FolderItem[] | (() => Promise<FolderItem[]>)) => {
    const current = start("folder");
    try {
      const items = (typeof read === "function" ? await read() : read).filter(({ path }) => isFolderNote(path));
      if (!items.length) return finish(current, { status: "error", message: NO_NOTES });
      items.sort((a, b) => a.path.localeCompare(b.path, "ko"));
      const withText = await Promise.all(
        items.map(async ({ file, path }) => ({
          path,
          original: path,
          file,
          text: fileType(path) === "text" && file.size <= MAX_FILE_BYTES ? await file.text().catch(() => null) : null,
        })),
      );
      finish(current, { status: "ready", from: "folder", label: items[0].path.split("/")[0], notes: withLinks(withText) });
    } catch (e) {
      console.error("[note-import] 폴더 읽기 실패", e);
      finish(current, { status: "error", message: NOT_READ });
    }
  };

  const fromZip = async (zip: File) => {
    const current = start("notion");
    // 풀 때만 불러온다 — JSZip 을 첫 화면 번들에 넣지 않는다
    let lib: typeof import("@/lib/source-file/notion-zip") | null = null;
    try {
      lib = await import("@/lib/source-file/notion-zip");
      lib.checkZipSize(zip.size); // 읽기 전에 — 큰 파일을 메모리에 올리지 않는다
      const pages = await lib.readNotionZip(new Uint8Array(await zip.arrayBuffer()));
      const items = pages.map((p) => ({ ...p, file: new File([p.text], splitPath(p.path).name, { type: "text/markdown" }) }));
      finish(current, { status: "ready", from: "notion", label: zip.name, notes: withLinks(items) });
    } catch (e) {
      const known = !!lib && e instanceof lib.ZipImportError;
      if (!known) console.error("[note-import] ZIP 읽기 실패", e);
      finish(current, { status: "error", message: known && e instanceof Error ? e.message : NOT_READ });
    }
  };

  const notes = state.status === "ready" ? state.notes : [];
  const linksOf = (path: string) => notes.find((n) => n.path === path)?.links ?? [];

  return {
    state,
    selection,
    fromFolder,
    fromZip,
    toggle: (path: string) => setSelection((prev) => toggleNote(prev, path, linksOf, max)),
    /** 고른 노트 — 고른 순서. 이름은 폴더 안 경로 */
    chosen: (): PickedFile[] => selection.order.flatMap((path) => {
      const note = notes.find((n) => n.path === path);
      return note ? [{ file: note.file, name: note.path }] : [];
    }),
    reset: () => {
      ++version.current;
      setState({ status: "idle" });
      setSelection(emptySelection());
    },
  };
}
