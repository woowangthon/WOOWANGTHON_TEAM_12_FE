"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { deleteGuideline, extractGuidelines, fetchGuidelines, guidelineError, saveGuidelines, updateGuideline, type Guideline, type GuidelineInput } from '@/lib/api/guidelines';

const inputClass = 'min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink';
const card = 'grid min-w-0 gap-4 rounded-md border border-hairline bg-canvas p-5 sm:p-6';

function LineFields({ value, onChange }: { value: GuidelineInput; onChange: (value: GuidelineInput) => void }) {
  return <>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">지침 한 줄<input className={inputClass} required maxLength={200} value={value.text} onChange={e => onChange({ ...value, text: e.target.value })} /></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">출처<input className={inputClass} required maxLength={100} placeholder="어느 영상 · 누구의 피드백 · 내 생각" value={value.source} onChange={e => onChange({ ...value, source: e.target.value })} /></label>
  </>;
}

export function GuidelineScreen() {
  const [items, setItems] = useState<Guideline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const [raw, setRaw] = useState<GuidelineInput>({ text: '', source: '' });
  const [candidates, setCandidates] = useState<(GuidelineInput & { key: number })[] | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [manual, setManual] = useState<GuidelineInput>({ text: '', source: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState<GuidelineInput>({ text: '', source: '' });
  const enabled = items.filter(g => g.enabled).length;

  const load = useCallback(() => fetchGuidelines().then(
    items => { setItems(items); setLoadError(null); },
    e => setLoadError(guidelineError(e)),
  ).finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); setNotice('');
    try { await action(); }
    catch (e) { setError(guidelineError(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function extract() {
    await act(async () => {
      setExtractError(null);
      try {
        const result = await extractGuidelines(raw);
        setCandidates(result.candidates.map((c, key) => ({ key, text: c.text, source: result.source })));
      } catch (e) { setExtractError(guidelineError(e)); }
    });
  }
  async function save(lines: GuidelineInput[], after: () => void) {
    await act(async () => {
      const saved = await saveGuidelines(lines);
      setItems(previous => [...previous, ...saved]); after();
      setNotice(saved.some(g => !g.enabled) ? '지침을 저장했어요. 켠 지침이 10개라 일부는 꺼진 채 저장했어요. 목록에서 확인해 주세요.' : '지침을 저장했어요. 다음에 만드는 초안부터 써요.');
    });
  }

  return <>
    <AppHeader activePage="guidelines" />
    <main className="w-full min-w-0 flex-1 px-4 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-4xl min-w-0 gap-6">
        <header className="grid gap-3">
          <Link href="/questions" className="inline-flex min-h-11 items-center justify-self-start text-sm text-muted hover:underline">← 지원으로 돌아가기</Link>
          <h1 className="m-0 text-2xl font-bold">작성 지침</h1>
          <p className="m-0 text-sm leading-relaxed text-muted">들었던 작성법을 내 지침으로 쌓아 두세요. 켠 지침은 모든 답변 초안의 문체 · 구성 · 강조에 써요. 근거에 없는 사실은 만들지 않아요.</p>
        </header>
        {notice && <p role="status" className="m-0 rounded-sm bg-surface-soft p-4 text-sm">{notice}</p>}
        {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
        <div className="grid items-start gap-6 md:grid-cols-2">
          <section aria-labelledby="extract-title" className={card}>
            <h2 id="extract-title" className="m-0 text-lg font-semibold">붙여 넣고 정리하기</h2>
            <p className="m-0 text-sm leading-relaxed text-muted">요점이나 자막에 있는 작성법만 한 줄씩 정리해요. 분석 1회로 세며 실패해도 횟수를 써요.</p>
            <form onSubmit={e => { e.preventDefault(); void extract(); }} className="grid min-w-0 gap-4">
              <fieldset disabled={busy} className="m-0 grid min-w-0 gap-4 border-0 p-0">
                <label className="grid gap-1.5 text-sm font-medium">요점 · 자막<textarea required maxLength={20000} rows={7} className={inputClass + ' resize-y leading-relaxed'} value={raw.text} onChange={e => setRaw({ ...raw, text: e.target.value })} /></label>
                <label className="grid gap-1.5 text-sm font-medium">출처<input required maxLength={100} className={inputClass} placeholder="어느 영상 · 누구의 피드백" value={raw.source} onChange={e => setRaw({ ...raw, source: e.target.value })} /></label>
                <Button type="submit" className="min-h-11 justify-self-start" disabled={!raw.text.trim() || !raw.source.trim()}>정리하기</Button>
              </fieldset>
            </form>
            {extractError && <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-sm text-error">{extractError}</p><Button variant="secondary" disabled={busy} onClick={() => void extract()}>다시 시도</Button></div>}
            {busy && <p className="m-0 text-sm text-muted">요청을 처리하고 있어요…</p>}
          </section>
          <section aria-labelledby="manual-title" className={card}>
            <h2 id="manual-title" className="m-0 text-lg font-semibold">직접 한 줄 쓰기</h2>
            <p className="m-0 text-sm leading-relaxed text-muted">내가 정한 작성법도 좋아요. 직접 쓰고 저장할 때는 분석 횟수를 쓰지 않아요.</p>
            <form className="grid min-w-0 gap-4" onSubmit={e => { e.preventDefault(); void save([manual], () => setManual({ text: '', source: '' })); }}>
              <fieldset disabled={busy || loading || !!loadError} className="m-0 grid min-w-0 gap-4 border-0 p-0"><LineFields value={manual} onChange={setManual} /><Button type="submit" variant="secondary" className="min-h-11 justify-self-start" disabled={!manual.text.trim() || !manual.source.trim()}>한 줄 저장</Button></fieldset>
            </form>
          </section>
        </div>
        {candidates !== null && <section aria-labelledby="candidates-title" className={card}>
          <h2 id="candidates-title" className="m-0 text-lg font-semibold">정리한 후보</h2>
          <p className="m-0 text-sm text-muted">AI 해석이에요. 줄을 고치거나 빼고 저장해 주세요. 아직 저장하지 않았어요.</p>
          {candidates.length === 0 ? <p className="m-0 text-sm">지침으로 정리할 만한 게 없어요 — 직접 써 주세요.</p> : <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(candidates.map(({ text, source }) => ({ text, source })), () => setCandidates(null)); }}>
            <fieldset disabled={busy || loading || !!loadError} className="m-0 grid min-w-0 gap-5 border-0 p-0">
              {candidates.map(c => <div key={c.key} role="group" aria-label={'지침 후보 ' + (c.key + 1)} className="grid min-w-0 gap-3 border-t border-hairline pt-4"><LineFields value={c} onChange={value => setCandidates(previous => previous!.map(item => item.key === c.key ? { ...value, key: c.key } : item))} /><Button type="button" variant="ghost" className="min-h-11 justify-self-start" onClick={() => setCandidates(previous => previous!.filter(item => item.key !== c.key))}>빼기</Button></div>)}
              <Button type="submit" className="min-h-11 justify-self-start">후보 저장</Button>
            </fieldset>
          </form>}
        </section>}
        <section aria-labelledby="guidelines-title" className={card}>
          <h2 id="guidelines-title" className="m-0 text-lg font-semibold">내 지침 {items.length} / 50 · 켬 {enabled} / 10</h2>
          <p className="m-0 text-sm leading-relaxed text-muted">켠 지침은 다음에 만드는 초안부터 반영돼요. 고치거나 지워도 이미 만든 초안의 지침 표시는 그대로예요. 지침이 부딪치면 하나를 꺼 주세요.</p>
          {loading ? <p role="status" className="m-0 text-sm text-muted">지침을 불러오고 있어요…</p> : loadError ? <div className="grid justify-items-start gap-2"><p role="alert" className="m-0 text-sm text-error">{loadError}</p><Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>다시 불러오기</Button></div> : <>
            {!items.length && <p className="m-0 py-6 text-sm text-muted">아직 작성 지침이 없어요. 들었던 작성법을 붙여 넣거나 직접 한 줄 써 주세요.</p>}
            <ul className="m-0 grid list-none gap-4 p-0">{items.map(g => <li key={g.id} aria-label={'작성 지침 ' + g.id} className="grid min-w-0 gap-3 border-t border-hairline pt-4">
              {editing === g.id ? <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void act(async () => { const updated = await updateGuideline(g.id, edit); setItems(previous => previous.map(item => item.id === g.id ? updated : item)); setEditing(null); setNotice('지침을 고쳤어요. 다음에 만드는 초안부터 써요.'); }); }}>
                <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0"><LineFields value={edit} onChange={setEdit} /><div className="flex gap-2"><Button type="submit" className="min-h-11">저장</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setEditing(null)}>취소</Button></div></fieldset>
              </form> : <>
                <p className="m-0 break-words text-sm leading-relaxed">{g.text}</p><p className="m-0 break-words text-xs text-muted">출처 · {g.source}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" role="switch" className="size-5 accent-primary" checked={g.enabled} disabled={busy} aria-label={'지침 켜기: ' + g.text} onChange={() => void act(async () => { const updated = await updateGuideline(g.id, { enabled: !g.enabled }); setItems(previous => previous.map(item => item.id === g.id ? updated : item)); })} />{g.enabled ? '켬' : '끔'}</label>
                  <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setEditing(g.id); setEdit({ text: g.text, source: g.source }); setError(null); }}>고치기</Button>
                  <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void act(async () => { await deleteGuideline(g.id); setItems(previous => previous.filter(item => item.id !== g.id)); setNotice('지침을 지웠어요. 이미 만든 초안에는 만들 때의 지침이 남아 있어요.'); })}>지우기</Button>
                </div>
              </>}
            </li>)}</ul>
          </>}
        </section>
      </div>
    </main>
  </>;
}
