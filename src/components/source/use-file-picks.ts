"use client";

// 고른 파일들 — 브라우저에서 차례로 글자를 뽑고, 넣을 수 있는 것과 못 넣는 것(이유)을 가른다 (SPEC S-39 · S-59)
// 다시 고르면 목록을 통째로 바꾼다. 어디서 고른 파일이든 File 배열만 넘기면 된다
import { useRef, useState } from "react";
import { MAX_TEXT_LENGTH } from "@/lib/api/types";
import { readSourceFile, SourceFileError, type SourceFile } from "@/lib/source-file/read";

export type FilePick = {
  id: number;
  name: string;
  /** 넣을 수 있다. 못 넣으면 null */
  file: SourceFile | null;
  /** 못 넣는 이유 */
  error: string | null;
};

export const tooLongText = (text: string) =>
  `한 번에 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 넣을 수 있어요. 지금 ${text.length.toLocaleString()}자예요 — 나눠서 넣어 주세요.`;

/** 고른 파일 — 폴더 · ZIP 에서 가져온 노트는 원본 이름(폴더 안 경로)을 같이 준다 (S-62 · S-63) */
export type PickedFile = File | { file: File; name: string };

async function readPick(id: number, picked: File, name: string): Promise<FilePick> {
  try {
    const file = await readSourceFile(picked, name);
    return file.text.length > MAX_TEXT_LENGTH
      ? { id, name, file: null, error: tooLongText(file.text) }
      : { id, name, file, error: null };
  } catch (e) {
    return { id, name, file: null, error: e instanceof SourceFileError ? e.message : `이 파일(${name})을 읽지 못했어요. 다시 골라 주세요.` };
  }
}

/** max — 넣을 수 있는 파일 수. 앞에서부터 받고, 넘는 파일은 읽지 않고 못 넣는다고 보인다 */
export function useFilePicks(max: number) {
  const [picks, setPicks] = useState<FilePick[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  // 늦게 끝난 앞 고르기가 뒤에 고른 파일을 덮지 않게
  const version = useRef(0);

  const pick = async (files: PickedFile[]) => {
    if (!files.length) return;
    const current = ++version.current;
    const next: FilePick[] = [];
    setPicks([]);
    setReading({ done: 0, total: files.length });
    for (const [index, item] of files.entries()) {
      const { file: picked, name } = item instanceof File ? { file: item, name: item.name } : item;
      const full = next.filter((p) => p.file).length >= max;
      const result = full
        ? { id: index, name, file: null, error: `한 번에 ${max}개까지 넣을 수 있어요. 이 파일은 넣지 않아요.` }
        : await readPick(index, picked, name);
      if (version.current !== current) return;
      next.push(result);
      setPicks([...next]);
      setReading({ done: index + 1, total: files.length });
    }
    setReading(null);
  };

  return {
    picks,
    reading,
    pick,
    remove: (id: number) => setPicks((prev) => prev.filter((p) => p.id !== id)),
    clear: () => {
      ++version.current;
      setPicks([]);
      setReading(null);
    },
  };
}
