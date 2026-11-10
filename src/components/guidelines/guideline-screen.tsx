"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { ApiError } from '@/lib/api/errors';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { AnalysisCost, useAnalysisLeft } from '@/components/auth/analysis-cost';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { deleteGuideline, extractGuidelines, fetchGuidelines, guidelineError, saveGuidelines, updateGuideline, type Guideline, type GuidelineInput } from '@/lib/api/guidelines';

const inputClass = 'min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink';
const card = 'grid min-w-0 gap-4 rounded-md border border-hairline bg-canvas p-5 sm:p-6';

function LineFields({ value, onChange }: { value: GuidelineInput; onChange: (value: GuidelineInput) => void }) {
  return <>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">지침 한 줄<input className={inputClass} required maxLength={200} value={value.text} onChange={e => onChange({ ...value, text: e.target.value })} /></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">출처 (선택)<input className={inputClass} maxLength={100} placeholder="어느 영상 · 누구의 피드백 · 내 생각" value={value.source} onChange={e => onChange({ ...value, source: e.target.value })} /></label>
  </>;
}

export function GuidelineScreen() {
  const [items, setItems] = useState<Guideline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 상단 「지침 더하기」(한 줄 저장 · AI 정리) 처리 중일 때만 — 하단 목록 조작은 busy 만 켠다(FE#375)
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, clearToast } = useToast();
  const locked = useRef(false);
  const [raw, setRaw] = useState<GuidelineInput>({ text: '', source: '' });
  const [showSource, setShowSource] = useState(false);
  const [candidates, setCandidates] = useState<(GuidelineInput & { key: number })[] | null>(null);
  // limit — 오늘 분석 한도로 못 정리했다(FE#391)
  const [extractError, setExtractError] = useState<{ message: string; limit: boolean } | null>(null);
  // 오늘 남은 분석 0회면 AI 정리를 보내지 않는다(S-15 · FE#391). 한 줄 저장은 분석을 쓰지 않아 그대로. 못 읽었으면(null) 막지 않는다.
  // 요청이 끝날 때마다(composing) 다시 읽는다 — 「분석 1회」 표시가 없는 한 줄 길에서도 한도에 걸린 뒤 버튼이 그대로 눌리지 않게
  const left = useAnalysisLeft(composing);
  const exhausted = left === 0;
  // 「다시 시도」는 남은 횟수가 있을 때만 — 0회면 어떤 실패든 숨긴다. 한도로 못 했으면 남은 횟수가 다시 확인될 때(자정 뒤 등)만 보인다.
  // 정리 버튼은 오류와 상관없이 남은 횟수만 보므로, 횟수가 돌아오면 지난 오류가 막지 않는다
  const canRetry = !!extractError && (extractError.limit ? left !== null && left > 0 : !exhausted);
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState<GuidelineInput>({ text: '', source: '' });
  const enabled = items.filter(g => g.enabled).length;
  // 한 줄(200자 이하 · 줄바꿈 없음)이면 바로 저장, 아니면 AI 로 정리 — 두 입구를 상자 하나로(FE#304)
  const text = raw.text.trim();
  const isLine = !!text && text.length <= 200 && !/[\r\n]/.test(text);
  const resetComposer = () => { setRaw({ text: '', source: '' }); setShowSource(false); };

  const load = useCallback(() => fetchGuidelines().then(
    items => { setItems(items); setLoadError(null); },
    e => setLoadError(guidelineError(e)),
  ).finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: () => Promise<void>, fromComposer = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setComposing(fromComposer); setError(null); clearToast();
    try { await action(); }
    catch (e) { setError(guidelineError(e)); }
    finally { locked.current = false; setBusy(false); setComposing(false); }
  }
  async function extract() {
    if (exhausted) return;
    await act(async () => {
      setExtractError(null);
      try {
        const result = await extractGuidelines(raw);
        setCandidates(result.candidates.map((c, key) => ({ key, text: c.text, source: result.source ?? '' })));
      } catch (e) { setExtractError({ message: guidelineError(e), limit: e instanceof ApiError && e.code === 'DAILY_LIMIT_EXCEEDED' }); }
    }, true);
  }
  async function save(lines: GuidelineInput[], after: () => void, fromComposer = false) {
    await act(async () => {
      const saved = await saveGuidelines(lines);
      setItems(previous => [...previous, ...saved]); after();
      if (saved.some(g => !g.enabled)) showToast('지침을 저장했어요. 켠 지침이 10개라 일부는 꺼진 채 저장했어요. 목록에서 확인해 주세요.', true);
      else showToast('지침을 저장했어요. 다음에 만드는 초안부터 써요.');
    }, fromComposer);
  }

  return <>
    <AppHeader activePage="guidelines" />
    <main className="w-full min-w-0 flex-1 px-4 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-4xl min-w-0 gap-6">
        <header className="grid gap-3">
          <Link href="/questions" className="inline-flex min-h-11 lg:min-h-10 items-center justify-self-start text-sm text-muted hover:underline">← 지원으로 돌아가기</Link>
          <div className="flex items-center gap-1"><h1 className="m-0 text-2xl font-bold">작성 지침</h1><InfoTip label="작성 지침">켠 지침은 모든 답변 초안의 문체 · 구성 · 강조에 써요. 근거에 없는 사실은 만들지 않아요.</InfoTip></div>
          <p className="m-0 text-sm leading-relaxed text-muted">들었던 작성법을 내 지침으로 쌓아 두세요.</p>
        </header>
        {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
        <section aria-labelledby="compose-title" className={card}>
          <div className="grid gap-1">
            <h2 id="compose-title" className="m-0 text-lg font-semibold">지침 더하기</h2>
            <p className="m-0 text-sm leading-relaxed text-muted">내가 정한 작성법을 한 줄로 쓰거나, 영상 요점 · 자막을 붙여 넣으면 작성법만 한 줄씩 정리해요.</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (isLine) void save([{ text, source: raw.source }], resetComposer, true); else void extract(); }} className="grid min-w-0 gap-3">
            <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
              <label className="sr-only" htmlFor="guideline-compose">지침 한 줄 또는 요점 · 자막</label>
              <textarea id="guideline-compose" maxLength={20000} rows={3} placeholder="예: 첫 문장에 무엇을 했고 어떻게 됐는지 먼저 쓴다" className={inputClass + ' max-h-96 min-h-24 resize-y leading-relaxed [field-sizing:content]'} value={raw.text} onChange={e => setRaw({ ...raw, text: e.target.value })} />
              {showSource && <label className="grid min-w-0 gap-1.5 text-sm font-medium">출처<input autoFocus maxLength={100} className={inputClass} placeholder="어느 영상 · 누구의 피드백 · 내 생각" value={raw.source} onChange={e => setRaw({ ...raw, source: e.target.value })} /></label>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {showSource ? <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={() => { setShowSource(false); setRaw({ ...raw, source: '' }); }}>출처 빼기</Button> : <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={() => setShowSource(true)}>+ 출처 달기</Button>}
                <div className="flex flex-wrap items-center gap-3">
                  {!text || isLine ? <>
                    <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" disabled={!text || exhausted} onClick={() => void extract()}>AI로 정리</Button>
                    <Button type="submit" className="min-h-11 lg:min-h-10" disabled={!text || loading || !!loadError}>한 줄 저장</Button>
                  </> : <>
                    <AnalysisCost running={composing} />
                    <Button type="submit" className="min-h-11 lg:min-h-10" disabled={!text || exhausted}>AI로 정리하기</Button>
                  </>}
                </div>
              </div>
            </fieldset>
          </form>
          {extractError && <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-sm text-error">{extractError.message}</p>{canRetry && <Button variant="secondary" disabled={busy} onClick={() => void extract()}>다시 시도</Button>}</div>}
          {composing && <p role="status" className="m-0 text-sm text-muted">요청을 처리하고 있어요…</p>}
        </section>
        {candidates !== null && <section aria-labelledby="candidates-title" className={card}>
          <h2 id="candidates-title" className="m-0 text-lg font-semibold">정리한 후보</h2>
          <p className="m-0 text-sm text-muted">AI 해석이에요. 줄을 고치거나 빼고 저장해 주세요. 아직 저장하지 않았어요.</p>
          {candidates.length === 0 ? <p className="m-0 text-sm">지침으로 정리할 만한 게 없어요 — 직접 써 주세요.</p> : <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(candidates.map(({ text, source }) => ({ text, source })), () => { setCandidates(null); resetComposer(); }, true); }}>
            <fieldset disabled={busy || loading || !!loadError} className="m-0 grid min-w-0 gap-5 border-0 p-0">
              {candidates.map(c => <div key={c.key} role="group" aria-label={'지침 후보 ' + (c.key + 1)} className="grid min-w-0 gap-3 border-t border-hairline pt-4"><LineFields value={c} onChange={value => setCandidates(previous => previous!.map(item => item.key === c.key ? { ...value, key: c.key } : item))} /><Button type="button" variant="ghost" className="min-h-11 lg:min-h-10 justify-self-start" onClick={() => setCandidates(previous => previous!.filter(item => item.key !== c.key))}>빼기</Button></div>)}
              <Button type="submit" className="min-h-11 lg:min-h-10 justify-self-start">후보 저장</Button>
            </fieldset>
          </form>}
        </section>}
        <section aria-labelledby="guidelines-title" className={card}>
          <div className="flex items-center gap-0.5"><h2 id="guidelines-title" className="m-0 text-lg font-semibold">내 지침 {items.length} / 50 · 켬 {enabled} / 10</h2><InfoTip label="내 지침">켠 지침은 다음에 만드는 초안부터 반영돼요. 지침이 부딪치면 하나를 꺼 주세요.</InfoTip></div>
          {loading ? <p role="status" className="m-0 text-sm text-muted">지침을 불러오고 있어요…</p> : loadError ? <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-sm text-error">{loadError}</p><Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>다시 불러오기</Button></div> : <>
            {!items.length && <p className="m-0 py-6 text-sm text-muted">아직 작성 지침이 없어요. 위 「지침 더하기」에 한 줄 쓰거나 들었던 작성법을 붙여 넣어 주세요.</p>}
            <ul className="m-0 grid list-none gap-4 p-0">{items.map(g => <li key={g.id} aria-label={'작성 지침 ' + g.id} className="grid min-w-0 gap-3 border-t border-hairline pt-4">
              {editing === g.id ? <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void act(async () => { const updated = await updateGuideline(g.id, edit); setItems(previous => previous.map(item => item.id === g.id ? updated : item)); setEditing(null); showToast('지침을 고쳤어요. 다음에 만드는 초안부터 써요.'); }); }}>
                <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0"><LineFields value={edit} onChange={setEdit} /><div className="flex gap-2"><Button type="submit" className="min-h-11 lg:min-h-10">저장</Button><Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={() => setEditing(null)}>취소</Button></div></fieldset>
              </form> : <>
                <p className="m-0 break-words text-sm leading-relaxed">{g.text}</p>{g.source && <p className="m-0 break-words text-xs text-muted">출처 · {g.source}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-11 lg:min-h-10 items-center gap-2 text-sm"><input type="checkbox" role="switch" className="size-5 accent-primary" checked={g.enabled} disabled={busy} aria-label={'지침 켜기: ' + g.text} onChange={() => void act(async () => { const updated = await updateGuideline(g.id, { enabled: !g.enabled }); setItems(previous => previous.map(item => item.id === g.id ? updated : item)); })} />{g.enabled ? '켬' : '끔'}</label>
                  <Button variant="ghost" className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => { setEditing(g.id); setEdit({ text: g.text, source: g.source ?? '' }); setError(null); }}>고치기</Button>
                  <Button variant="ghost" className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => void act(async () => { await deleteGuideline(g.id); setItems(previous => previous.filter(item => item.id !== g.id)); showToast('지침을 지웠어요. 이미 만든 초안에는 만들 때의 지침이 남아 있어요.'); })}>지우기</Button>
                </div>
              </>}
            </li>)}</ul>
          </>}
        </section>
      </div>
    </main>
    <Toast toast={toast} />
  </>;
}
