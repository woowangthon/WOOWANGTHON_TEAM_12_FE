"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, PencilSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AiMark } from "@/components/ui/ai-mark";
import { toastCard, toastStack } from "@/components/ui/toast";
import { isMockMode } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import {
  MAX_POSTING_LINE_LENGTH, MAX_POSTING_LINES, POSTING_SECTION_LABEL, POSTING_SECTIONS,
  type PostingLineInput, type PostingSection,
} from "@/lib/api/question-types";

/** 확인 단계의 줄 — key 는 화면에서만 쓰는 번호(고치기 · 빼기 · 되돌리기 자리 찾기) */
export type DraftPostingLine = PostingLineInput & { key: number };
let lineSeq = 0;
/** 줄 key — 화면 안에서만 겹치지 않으면 된다 */
export const nextLineKey = () => ++lineSeq;

/** 칸마다 처음에 보이는 줄 수 — 공고가 40줄 가까이면 길어서 접는다(FE#494 「위험」 기본값) */
const SHOWN = 6;
const SECTION_AI = "칸 나누기(담당업무 · 자격요건 · 우대 · 기술스택)는 AI 가 했어요. 줄 글은 공고 원문 그대로예요.";
// MOCK(posting-lines): 목 모드에선 칸 나누기도 규칙이다 — AI 배지 대신 글자로 밝힌다(ai-scope §3)
const SECTION_MOCK = "목 규칙으로 칸을 나눴어요 — 머리 줄(담당업무 · 자격요건 · 우대 · 기술스택) 아래 글머리 줄만 옮겨요.";
const iconButton = "max-lg:size-11";

/** 공고 요건 줄 확인(S-91 · DESIGN.md 「지원 넣기 — 공고 확인」) — 칸 넷, 공고 순서대로. 줄마다 그 자리에서 고치기 · 빼기(토스트 「되돌리기」),
 *  칸마다 「줄 더하기」. 빈 칸은 숨긴다. K · S · A 는 여기서 보이지 않는다(지원 화면 공고 탭에서) */
export function PostingLinesReview({ lines, onChange }: {
  lines: DraftPostingLine[];
  onChange: (update: (prev: DraftPostingLine[]) => DraftPostingLine[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [removed, setRemoved] = useState<{ line: DraftPostingLine; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const full = lines.length >= MAX_POSTING_LINES;

  const remove = (line: DraftPostingLine) => {
    const index = lines.findIndex(l => l.key === line.key);
    onChange(prev => prev.filter(l => l.key !== line.key));
    clearTimeout(timer.current);
    setRemoved({ line, index });
    timer.current = setTimeout(() => setRemoved(null), 5000);
  };
  const undo = () => {
    if (!removed) return;
    const { line, index } = removed;
    onChange(prev => [...prev.slice(0, index), line, ...prev.slice(index)].slice(0, MAX_POSTING_LINES));
    clearTimeout(timer.current); setRemoved(null);
  };
  const save = (key: number, text: string) => {
    const value = text.trim().slice(0, MAX_POSTING_LINE_LENGTH);
    // 비우고 나오면 그 줄을 뺀다 — 빈 줄은 넣을 수 없다(question-api)
    onChange(prev => (value ? prev.map(l => (l.key === key ? { ...l, text: value } : l)) : prev.filter(l => l.key !== key)));
    setEditing(null);
  };
  const add = (section: PostingSection) => {
    if (full) return;
    const key = nextLineKey();
    const readFrom = lines[0]?.readFrom ?? "TEXT";
    // 그 칸의 마지막 줄 뒤에 — 공고 순서를 흐트러뜨리지 않는다
    onChange(prev => {
      const last = prev.findLastIndex(l => l.section === section);
      const line: DraftPostingLine = { key, section, text: "", ksa: null, readFrom };
      return last < 0 ? [...prev, line] : [...prev.slice(0, last + 1), line, ...prev.slice(last + 1)];
    });
    setEditing(key);
  };

  const sections = POSTING_SECTIONS.filter(section => lines.some(l => l.section === section));
  return (
    <section aria-labelledby="posting-lines-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 id="posting-lines-title" className="m-0 text-sm font-semibold text-ink">공고 요건</h3>
        <span className="text-note text-muted">공고에서 그대로 가져왔어요 · 고치거나 뺄 수 있어요</span>
        {sections.length > 0 && (isMockMode()
          ? <span title={SECTION_MOCK} className="inline-block shrink-0 rounded-[4px] border border-hairline px-1 text-xs leading-[15px] font-bold whitespace-nowrap text-muted">목 규칙으로 나눔</span>
          : <AiMark title={SECTION_AI} />)}
      </div>
      {!sections.length && <p className="m-0 text-sm text-muted">공고 요건을 찾지 못했어요.</p>}
      {sections.map(section => <PostingSectionBlock key={section} section={section} lines={lines.filter(l => l.section === section)}
        editing={editing} full={full} onEdit={setEditing} onSave={save} onRemove={remove} onAdd={() => add(section)} />)}
      {removed && <div className={toastStack}>
        <div role="status" className={cn(toastCard, "flex items-center gap-3 py-2 pr-2 pl-4")}>
          <span>{POSTING_SECTION_LABEL[removed.line.section]} 줄을 뺐어요</span>
          <button type="button" onClick={undo} className="min-h-9 rounded-sm px-2 font-semibold text-canvas underline underline-offset-3 max-lg:min-h-11">되돌리기</button>
        </div>
      </div>}
    </section>
  );
}

function PostingSectionBlock({ section, lines, editing, full, onEdit, onSave, onRemove, onAdd }: {
  section: PostingSection; lines: DraftPostingLine[]; editing: number | null; full: boolean;
  onEdit: (key: number) => void; onSave: (key: number, text: string) => void; onRemove: (line: DraftPostingLine) => void; onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = POSTING_SECTION_LABEL[section];
  // 고치는 줄은 접힌 쪽에 있어도 보인다
  const editingAt = lines.findIndex(l => l.key === editing);
  const shown = expanded || lines.length <= SHOWN ? lines : lines.slice(0, Math.max(SHOWN, editingAt + 1));
  const hidden = lines.length - shown.length;
  return (
    <div role="group" aria-label={label} className="grid gap-1">
      <h4 className="m-0 text-sm font-semibold text-ink">{label}</h4>
      <ul className="m-0 grid list-none border-t border-hairline p-0">
        {shown.map(line => <li key={line.key} className="flex items-start gap-1 border-b border-hairline py-1">
          {editing === line.key
            ? <PostingLineEditor line={line} label={label} onSave={text => onSave(line.key, text)} />
            : <>
                <span className="min-w-0 flex-1 py-1.5 text-ui break-words text-body">{line.text}</span>
                <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label={`${label} 줄 고치기: ${line.text}`} onClick={() => onEdit(line.key)}><PencilSimpleIcon /></Button>
                <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label={`${label} 줄 빼기: ${line.text}`} onClick={() => onRemove(line)}><XIcon /></Button>
              </>}
        </li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3">
        {hidden > 0 && <Button type="button" variant="link" className="min-h-11 lg:min-h-9" onClick={() => setExpanded(true)}><CaretDownIcon aria-hidden="true" />{hidden}줄 더 보기</Button>}
        <Button type="button" variant="link" className="min-h-11 text-muted lg:min-h-9" disabled={full} title={full ? `공고 요건은 ${MAX_POSTING_LINES}줄까지 넣을 수 있어요` : undefined}
          aria-label={`${label}에 줄 더하기`} onClick={() => { setExpanded(true); onAdd(); }}><PlusIcon aria-hidden="true" />줄 더하기</Button>
      </div>
    </div>
  );
}

/** 그 자리에서 고치기 — Enter · 칸 밖을 누르면 저장, Esc 는 그대로 두기. 비우고 나오면 줄을 뺀다 */
function PostingLineEditor({ line, label, onSave }: { line: DraftPostingLine; label: string; onSave: (text: string) => void }) {
  const [value, setValue] = useState(line.text);
  const done = useRef(false);
  const finish = (text: string) => { if (done.current) return; done.current = true; onSave(text); };
  return <span className="grid min-w-0 flex-1 gap-0.5 py-0.5">
    <textarea aria-label={`${label} 줄`} autoFocus rows={1} maxLength={MAX_POSTING_LINE_LENGTH} value={value}
      onChange={e => setValue(e.target.value.replace(/\n/g, " "))} onBlur={() => finish(value)}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); finish(value); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(line.text); }
      }}
      className="field-sizing-content w-full resize-none rounded-sm border border-ink bg-canvas px-2 py-1 text-ui leading-relaxed text-body outline-none" />
    <span className="text-xs text-muted">Enter 로 저장 · Esc 로 그대로 두기{value.length >= MAX_POSTING_LINE_LENGTH * 0.8 && ` · ${value.length} / ${MAX_POSTING_LINE_LENGTH}`}</span>
  </span>;
}
