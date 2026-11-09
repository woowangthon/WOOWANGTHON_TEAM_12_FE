"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useConfirmedAnswer } from "./use-confirmed-answer";
import { NewFactCandidates } from "./new-fact-candidates";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Toast, useToast } from "@/components/ui/toast";
import { confirmDraftSentence, setDraftSentenceRemoved } from "@/lib/api/questions";
import { updateSupplement } from "@/lib/api/experience";
import { MAX_GROUNDING_TEXT_LENGTH, type Answer, type GroundingStatus, type QuestionDetail } from "@/lib/api/question-types";
import { AnswerEvidence } from "./answer-evidence";
import { analyze, composeDraft, DraftEditor, GROUND_LABEL as LABEL, type EditorHandle, type Mark, type Selection } from "./answer-draft";
import { setEditedAnswer } from "./answer-box-state";
import type { AnswerHandler } from "./clarifications";
import { DraftGuidance } from "./draft-guidance";
import { failureReason } from "./draft-errors";
import { useGroundingCheck, type GroundingChecks } from "./use-grounding-check";
import { TargetLengthField } from "./type-fields";

const TINT: Record<GroundingStatus, string> = { SOURCE: "bg-evidence-soft", USER_INPUT: "bg-primary-soft", UNSUPPORTED: "bg-review-soft", OPINION: "" };

type AnswerChange = (id: number, answer: Answer | null) => void;
// 목표 글자 수는 답칸 아래 한 곳에서 정한다(FE#269)
type DraftHooks = { onAnswer: AnswerHandler; onRefresh: () => Promise<void>; draftBusy: boolean; onTargetLength: (targetLength: number | null) => Promise<void> };

/** 내가 쓴 답(S-45 · S-48 · S-79): 받아 둔 문항의 확정 답으로 시작하고, 초안이 더 새로우면 초안을 보기 상태로 담는다. 근거 점검은 독립적으로 읽는다.
 *  문항을 못 받았으면 화면의 「다시 불러오기」를 쓴다 */
export function AnswerInput({ questionId, question, loadFailed, onAnswerChange, checks, onAskDraft, ...hooks }: { questionId: number; question: QuestionDetail | null; loadFailed: boolean; onAnswerChange: AnswerChange; checks: GroundingChecks; onAskDraft: () => void } & DraftHooks) {
  return <section aria-labelledby={`answer-title-${questionId}`} className="mb-8 grid min-w-0 gap-3">
    <h3 id={`answer-title-${questionId}`} className="m-0 text-title-md font-semibold">내가 쓴 답</h3>
    {question ? <LoadedAnswer question={question} onAnswerChange={onAnswerChange} checks={checks} draftLabel={question.status === "ANALYZING" || question.status === "FAILED" ? null : question.draft ? "초안 설정 열기" : "초안 부탁하기"} onAskDraft={onAskDraft} {...hooks} />
      : !loadFailed && <p role="status" className="m-0 text-sm text-muted">쓴 답을 불러오고 있어요…</p>}
  </section>;
}

function LoadedAnswer({ question, onAnswerChange, checks, draftLabel, onAskDraft, ...hooks }: { question: QuestionDetail; onAnswerChange: AnswerChange; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void } & DraftHooks) {
  const confirmed = useConfirmedAnswer(question.id, question.answer ?? null, onAnswerChange);
  return <>
    <AnswerEditor question={question} confirmed={confirmed} checks={checks} draftLabel={draftLabel} onAskDraft={onAskDraft} {...hooks} />
    <NewFactCandidates confirmed={confirmed} />
  </>;
}

/** 답칸의 상태 — 어느 초안(key)을 담았나, 이 화면에서 답한 빈칸(local), 고친 문장에 이 화면에서 누른 맞아요(mine — 표시 키 → 그때 글).
 *  뺀 문장은 서버 값(sentences[].removed)이고 removed 는 저장을 기다리는 동안만 쓴다(FE#262). 고친 글 · mine 은 저장하지 않는다(자동 저장 S-72 · FE#213 전 — 떠날 때 경고) */
type Box = { key: string | null; removed: Set<number>; local: Record<number, string>; mine: Record<string, string>; sawDrafting: boolean };
const later = (a: string, b: string) => Date.parse(a) > Date.parse(b);

function AnswerEditor({ question, confirmed: a, checks, draftLabel, onAskDraft, onAnswer, onRefresh, draftBusy, onTargetLength }: { question: QuestionDetail; confirmed: ReturnType<typeof useConfirmedAnswer>; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void } & DraftHooks) {
  const questionId = question.id;
  const draft = question.draft ?? null;
  const ready = draft?.status === "COMPLETED" && draft.sentences.length > 0 ? draft : null;
  const draftKey = ready?.createdAt ?? null;
  const removedKey = ready?.sentences.flatMap((s, i) => s.removed ? [i] : []).join() ?? "";
  // 새 초안이 다 쓴 답보다 나중이면 초안 글로 시작한다 — 다 쓴 답은 서버에 남고 「다 쓴 답 불러오기」로 돌아간다
  const fresh = !!ready && (!a.answer || later(ready.createdAt, a.answer.confirmedAt));
  const serverRemoved = () => new Set(removedKey ? removedKey.split(",").map(Number) : []);
  const [initialText] = useState(() => fresh && ready ? composeDraft(question, ready, serverRemoved(), {}) : a.initialText);
  const g = useGroundingCheck(questionId, checks, initialText);
  const [box, setBox] = useState<Box>(() => ({ key: draftKey, removed: new Set(), local: {}, mine: {}, sawDrafting: false }));
  const [editBase, setEditBase] = useState(initialText ?? "");
  const [selected, setSelected] = useState<Selection>(null);
  const [ask, setAsk] = useState<"copy" | "confirm" | "ground" | "load" | null>(null);
  const { toast, showToast } = useToast();
  const editor = useRef<EditorHandle | null>(null);
  const drafting = draftBusy || draft?.status === "ANALYZING";
  const text = g.text;
  // 고친 글 — 다시 만들기 전 경고(초안 설정)가 읽는다
  const edited = text !== editBase && text.trim() !== "" && text !== (a.answer?.text ?? "");
  if (drafting && !box.sawDrafting) setBox(b => ({ ...b, sawDrafting: true }));
  // 새 초안이 오면 그 글로 바꾼다 — 이 탭에서 만들기를 지켜봤거나(다시 만들기 전 경고에서 알렸다) 고친 글이 없을 때만.
  // 다른 탭에서 만든 초안은 고친 글을 덮지 않는다(새로고침하면 보인다 — 「불러오기」 안내는 백로그)
  if (box.key !== draftKey) {
    const take = !!ready && fresh && (box.sawDrafting || !edited);
    setBox({ key: draftKey, removed: new Set(), local: {}, mine: {}, sawDrafting: false });
    setSelected(null);
    if (take) { const next = composeDraft(question, ready, serverRemoved(), {}); g.setText(next); setEditBase(next); }
  }
  // 뺀 문장 — 서버에 저장된 것과 저장 중인 것
  const removed = useMemo(() => new Set([...box.removed, ...(removedKey ? removedKey.split(",").map(Number) : [])]), [box.removed, removedKey]);
  const analysis = useMemo(() => analyze(question, ready, removed, box.local, box.mine, text, g.check), [question, ready, removed, box.local, box.mine, text, g.check]);
  const latest = useRef(analysis);
  useEffect(() => { latest.current = analysis; });
  const target = question.targetLength ?? null;
  const marked = !!analysis.marks.length || !!analysis.own.length;
  const left = analysis?.checks.length ?? 0;
  const blanksLeft = analysis?.chips.length ?? 0;

  useEffect(() => { setEditedAnswer(questionId, edited); }, [questionId, edited]);
  // 고친 글은 아직 저장하지 않으니 새로고침 · 닫기 전에 브라우저가 묻는다(FE#262 — 자동 저장 FE#213 전까지)
  useEffect(() => {
    if (!edited) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);

  // 빼기 — 글에서 지우고 서버에 저장한다. 실패하면 알린다(글은 Ctrl+Z 로 되돌릴 수 있다)
  const remove = async (mark: Mark) => {
    const sentence = ready?.sentences[mark.index];
    if (!sentence) return;
    const after = text.slice(mark.end).match(/^\s*/)![0].length;
    const before = after ? 0 : text.slice(0, mark.start).match(/\s*$/)![0].length;
    editor.current?.replace(mark.start - before, mark.end + after, "");
    setBox(b => ({ ...b, removed: new Set(b.removed).add(mark.index) }));
    try {
      if (sentence.id != null) { await setDraftSentenceRemoved(sentence.id, true); await onRefresh(); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.", true);
    } finally {
      setBox(b => { const next = new Set(b.removed); next.delete(mark.index); return { ...b, removed: next }; });
    }
  };
  // 다시 넣기 — 원래 초안 문장을 짝이 있는 가장 가까운 앞 문장 뒤에(없으면 맨 앞)
  const restore = async (index: number) => {
    if (!ready) return;
    const sentence = ready.sentences[index];
    try {
      if (sentence.id != null) await setDraftSentenceRemoved(sentence.id, false);
      const others = new Set(ready.sentences.flatMap((_, i) => i === index ? [] : [i]));
      const original = composeDraft(question, ready, others, box.local);
      const before = (latest.current?.marks ?? []).filter(m => m.index < index).sort((x, y) => y.index - x.index)[0];
      const at = before ? before.end : 0;
      editor.current?.replace(at, at, before ? ` ${original}` : text ? `${original} ` : original);
      await onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.", true);
    }
  };
  // 맞아요 — 고치지 않은 AI 보탬 · 생각은 서버에, 고친 문장 · 숫자 · 채운 빈칸 확인은 이 화면에서만(저장된 문장 글과 달라서)
  const confirm = async (mark: Mark) => {
    const sentence = ready?.sentences[mark.index];
    if (!sentence) return;
    if (!mark.edited && mark.need === "marked" && sentence.id != null) { await confirmDraftSentence(sentence.id); await onRefresh(); }
    else setBox(b => ({ ...b, mine: { ...b.mine, [`s-${mark.index}`]: mark.text } }));
    setSelected(null);
  };

  const loadConfirmed = () => {
    if (!a.answer) return;
    setAsk(null);
    g.setText(a.answer.text); setEditBase(a.answer.text); setSelected(null);
  };
  const copy = async () => {
    setAsk(null);
    try { await navigator.clipboard.writeText(text); showToast("답칸의 글을 복사했어요. 표시는 복사하지 않아요."); }
    catch { showToast("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.", true); }
  };
  const confirmAnswer = () => { setAsk(null); void a.confirm(text); };

  const locked = a.busy || a.answer?.newFacts?.status === "ANALYZING";
  const analyzing = g.check?.status === "ANALYZING";
  const valid = !!text.trim() && text.length <= MAX_GROUNDING_TEXT_LENGTH;
  const stale = g.check?.status === "COMPLETED" && text !== g.check.text;
  const unsupportedCount = g.check?.status === "COMPLETED" ? g.check.sentences.filter(x => x.status === "UNSUPPORTED").length : 0;
  // 고친 사실 문장 — 그 글로 근거 점검을 안 했으면 다 썼어요 때 한 번 권한다(뜻이 바뀐 건 코드가 못 잡는다)
  const editedFacts = analysis?.marks.filter(m => m.edited && ready?.sentences[m.index].kind === "FACT").length ?? 0;
  const groundFirst = editedFacts > 0 && !(g.check?.status === "COMPLETED" && g.check.text === text);
  const finish = () => { if (groundFirst) setAsk("ground"); else confirmAnswer(); };
  const removedList = ready ? ready.sentences.flatMap((s, i) => removed.has(i) ? [{ s, i }] : []) : [];
  // 빠진 사실 질문은 차곡이 패널에서 답한다 — 답칸 위에서는 한 줄로 알린다(FE#262 · FE#266). 글에 칩으로 남은 빈칸은 「확인할 곳」이 센다
  const chipped = new Set(analysis?.chips.map(c => c.at) ?? []);
  const asked = ready?.omitted.filter((o, at) => o.clarificationId !== null && o.supplementId === null && !chipped.has(at)).length ?? 0;
  return <>
    {drafting && <p role="status" className="m-0 text-sm text-muted">차곡이가 초안을 만들고 있어요. 다 되면 답칸에 들어와요.</p>}
    {draft?.status === "FAILED" && !drafting && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 차곡이에서 다시 만들 수 있어요.</p>}
    {marked && <div id={`draft-title-${questionId}`} role="group" aria-label="답변 초안" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {/* 확인할 곳은 부가 정보라 작게 — 남은 개수는 늘 보인다(FE#262 · FE#269). 사용법은 ⓘ 로 접는다 */}
      <span role="status" className={cn("inline-flex items-center gap-1.5 text-note font-medium tabular-nums", left ? "text-review" : "text-evidence")}>
        {left ? <><span aria-hidden="true" className="size-1.5 rounded-full bg-review" />확인할 곳 {left}군데</> : "모두 확인했어요 ✓"}
      </span>
      <span className="-ml-2 mr-auto inline-flex items-center"><InfoTip label="차곡이 초안">차곡이 초안이에요. 바로 고쳐 쓰고, 밑줄 · 빈칸을 누르면 근거와 이유가 보여요. 최종 문장은 직접 정해요.</InfoTip></span>
      {left > 0 && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-10" title="Alt + ↓" onClick={() => editor.current?.next()}>다음 확인할 곳 →</Button>}
    </div>}
    {ready && asked > 0 && <p role="status" className="m-0 flex flex-wrap items-center gap-x-1.5 text-sm text-body">
      차곡이가 더 물어본 게 {asked}개 있어요 — 답하면 다음 초안에 들어가요
      <Button variant="link" size="sm" className="min-h-11 lg:min-h-10" onClick={onAskDraft}>질문 보기</Button>
    </p>}
    <label htmlFor={`answer-${questionId}`} className="sr-only">내가 쓴 답</label>
    <div className="grid min-w-0 overflow-hidden rounded-[18px] border border-hairline bg-canvas has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink">
      <DraftEditor handleRef={editor} inputId={`answer-${questionId}`} question={question} draft={ready} analysis={analysis} local={box.local}
        text={text} onText={g.setText} placeholder="여기에 답을 쓰거나, 차곡이에게 초안을 부탁해 보세요."
        disabled={g.loading || g.busy || analyzing || !g.initialized || locked} cardsDisabled={draftBusy || locked}
        selected={selected} onSelect={setSelected} onRemove={m => void remove(m)} onConfirm={confirm} onActorDecided={onRefresh}
        onConfirmOwn={o => setBox(b => ({ ...b, mine: { ...b.mine, [`g-${o.index}`]: o.text } }))}
        onAnswer={async (chip, answer) => {
          await onAnswer(chip.omission.clarificationId!, answer);
          setBox(b => ({ ...b, local: { ...b.local, [chip.omission.clarificationId!]: answer } }));
          // 답을 기다리는 동안 글이 바뀌었을 수 있다 — 그 칩의 지금 자리에 넣는다. 칩이 없어졌으면 보완만 남는다
          const now = latest.current?.chips.find(c => c.at === chip.at);
          if (now) editor.current?.replace(now.start, now.end, answer.trim().replace(/[.!?。]+$/, ""));
          else showToast("답은 경험에 저장했어요. 글에서 빈칸이 없어져 글에는 넣지 않았어요.");
        }}
        onFilledFixed={async (omission, answer) => {
          await updateSupplement(omission.supplementId!, answer);
          if (omission.clarificationId != null) setBox(b => ({ ...b, local: { ...b.local, [omission.clarificationId!]: answer } }));
          await onRefresh();
        }} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft px-3.5 py-2.5">
        {/* 왼쪽은 글을 살피는 일, 오른쪽은 다음 행동 — 초안 부탁을 더 많이 쓴다(FE#215). 「다 썼어요」가 줄 끝이다.
            「분석 1회」는 줄에 한 번, 「다 썼어요」 바로 앞에(S-15 · #217) — 「초안 부탁하기」는 분석을 쓰지 않아 그 옆에 두지 않는다(FE#249) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">{text.length.toLocaleString()}자 /{" "}
            <TargetLengthField value={target} onSave={onTargetLength} /></span>
          <Button variant="ghost" className="min-h-11 lg:min-h-10" title="분석 1회를 써요" disabled={!valid || g.loading || g.busy || analyzing || !g.initialized} onClick={() => void g.submit(text)}>
            {g.busy || analyzing ? "근거 점검 중…" : "근거 점검"}
          </Button>
          <Button variant="ghost" className="min-h-11 lg:min-h-10" disabled={!text.trim()} onClick={() => { if (blanksLeft) setAsk("copy"); else void copy(); }}>복사</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftLabel && <Button variant="secondary" className="min-h-11 lg:min-h-10" onClick={onAskDraft}>{draftLabel}</Button>}
          <AnalysisCost running={g.busy || analyzing || locked} />
          <Button className="min-h-11 lg:min-h-10" disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || locked} onClick={() => { if (blanksLeft) setAsk("confirm"); else finish(); }}>{a.busy ? "처리 중…" : "다 썼어요"}</Button>
        </div>
      </div>
    </div>
    {marked && target !== null && text.length < target && <p className="m-0 text-note leading-relaxed text-muted">
      자료에 있는 내용으로만 써서 목표보다 짧을 수 있어요. 빈칸 · 빠진 사실에 답하면 다음 초안이 길어져요.
    </p>}
    {removedList.length > 0 && <details className="grid gap-2 rounded-sm bg-surface-soft px-3.5 py-2.5 text-sm">
      <summary className="min-h-11 lg:min-h-10 cursor-pointer content-center font-medium text-body">뺀 문장 {removedList.length}개 — 다시 넣을 수 있어요</summary>
      <ul aria-label="뺀 문장" className="m-0 grid list-none gap-2 p-0 pt-1">
        {removedList.map(({ s, i }) => <li key={i} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 break-words text-muted line-through decoration-hairline">{s.text}</span>
          <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-10" disabled={draftBusy || locked} onClick={() => void restore(i)}>다시 넣기</Button>
        </li>)}
      </ul>
    </details>}
    {marked && ready && <DraftGuidance draft={ready} />}
    {a.answer && text !== a.answer.text && <Button variant="link" size="sm" className="min-h-11 lg:min-h-10 justify-self-start" onClick={() => { if (edited) setAsk("load"); else loadConfirmed(); }}>다 쓴 답 불러오기</Button>}
    {a.answer && <p role="status" className="m-0 text-sm text-muted">{text === a.answer.text ? "다 쓴 답으로 저장했어요" : "고친 내용이 있어요 · 「다 썼어요」를 다시 눌러 주세요"}</p>}
    {g.loading && <p role="status" className="m-0 text-sm text-muted">마지막 근거 점검을 불러오고 있어요…</p>}
    {analyzing && <p role="status" className="m-0 text-sm text-muted">문장을 근거와 대조하고 있어요. 새로고침해도 점검한 글과 진행 상태를 이어서 확인해요.</p>}
    {g.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.failure.message}{g.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={g.busy} onClick={() => void (g.failure?.retryText !== undefined ? g.submit(g.failure.retryText) : g.refresh())}>
        {g.failure.retryText !== undefined ? "같은 글로 다시 시도" : "점검 상태 다시 확인"}
      </Button>
    </div>}
    {g.check?.status === "FAILED" && g.failure?.retryText === undefined && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.check.error?.message || "근거 점검을 마치지 못했어요."} 점검할 글은 저장돼 있어요.</p>
      <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={g.busy} onClick={() => void g.submit(g.check!.text)}>같은 글로 다시 시도</Button>
    </div>}
    {/* 점검 결과는 답칸 문장 카드에 붙는다(FE#307) — 목록은 요약 한 줄로 접어 화면 읽기 · 비교용으로 남긴다 */}
    {g.check?.status === "COMPLETED" && <details className="grid min-w-0 gap-4 rounded-sm bg-surface-soft px-3.5 py-2.5">
      <summary className="min-h-11 lg:min-h-10 cursor-pointer content-center text-sm font-semibold">
        {stale ? "고치기 전 근거 점검 — 다시 점검해 주세요" : unsupportedCount ? `근거 점검 — 근거 없음 ${unsupportedCount}문장 · 답칸에 칠했어요` : "근거 점검 — 근거 없음 없어요"}
      </summary>
      <p className="m-0 text-note leading-relaxed text-muted">근거 없음은 현재 자료에서 받칠 근거를 찾지 못했다는 뜻이에요. 거짓이라는 뜻은 아니에요. 판정과 이유는 AI 해석이니 직접 확인해 주세요. 답칸에서 문장을 누르면 그 문장의 결과가 보여요.</p>
      <ol aria-label={stale ? "고치기 전 문장별 근거" : "문장별 근거"} className="m-0 grid list-none gap-4 p-0">
        {g.check.sentences.map((s, i) => <li key={i} className="grid min-w-0 gap-2">
          <p className="m-0 whitespace-pre-wrap break-words text-ui leading-loose"><span className={`${TINT[s.status]} rounded-sm px-1 py-0.5`}>{s.text}</span></p>
          <p className={`m-0 text-xs font-semibold ${s.status === "UNSUPPORTED" ? "text-review" : "text-muted"}`}>{LABEL[s.status]}</p>
          {s.status === "UNSUPPORTED" && <p className="m-0 text-sm text-review">지우거나, 사실이면 근거를 더해 주세요.</p>}
          {s.note && <p className="m-0 text-sm text-muted">AI 해석 — {s.note}</p>}
          {s.evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={questionId} />)}
          {(s.status === "SOURCE" || s.status === "USER_INPUT") && !s.evidence.length && <p className="m-0 text-sm text-muted">연결된 근거가 지금은 없어요. 판정은 점검했을 때 그대로이니 다시 점검해 주세요.</p>}
        </li>)}
      </ol>
    </details>}
    <Dialog open={ask !== null} onOpenChange={o => { if (!o) setAsk(null); }}>
      <DialogContent>
        {ask === "ground" ? <>
          <DialogTitle>고친 사실 문장 {editedFacts}개가 있어요</DialogTitle>
          <DialogDescription>고친 내용이 근거와 맞는지는 「근거 점검」(분석 1회)으로 볼 수 있어요.</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => { setAsk(null); void g.submit(text); }}>근거 점검하기</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={confirmAnswer}>그냥 다 썼어요</Button>
          </DialogFooter>
        </> : ask === "load" ? <>
          <DialogTitle>다 쓴 답을 불러올까요?</DialogTitle>
          <DialogDescription>지금 답칸에서 고친 글은 다 쓴 답으로 바뀌어요.</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => setAsk(null)}>취소</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={loadConfirmed}>불러오기</Button>
          </DialogFooter>
        </> : <>
          <DialogTitle>빈칸 {blanksLeft}개가 남았어요</DialogTitle>
          <DialogDescription>{ask === "copy" ? "그대로 복사하면 「[결과]」 같은 자리 표시가 글에 남아요." : "그대로 다 쓴 답으로 저장하면 「[결과]」 같은 자리 표시가 답에 남아요."}</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => setAsk(null)}>빈칸 채우러 가기</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={() => { if (ask === "copy") void copy(); else finish(); }}>{ask === "copy" ? "그래도 복사" : "그래도 다 썼어요"}</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
    <Toast toast={toast} />
  </>;
}
