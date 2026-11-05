"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DRAFT_FRAMES, type DraftFrame } from '@/lib/draft-frames';
import type { Draft } from '@/lib/api/question-types';
import { fetchGuidelines, guidelineError, type Guideline } from '@/lib/api/guidelines';

export function FrameDescription({ frame }: { frame: DraftFrame }) {
  const info = DRAFT_FRAMES[frame];
  return <div className="grid min-w-0 gap-1 text-xs leading-relaxed text-muted"><p className="m-0">{info.steps}</p>{info.source && <a href={info.source} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-self-start break-words text-evidence underline underline-offset-3">출처 · {info.sourceName}</a>}</div>;
}

export function FramePicker({ frame, onChange, disabled, proposed }: { frame: DraftFrame; onChange: (frame: DraftFrame) => void; disabled: boolean; proposed: boolean }) {
  const [guidelines, setGuidelines] = useState<Guideline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError(null);
    try { setGuidelines((await fetchGuidelines()).filter(g => g.enabled)); }
    catch (e) { setError(guidelineError(e)); }
    finally { setBusy(false); }
  }
  return <div className="grid min-w-0 gap-2 border-t border-hairline pt-4">
    <label className="grid gap-2 text-sm font-semibold">구성 틀<select value={frame} disabled={disabled} onChange={e => onChange(e.target.value as DraftFrame)} className="min-h-11 w-full rounded-sm border border-hairline bg-canvas px-3 text-sm sm:max-w-80">{Object.entries(DRAFT_FRAMES).map(([value, info]) => <option key={value} value={value}>{info.name}</option>)}</select></label>
    {proposed && <p className="m-0 text-xs text-muted">문항 유형에 맞춘 제안 · 바꿔도 괜찮아요.</p>}
    <FrameDescription frame={frame} />
    <p className="m-0 text-xs text-muted">자료로 받칠 수 없는 단계는 지어내지 않고 건너뛰어요.</p>
    <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void load()}>{busy ? '지침 불러오는 중…' : '켠 작성 지침 보기'}</Button><Link href="/guidelines" className="inline-flex min-h-11 items-center text-sm text-evidence underline underline-offset-3">작성 지침 관리 →</Link></div>
    {error && <p role="alert" className="m-0 text-sm text-error">{error} 「켠 작성 지침 보기」로 다시 시도해 주세요.</p>}
    {guidelines !== null && <div className="grid gap-2 rounded-sm bg-surface-soft p-3 text-xs text-muted"><p className="m-0">{guidelines.length ? '다음 초안을 만들 때 켠 지침을 써요. 반영 여부는 만든 뒤 확인해 주세요.' : '켠 작성 지침이 없어요. 지침 없이 초안을 만들 수 있어요.'}</p>{guidelines.map(g => <p className="m-0 break-words" key={g.id}>{g.text} · 출처: {g.source}</p>)}</div>}
  </div>;
}

/** 결과는 지금의 지침 목록을 다시 읽지 않고 Draft의 생성 당시 값으로만 표시한다. */
export function DraftGuidance({ draft }: { draft: Draft }) {
  const frame = draft.frame ?? 'NONE';
  const applied = (draft.guidelines ?? []).filter(g => g.applied);
  const unapplied = (draft.guidelines ?? []).filter(g => !g.applied);
  return <aside aria-label="초안에 쓴 틀과 지침" className="grid min-w-0 gap-4 rounded-sm bg-surface-soft p-4">
    <div className="grid gap-1"><p className="m-0 text-sm font-semibold">이 초안의 구성 틀 · {DRAFT_FRAMES[frame].name}</p><FrameDescription frame={frame} /></div>
    <p className="m-0 text-xs leading-relaxed text-muted">지침 반영 여부는 AI 해석이에요. 초안을 만들 때의 지침이며, 지침보다 근거 규칙이 우선이에요.</p>
    <section aria-label="적용한 지침" className="grid gap-2"><h4 className="m-0 text-sm font-semibold">적용한 지침</h4>{applied.length ? <ul className="m-0 grid gap-2 pl-4 text-sm">{applied.map(g => <li key={g.id} className="break-words">{g.text}<span className="mt-1 block text-xs text-muted">출처 · {g.source}</span></li>)}</ul> : <p className="m-0 text-xs text-muted">{unapplied.length ? '이번 초안에 적용한 지침이 없어요.' : '이 초안에 실은 작성 지침이 없어요.'}</p>}</section>
    {unapplied.length > 0 && <section aria-label="이번엔 반영 못 함" className="grid gap-2"><h4 className="m-0 text-sm font-semibold">이번엔 반영 못 함</h4><ul className="m-0 grid gap-2 pl-4 text-sm">{unapplied.map(g => <li key={g.id} className="break-words">{g.text}<span className="mt-1 block text-xs text-muted">출처 · {g.source}</span><p className="mt-1 mb-0 text-sm text-body">반영 못 함 — {g.note}</p></li>)}</ul></section>}
  </aside>;
}
