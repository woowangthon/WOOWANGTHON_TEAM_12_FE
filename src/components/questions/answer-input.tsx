"use client";

import { useEffect, useState } from "react";
import { useConfirmedAnswer } from "./use-confirmed-answer";
import { NewFactCandidates } from "./new-fact-candidates";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Toast, useToast } from "@/components/ui/toast";
import { confirmDraftSentence, setDraftSentenceRemoved } from "@/lib/api/questions";
import { MAX_GROUNDING_TEXT_LENGTH, type Answer, type Draft, type GroundingStatus, type QuestionDetail } from "@/lib/api/question-types";
import { AnswerEvidence } from "./answer-evidence";
import { blanksOf, checksLeft, composeDraft, DraftReview, firstCheck, openBlanks, type Selection } from "./answer-draft";
import { setEditedAnswer } from "./answer-box-state";
import type { AnswerHandler } from "./clarifications";
import { DraftGuidance } from "./draft-guidance";
import { failureReason } from "./draft-errors";
import { useGroundingCheck, type GroundingChecks } from "./use-grounding-check";

const LABEL: Record<GroundingStatus, string> = { SOURCE: "원문", USER_INPUT: "내가 입력", UNSUPPORTED: "근거 없음", OPINION: "생각 · AI 해석" };
const TINT: Record<GroundingStatus, string> = { SOURCE: "bg-evidence-soft", USER_INPUT: "bg-primary-soft", UNSUPPORTED: "bg-review-soft", OPINION: "" };

type AnswerChange = (id: number, answer: Answer | null) => void;
type DraftHooks = { onAnswer: AnswerHandler; onRefresh: () => Promise<void>; draftBusy: boolean };

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

/** 답칸의 상태 — 어느 초안(key)을 보기 상태로 보이는가, 이 화면에서 답한 빈칸. 뺀 문장은 서버 값(sentences[].removed)이고
 *  removed 는 저장을 기다리는 동안만 쓴다(FE#262). 고친 글은 저장하지 않는다(자동 저장 S-72 · FE#213 전 — 떠날 때 경고) */
type Box = { key: string | null; viewing: boolean; removed: Set<number>; local: Record<number, string> };
const later = (a: string, b: string) => Date.parse(a) > Date.parse(b);
// 고치기 상태에서 복사 · 다 썼어요 할 때 — 초안의 자리 표시가 글에 남았나(사용자가 쓴 대괄호는 세지 않는다)
const placeholdersIn = (text: string, draft: Draft | null) => draft ? blanksOf(draft).filter(b => text.includes(b.omission.placeholder!)).length : 0;

function AnswerEditor({ question, confirmed: a, checks, draftLabel, onAskDraft, onAnswer, onRefresh, draftBusy }: { question: QuestionDetail; confirmed: ReturnType<typeof useConfirmedAnswer>; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void } & DraftHooks) {
  const questionId = question.id;
  const [initialText] = useState(a.initialText);
  const g = useGroundingCheck(questionId, checks, initialText);
  const draft = question.draft ?? null;
  const ready = draft?.status === "COMPLETED" && draft.sentences.length > 0 ? draft : null;
  const draftKey = ready?.createdAt ?? null;
  // 새 초안이 다 쓴 답보다 나중이면 초안을 보기 상태로 — 다 쓴 답은 서버에 남고 「다 쓴 답 불러오기」로 돌아간다
  const fresh = !!ready && (!a.answer || later(ready.createdAt, a.answer.confirmedAt));
  const [box, setBox] = useState<Box>(() => ({ key: draftKey, viewing: fresh, removed: new Set(), local: {} }));
  // 새 초안이 오면 보기 상태로 다시 시작한다(뺀 문장 · 고친 글은 다시 만들기 전 경고에서 알렸다)
  if (box.key !== draftKey) setBox({ key: draftKey, viewing: fresh, removed: new Set(), local: {} });
  const viewing = box.viewing && !!ready;
  const [editBase, setEditBase] = useState(initialText ?? "");
  const [selected, setSelected] = useState<Selection>(null);
  const [ask, setAsk] = useState<"edit" | "copy" | "confirm" | null>(null);
  const { toast, showToast } = useToast();
  // 뺀 문장 — 서버에 저장된 것과 저장 중인 것
  const removed = new Set([...box.removed, ...(ready?.sentences.flatMap((s, i) => s.removed ? [i] : []) ?? [])]);
  const composed = ready ? composeDraft(question, ready, removed, box.local) : "";
  const text = viewing ? composed : g.text;
  const open = ready ? openBlanks(ready, removed, box.local) : [];
  const blanksLeft = viewing ? open.length : placeholdersIn(g.text, ready);
  const target = question.targetLength ?? null;

  // 다시 만들기 전 경고(초안 설정)가 읽는다 — 고치기 상태에서 직접 고친 글이 있나
  const edited = !viewing && g.text !== editBase && g.text.trim() !== "" && g.text !== (a.answer?.text ?? "");
  useEffect(() => { setEditedAnswer(questionId, edited); }, [questionId, edited]);
  // 고친 글은 아직 저장하지 않으니 새로고침 · 닫기 전에 브라우저가 묻는다(FE#262 — 자동 저장 FE#213 전까지)
  useEffect(() => {
    if (!edited) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);
  // 빼기 · 다시 넣기는 저장한다 — 저장하는 동안은 화면에서 먼저 빼 두고, 실패하면 되돌려 알린다
  const setRemoved = async (index: number, value: boolean) => {
    const sentence = ready?.sentences[index];
    if (!sentence) return;
    if (value) setBox(b => ({ ...b, removed: new Set(b.removed).add(index) }));
    try {
      if (sentence.id != null) { await setDraftSentenceRemoved(sentence.id, value); await onRefresh(); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.", true);
    } finally {
      setBox(b => { const next = new Set(b.removed); next.delete(index); return { ...b, removed: next }; });
    }
  };

  const goEdit = () => {
    if (ready && viewing) { g.setText(composed); setEditBase(composed); }
    setBox(b => ({ ...b, viewing: false })); setSelected(null); setAsk(null);
  };
  // 고치기로 가면 밑줄 · 빈칸과 카드가 사라진다 — 확인할 곳(맞아요 전 표시 · 답 안 한 빈칸)이 남았으면 먼저 묻는다(FE#262)
  const edit = () => { if (left) setAsk("edit"); else goEdit(); };
  const checkFirst = () => { setAsk(null); if (ready) setSelected(firstCheck(ready, removed, box.local)); };
  const loadConfirmed = () => {
    if (!a.answer) return;
    g.setText(a.answer.text); setEditBase(a.answer.text);
    setBox(b => ({ ...b, viewing: false })); setSelected(null);
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
  const drafting = draftBusy || draft?.status === "ANALYZING";
  const left = ready && viewing ? checksLeft(ready, removed, box.local) : 0;
  const removedList = ready && viewing ? ready.sentences.flatMap((s, i) => removed.has(i) ? [{ s, i }] : []) : [];
  const linked = ready?.omitted.filter(o => o.clarificationId !== null) ?? [];
  // 빠진 사실 질문은 차곡이 패널에서 답한다 — 답칸 위에서는 한 줄로 알린다(FE#262 · FE#266).
  // 보기 상태는 빈칸이 아닌 질문만(빈칸은 「확인할 곳」이 센다), 고치기 상태는 빈칸 표시가 없으니 빈칸 질문도 센다
  const asked = linked.filter(o => o.supplementId === null && (!viewing || !(o.placeholder && o.sentenceIndex != null))).length;
  return <>
    {drafting && <p role="status" className="m-0 text-sm text-muted">차곡이가 초안을 만들고 있어요. 다 되면 답칸에 들어와요.</p>}
    {draft?.status === "FAILED" && !drafting && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 차곡이에서 다시 만들 수 있어요.</p>}
    {viewing && <div id={`draft-title-${questionId}`} role="group" aria-label="답변 초안" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {/* 확인할 곳은 알약으로 눈에 띄게(FE#262) */}
      <span role="status" className={left ? "inline-flex items-center rounded-full bg-review-soft px-3 py-1 text-sm font-semibold text-review"
        : "inline-flex items-center rounded-full bg-evidence-soft px-3 py-1 text-sm font-semibold text-evidence"}>{left ? `확인할 곳 ${left}군데` : "모두 확인했어요 ✓"}</span>
      <p className="m-0 min-w-0 flex-1 text-note text-muted">차곡이 초안이에요. 밑줄 · 빈칸을 누르면 근거와 이유가 보여요. 최종 문장은 직접 정해요.</p>
      <Button variant="secondary" size="sm" className="min-h-11" disabled={draftBusy || locked} onClick={edit}>직접 고치기</Button>
    </div>}
    {ready && asked > 0 && <p role="status" className="m-0 flex flex-wrap items-center gap-x-1.5 text-sm text-body">
      차곡이가 더 물어본 게 {asked}개 있어요 — 답하면 다음 초안에 들어가요
      <Button variant="link" size="sm" className="min-h-11" onClick={onAskDraft}>질문 보기</Button>
    </p>}
    <label htmlFor={`answer-${questionId}`} className="sr-only">내가 쓴 답</label>
    <div className="grid min-w-0 overflow-hidden rounded-[18px] border border-hairline bg-canvas has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink">
      {viewing && ready ? <DraftReview question={question} draft={ready} removed={removed} local={box.local} selected={selected} onSelect={setSelected}
        onRemove={i => void setRemoved(i, true)} onEdit={edit}
        onAnswer={async (clarificationId, answer) => { await onAnswer(clarificationId, answer); setBox(b => ({ ...b, local: { ...b.local, [clarificationId]: answer } })); }}
        onConfirm={async s => { await confirmDraftSentence(s.id!); await onRefresh(); }}
        onActorDecided={onRefresh} disabled={draftBusy || locked} />
        : <textarea id={`answer-${questionId}`} rows={8}
          maxLength={MAX_GROUNDING_TEXT_LENGTH} value={g.text} disabled={g.loading || g.busy || analyzing || !g.initialized || locked}
          placeholder="여기에 답을 쓰거나, 차곡이에게 초안을 부탁해 보세요."
          onChange={e => g.setText(e.target.value)}
          className="block w-full min-w-0 resize-y border-0 bg-transparent p-5 text-ui leading-relaxed outline-none focus-visible:outline-none disabled:bg-surface-soft" />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft px-3.5 py-2.5">
        {/* 왼쪽은 글을 살피는 일, 오른쪽은 다음 행동 — 초안 부탁을 더 많이 쓴다(FE#215). 「다 썼어요」가 줄 끝이다.
            「분석 1회」는 줄에 한 번, 「다 썼어요」 바로 앞에(S-15 · #217) — 「초안 부탁하기」는 분석을 쓰지 않아 그 옆에 두지 않는다(FE#249) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted tabular-nums">{text.length.toLocaleString()}자{target ? ` · 목표 ${target.toLocaleString()}자` : " / 5,000자"}</span>
          <Button variant="ghost" className="min-h-11" title="분석 1회를 써요" disabled={!valid || g.loading || g.busy || analyzing || !g.initialized} onClick={() => void g.submit(text)}>
            {g.busy || analyzing ? "근거 점검 중…" : "근거 점검"}
          </Button>
          <Button variant="ghost" className="min-h-11" disabled={!text.trim()} onClick={() => { if (blanksLeft) setAsk("copy"); else void copy(); }}>복사</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftLabel && <Button variant="secondary" className="min-h-11" onClick={onAskDraft}>{draftLabel}</Button>}
          <AnalysisCost running={g.busy || analyzing || locked} />
          <Button disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || locked} onClick={() => { if (blanksLeft) setAsk("confirm"); else confirmAnswer(); }}>{a.busy ? "처리 중…" : "다 썼어요"}</Button>
        </div>
      </div>
    </div>
    {viewing && target !== null && text.length < target && <p className="m-0 text-note leading-relaxed text-muted">
      자료에 있는 내용으로만 써서 목표보다 짧을 수 있어요. 빈칸 · 빠진 사실에 답하면 다음 초안이 길어져요.
    </p>}
    {removedList.length > 0 && <details className="grid gap-2 rounded-sm bg-surface-soft px-3.5 py-2.5 text-sm">
      <summary className="min-h-11 cursor-pointer content-center font-medium text-body">뺀 문장 {removedList.length}개 — 다시 넣을 수 있어요</summary>
      <ul aria-label="뺀 문장" className="m-0 grid list-none gap-2 p-0 pt-1">
        {removedList.map(({ s, i }) => <li key={i} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 break-words text-muted line-through decoration-hairline">{s.text}</span>
          <Button variant="secondary" size="sm" className="min-h-11" disabled={draftBusy || locked} onClick={() => void setRemoved(i, false)}>다시 넣기</Button>
        </li>)}
      </ul>
    </details>}
    {viewing && ready && <DraftGuidance draft={ready} />}
    {viewing && a.answer && <Button variant="link" size="sm" className="min-h-11 justify-self-start" onClick={loadConfirmed}>다 쓴 답 불러오기</Button>}
    {!viewing && ready && !edited && g.text === (initialText ?? "") && <Button variant="link" size="sm" className="min-h-11 justify-self-start" onClick={() => setBox(b => ({ ...b, viewing: true }))}>차곡이 초안 보기</Button>}
    {a.answer && <p role="status" className="m-0 text-sm text-muted">{text === a.answer.text ? "다 쓴 답으로 저장했어요" : "고친 내용이 있어요 · 「다 썼어요」를 다시 눌러 주세요"}</p>}
    {g.loading && <p role="status" className="m-0 text-sm text-muted">마지막 근거 점검을 불러오고 있어요…</p>}
    {analyzing && <p role="status" className="m-0 text-sm text-muted">문장을 근거와 대조하고 있어요. 새로고침해도 점검한 글과 진행 상태를 이어서 확인해요.</p>}
    {g.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.failure.message}{g.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      <Button variant="secondary" className="min-h-11" disabled={g.busy} onClick={() => void (g.failure?.retryText !== undefined ? g.submit(g.failure.retryText) : g.refresh())}>
        {g.failure.retryText !== undefined ? "같은 글로 다시 시도" : "점검 상태 다시 확인"}
      </Button>
    </div>}
    {g.check?.status === "FAILED" && g.failure?.retryText === undefined && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.check.error?.message || "근거 점검을 마치지 못했어요."} 점검할 글은 저장돼 있어요.</p>
      <Button variant="secondary" className="min-h-11" disabled={g.busy} onClick={() => void g.submit(g.check!.text)}>같은 글로 다시 시도</Button>
    </div>}
    {g.check?.status === "COMPLETED" && <div className="grid min-w-0 gap-4">
      <h4 className="m-0 text-sm font-semibold">{stale ? "고치기 전 결과 — 다시 점검해 주세요" : "문장별 근거 점검"}</h4>
      <p className="m-0 text-note leading-relaxed text-muted">근거 없음은 현재 자료에서 받칠 근거를 찾지 못했다는 뜻이에요. 거짓이라는 뜻은 아니에요. 판정과 이유는 AI 해석이니 직접 확인해 주세요.</p>
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
    </div>}
    <Dialog open={ask !== null} onOpenChange={o => { if (!o) setAsk(null); }}>
      <DialogContent>
        {ask === "edit" ? <>
          <DialogTitle>확인할 곳 {left}군데가 남았어요</DialogTitle>
          <DialogDescription>
            직접 고치면 밑줄 · 빈칸 표시와 카드가 사라져서 여기서 맞아요 · 주체 확인 · 빈칸 답을 할 수 없어요.
            {open.length > 0 && " 빈칸 질문은 답칸 아래에서 계속 답할 수 있고, 답은 경험에 저장돼 다음 초안부터 쓰여요."}
            {" "}고친 글의 근거는 「근거 점검」(분석 1회)으로 다시 볼 수 있어요.
          </DialogDescription>
          <DialogFooter>
            <Button className="min-h-11" variant="secondary" onClick={checkFirst}>먼저 확인하기</Button>
            <Button className="min-h-11" onClick={goEdit}>직접 고치기</Button>
          </DialogFooter>
        </> : <>
          <DialogTitle>빈칸 {blanksLeft}개가 남았어요</DialogTitle>
          <DialogDescription>{ask === "copy" ? "그대로 복사하면 「[결과]」 같은 자리 표시가 글에 남아요." : "그대로 다 쓴 답으로 저장하면 「[결과]」 같은 자리 표시가 답에 남아요."}</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11" variant="secondary" onClick={() => setAsk(null)}>빈칸 채우러 가기</Button>
            <Button className="min-h-11" onClick={() => void (ask === "copy" ? copy() : confirmAnswer())}>{ask === "copy" ? "그래도 복사" : "그래도 다 썼어요"}</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
    <Toast toast={toast} />
  </>;
}
