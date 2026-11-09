"use client";

import Link from 'next/link';
import { Select } from '@/components/ui/select';
import { DRAFT_FRAMES, type DraftFrame } from '@/lib/draft-frames';
import type { Draft } from '@/lib/api/question-types';

export function FrameDescription({ frame }: { frame: DraftFrame }) {
  const info = DRAFT_FRAMES[frame];
  return <p className="m-0 min-w-0 text-note leading-relaxed text-muted">{info.steps}</p>;
}

const FRAME_OPTIONS = (Object.keys(DRAFT_FRAMES) as DraftFrame[]).map(value => ({ value, label: DRAFT_FRAMES[value].name }));

export function FramePicker({ frame, onChange, disabled, proposed }: { frame: DraftFrame; onChange: (frame: DraftFrame) => void; disabled: boolean; proposed: boolean }) {
  return <div className="grid min-w-0 gap-2 border-t border-hairline pt-4">
    <label className="grid gap-2 text-sm font-semibold">구성 틀<Select<DraftFrame> aria-label="구성 틀" value={frame} disabled={disabled} onChange={next => { if (next) onChange(next); }} className="sm:max-w-80" options={FRAME_OPTIONS} /></label>
    {proposed && <p className="m-0 text-note text-muted">문항 유형에 맞춘 제안 · 바꿔도 괜찮아요.</p>}
    <FrameDescription frame={frame} />
    <Link href="/guidelines" className="inline-flex min-h-11 items-center justify-self-start text-sm text-evidence underline underline-offset-3">작성 지침 관리 →</Link>
  </div>;
}

/** 결과는 지금의 지침 목록을 다시 읽지 않고 Draft의 생성 당시 값으로만 표시한다. */
export function DraftGuidance({ draft }: { draft: Draft }) {
  const frame = draft.frame ?? 'NONE';
  const applied = (draft.guidelines ?? []).filter(g => g.applied);
  const unapplied = (draft.guidelines ?? []).filter(g => !g.applied);
  return <aside aria-label="초안에 쓴 틀과 지침" className="grid min-w-0 gap-4 rounded-sm bg-surface-soft p-4">
    <div className="grid gap-1"><p className="m-0 text-sm font-semibold">이 초안의 구성 틀 · {DRAFT_FRAMES[frame].name}</p><FrameDescription frame={frame} /></div>
    <p className="m-0 text-note leading-relaxed text-muted">지침 반영 여부는 AI 해석이에요. 초안을 만들 때의 지침이며, 지침보다 근거 규칙이 우선이에요.</p>
    <section aria-label="적용한 지침" className="grid gap-2"><h4 className="m-0 text-sm font-semibold">적용한 지침</h4>{applied.length ? <ul className="m-0 grid gap-2 pl-4 text-sm">{applied.map(g => <li key={g.id} className="break-words">{g.text}{g.source && <span className="mt-1 block text-xs text-muted">출처 · {g.source}</span>}</li>)}</ul> : <p className="m-0 text-note text-muted">{unapplied.length ? '이번 초안에 적용한 지침이 없어요.' : '이 초안에 실은 작성 지침이 없어요.'}</p>}</section>
    {unapplied.length > 0 && <section aria-label="이번엔 반영 못 함" className="grid gap-2"><h4 className="m-0 text-sm font-semibold">이번엔 반영 못 함</h4><ul className="m-0 grid gap-2 pl-4 text-sm">{unapplied.map(g => <li key={g.id} className="break-words">{g.text}{g.source && <span className="mt-1 block text-xs text-muted">출처 · {g.source}</span>}<p className="mt-1 mb-0 text-sm text-body">반영 못 함 — {g.note}</p></li>)}</ul></section>}
  </aside>;
}
