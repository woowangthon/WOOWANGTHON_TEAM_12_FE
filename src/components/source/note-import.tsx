"use client";

// 자료 쌓기 창의 폴더 · Notion ZIP 가져오기 — 고르는 단추와 노트 목록 (SPEC S-62 · S-63, FE#127)
// 노트 목록은 시안이 없다 — 문항 고르기(common-question-picker)와 같은 체크 줄, DESIGN.md 「반응형」(터치 44) · 「상태」 말투를 따른다
import { useState, type InputHTMLAttributes } from "react";
import { FileZipIcon, FolderSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { splitPath } from "@/lib/source-file/notes";
import type { NoteSelection } from "@/lib/source-file/note-select";
import type { FolderItem, ImportNote } from "./use-note-import";

/** 자료 쌓기의 「파일 올리기」와 같은 모양 — 1024 미만은 손가락 크기(44) */
export const PICK_BUTTON = cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer max-lg:h-11 has-disabled:pointer-events-none has-disabled:opacity-50");

// webkitdirectory 는 React 타입에 없다 — 표준은 아니지만 Chrome · Edge · Safari · Firefox 가 다 받는다
const folderInput = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;

export function NoteImportButtons({ disabled, onFolder, onZip }: { disabled: boolean; onFolder: (items: FolderItem[]) => void; onZip: (file: File) => void }) {
  return (
    <>
      <label className={PICK_BUTTON}>
        <input
          type="file"
          {...folderInput}
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const items = [...(e.target.files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
            e.target.value = "";
            if (items.length) onFolder(items);
          }}
        />
        <FolderSimpleIcon aria-hidden="true" />
        폴더 가져오기
      </label>
      <label className={PICK_BUTTON}>
        <input
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onZip(file);
          }}
        />
        <FileZipIcon aria-hidden="true" />
        Notion ZIP
      </label>
    </>
  );
}

/** 노트 목록에서 고르기 — 경로 · 고른 상태 · 링크로 함께 체크된 것 · 상한 · 못 고른 수 */
export function NotePicker({ label, notes, selection, max, onToggle }: {
  label: string;
  notes: ImportNote[];
  selection: NoteSelection;
  max: number;
  onToggle: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? notes.filter((n) => n.path.toLowerCase().includes(q)) : notes;
  const count = selection.order.length;
  const full = count >= max;
  const { notice } = selection;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="m-0 min-w-0 text-sm font-semibold break-words text-ink">{label}</p>
        <p className="m-0 shrink-0 text-note text-muted tabular-nums">노트 {notes.length.toLocaleString()}개</p>
      </div>

      {notes.length > 8 && (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="노트 이름 · 폴더로 찾기"
            aria-label="노트 찾기"
            className="h-10 w-full rounded-sm border border-hairline pr-3 pl-9 text-base outline-none placeholder:text-muted focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)] max-lg:h-11"
          />
        </div>
      )}

      <ul className="-mx-1 m-0 grid max-h-[46dvh] list-none gap-0.5 overflow-auto p-0 px-1 lg:max-h-80" aria-label="노트 목록">
        {shown.map((note) => {
          const checked = selection.order.includes(note.path);
          const by = selection.autoBy[note.path];
          const { dir, name } = splitPath(note.path);
          return (
            <li key={note.path}>
              <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft has-disabled:cursor-default has-disabled:opacity-50", checked && "bg-surface-soft")}>
                <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => onToggle(note.path)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-ui leading-snug break-words text-ink">{name}</span>
                  {dir && <span className="text-note break-all text-muted">{dir}/</span>}
                  {by ? (
                    <span className="text-note break-words text-body">「{splitPath(by).name}」에서 링크해 함께 골랐어요 · 풀 수 있어요</span>
                  ) : note.links.length > 0 && (
                    <span className="text-note text-muted tabular-nums">링크한 노트 {note.links.length}개 — 고르면 함께 골라요</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">찾는 노트가 없어요 — 「{query.trim()}」</li>}
      </ul>

      <div className="grid gap-1" aria-live="polite">
        <p className="m-0 text-note text-body tabular-nums">
          <b className="font-semibold text-ink">{count} / {max}</b>개 골랐어요
          {full ? ` — 한 번에 ${max}개까지 넣을 수 있어요. 하나를 빼면 더 고를 수 있어요.` : count === 0 ? ` — 노트를 고르면 그 노트가 링크한 노트도 한 단계 함께 골라요.` : ""}
        </p>
        {notice?.kind === "skipped" && (
          <p className="m-0 text-note font-medium text-ink tabular-nums" role="status">
            링크한 노트 {notice.count}개는 {max}개를 넘어 함께 고르지 못했어요. 필요하면 다른 노트를 빼고 직접 골라 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
