"use client";

import { Popover } from "radix-ui";
import Link from 'next/link';
import { InfoTip } from '@/components/ui/info-tip';
import { Select } from '@/components/ui/select';
import { DRAFT_FRAMES, frameOptions, type DraftFrame } from '@/lib/draft-frames';
import type { Draft } from '@/lib/api/question-types';
import { AiMark } from '@/components/ui/ai-mark';

export function FrameDescription({ frame }: { frame: DraftFrame }) {
  const info = DRAFT_FRAMES[frame];
  return <p className="m-0 min-w-0 text-note leading-relaxed text-muted">{info.steps}</p>;
}

export function FramePicker({ frame, suggested, onChange, disabled, proposed }: { frame: DraftFrame; suggested: DraftFrame; onChange: (frame: DraftFrame) => void; disabled: boolean; proposed: boolean }) {
  return <div className="grid min-w-0 gap-2 border-t border-hairline pt-4">
    {/* 「문항 유형에 맞춘 제안」은 ⓘ 로 접는다(FE#463) — ⓘ 는 버튼이라 label 밖에 둔다 */}
    <div className="grid gap-2">
      <div className="flex items-center gap-0.5 text-sm font-semibold">구성 틀{proposed && <InfoTip label="구성 틀">문항 유형에 맞춘 제안이에요. 바꿔도 괜찮아요.</InfoTip>}</div>
      <Select<DraftFrame> aria-label="구성 틀" value={frame} disabled={disabled} onChange={next => { if (next) onChange(next); }} className="sm:max-w-80" options={frameOptions(suggested)} />
    </div>
    <FrameDescription frame={frame} />
    <Link href="/guidelines" className="inline-flex min-h-11 lg:min-h-10 items-center justify-self-start text-sm text-ink underline underline-offset-3">작성 지침 관리 →</Link>
  </div>;
}

/** 초안 머리줄의 구성 틀 칩(FE#336) — 누르면 틀 순서 · 생성 당시 실린 지침. 지금의 지침 목록을 다시 읽지 않고 Draft 의 값으로만 보인다.
 *  실린 지침이 없으면 지침 줄은 보이지 않는다 */
export function DraftGuidance({ draft }: { draft: Draft }) {
  const frame = draft.frame ?? 'NONE';
  const info = DRAFT_FRAMES[frame];
  const applied = (draft.guidelines ?? []).filter(g => g.applied);
  const unapplied = (draft.guidelines ?? []).filter(g => !g.applied);
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" aria-label={`구성 틀 ${info.name} · 적용한 지침 보기`}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-1 lg:min-h-0">
        <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-xs font-semibold text-body transition-colors hover:bg-surface-strong">{info.name.replace(/ 기법.*$/, '')}</span>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="start" sideOffset={4} collisionPadding={16} aria-label="초안에 쓴 틀과 지침"
        className="z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-md border border-hairline bg-canvas px-3.5 py-3 text-note leading-relaxed text-body shadow-float">
        <div className="grid gap-0.5"><p className="m-0 text-sm font-semibold">구성 틀 · {info.name}</p><p className="m-0 text-muted">{info.steps}</p></div>
        {applied.length > 0 && <section aria-label="적용한 지침" className="grid gap-1"><p className="m-0 text-sm font-semibold">적용한 지침 <AiMark className="mx-0.5" /><span className="font-normal text-muted">근거 규칙이 우선</span></p><ul className="m-0 grid gap-1 pl-4">{applied.map(g => <li key={g.id} className="break-words">{g.text}{g.source && <span className="block text-xs text-muted">출처 · {g.source}</span>}</li>)}</ul></section>}
        {unapplied.length > 0 && <section aria-label="이번엔 반영 못 함" className="grid gap-1"><p className="m-0 text-sm font-semibold">이번엔 반영 못 함</p><ul className="m-0 grid gap-1 pl-4">{unapplied.map(g => <li key={g.id} className="break-words">{g.text}<span className="block text-xs text-muted">{g.note}</span></li>)}</ul></section>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
