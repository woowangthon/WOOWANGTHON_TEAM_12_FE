"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClockCounterClockwiseIcon, CopyIcon } from "@phosphor-icons/react";
import { RevisionDialog } from "@/components/revisions/revision-list";
import { useRestoreListener } from "@/components/revisions/restore-bus";
import type { RestoreResult } from "@/lib/api/revisions";
import { cn } from "@/lib/utils";
import { useConfirmedAnswer } from "./use-confirmed-answer";
import { AnalysisButton, AnalysisCost, useAnalysisExhausted } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Toast, useToast } from "@/components/ui/toast";
import { confirmDraftSentence } from "@/lib/api/questions";
import { updateSupplement } from "@/lib/api/experience";
import { MAX_GROUNDING_TEXT_LENGTH, type Answer, type AnswerDraft, type QuestionDetail } from "@/lib/api/question-types";
import { analyze, composeDraft, DraftEditor, pairLinked, pairOf, type EditorHandle, type Mark, type Selection } from "./answer-draft";
import { setBoxShows, setEditedAnswer } from "./answer-box-state";
import type { AnswerHandler } from "./clarifications";
import { DraftGuidance } from "./draft-guidance";
import { failureReason } from "./draft-errors";
import { splitSentences } from "./draft-match";
import { useGroundingCheck, type GroundingChecks } from "./use-grounding-check";
import { TargetLengthField } from "./type-fields";
import { useAnswerAutosave } from "./use-answer-autosave";

type AnswerChange = (id: number, answer: Answer | null) => void;
type AnswerDraftChange = (id: number, draft: AnswerDraft | null) => void;
// 목표 글자 수는 답칸 아래 한 곳에서 정한다(FE#269)
// 새 경험 후보는 차곡이 패널에서만 찾고 고른다(FE#270 · FE#543) — 답칸 아래에는 저장 줄도 찾기 버튼도 두지 않는다
// trailing — 머리줄 오른쪽 아이콘 줄 끝에 더하는 것(문항 지우기)
type DraftHooks = { onAnswer: AnswerHandler; onRefresh: () => Promise<void>; draftBusy: boolean; onTargetLength: (targetLength: number | null) => Promise<void>; trailing?: ReactNode };

/** 내가 쓴 답(S-45 · S-48 · S-79): 받아 둔 문항의 확정 답으로 시작하고, 초안이 더 새로우면 초안을 보기 상태로 담는다. 근거 점검은 독립적으로 읽는다.
 *  문항을 못 받았으면 화면의 「다시 불러오기」를 쓴다 */
export function AnswerInput({ questionId, question, loadFailed, onAnswerChange, onAnswerDraftChange, checks, onAskDraft, ...hooks }: { questionId: number; question: QuestionDetail | null; loadFailed: boolean; onAnswerChange: AnswerChange; onAnswerDraftChange: AnswerDraftChange; checks: GroundingChecks; onAskDraft: () => void } & DraftHooks) {
  return <section id={`answer-title-${questionId}`} aria-label="내가 쓴 답" className="mb-8 grid min-w-0 gap-3">
    {question ? <LoadedAnswer question={question} onAnswerChange={onAnswerChange} onAnswerDraftChange={onAnswerDraftChange} checks={checks} draftLabel={question.status === "ANALYZING" || question.status === "FAILED" ? null : question.draft ? "초안 설정 열기" : "초안 부탁하기"} onAskDraft={onAskDraft} {...hooks} />
      : !loadFailed && <p role="status" className="m-0 text-sm text-muted">쓴 답을 불러오고 있어요…</p>}
  </section>;
}

function LoadedAnswer({ question, onAnswerChange, onAnswerDraftChange, checks, draftLabel, onAskDraft, ...hooks }: { question: QuestionDetail; onAnswerChange: AnswerChange; onAnswerDraftChange: AnswerDraftChange; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void } & DraftHooks) {
  const confirmed = useConfirmedAnswer(question.id, question.answer ?? null, onAnswerChange);
  return <AnswerEditor question={question} confirmed={confirmed} onAnswerDraftChange={onAnswerDraftChange} checks={checks} draftLabel={draftLabel} onAskDraft={onAskDraft} {...hooks} />;
}

/** 답칸의 상태 — 어느 초안(key)을 담았나, 이 화면에서 답한 빈칸(local), 서버 문장에 저장 못 하는 맞아요(seen — 문장 글, FE#317).
 *  글 · local · seen 은 임시 글로 자동 저장한다(S-72 · FE#213). 문장 빼기는 글에서 지우는 것뿐이다 — 서버의 sentences[].removed 는 읽지 않는다(FE#337) */
type Box = { key: string | null; local: Record<number, string>; seen: Set<string>; sawDrafting: boolean };
const NONE = new Set<number>();
const later = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/** 임시 글 state 의 모양(FE 가 정한다 — 계약 question-api.md 「임시 글」). 다른 모양 · 다른 초안의 것이면 버린다 */
type SavedBox = { v: 1; draftKey: string | null; local: Record<number, string>; seen: string[] };
function readSavedBox(state: AnswerDraft["state"], draftKey: string | null): Pick<Box, "local" | "seen"> | null {
  const s = state as Partial<SavedBox> | null;
  if (!s || s.v !== 1 || s.draftKey !== draftKey || typeof s.local !== "object" || !s.local || !Array.isArray(s.seen)) return null;
  const local = Object.fromEntries(Object.entries(s.local).filter(([k, v]) => Number.isInteger(+k) && typeof v === "string").map(([k, v]) => [+k, v as string]));
  return { local, seen: new Set(s.seen.filter((x): x is string => typeof x === "string")) };
}

function AnswerEditor({ question, confirmed: a, onAnswerDraftChange, checks, draftLabel, onAskDraft, onAnswer, onRefresh, draftBusy, onTargetLength, trailing }: { question: QuestionDetail; confirmed: ReturnType<typeof useConfirmedAnswer>; onAnswerDraftChange: AnswerDraftChange; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void } & DraftHooks) {
  const questionId = question.id;
  const draft = question.draft ?? null;
  const ready = draft?.status === "COMPLETED" && draft.sentences.length > 0 ? draft : null;
  const draftKey = ready?.createdAt ?? null;
  // 새 초안이 다 쓴 답보다 나중이면 초안 글로 시작한다 — 다 쓴 답은 서버에 남고 「다 쓴 답 불러오기」로 돌아간다
  const fresh = !!ready && (!a.answer || later(ready.createdAt, a.answer.confirmedAt));
  // 임시 글(S-72)이 있으면 그 글로 시작한다 — 확정하면 지워지니 다 쓴 답보다 늘 새롭다. 그 뒤에 만든 초안이 있으면 초안이 이긴다
  const [start] = useState(() => {
    const saved = question.answerDraft ?? null;
    const restored = saved && !(ready && later(ready.createdAt, saved.updatedAt)) ? saved : null;
    const kept = restored ? readSavedBox(restored.state, draftKey) : null;
    const composed = ready ? composeDraft(question, ready, NONE, kept?.local ?? {}) : null;
    const text = restored ? restored.text : fresh && composed !== null ? composed : a.initialText;
    // 다른 화면에 있을 때 끝난 초안이 지금 답칸에 들어왔나 — 서버엔 아직 없는 글이라 한 번 저장해 DRAFT_OVERWRITE 를 남긴다(FE#401 · S-80)
    const placed = !restored && fresh && composed !== null && composed !== a.initialText ? composed : null;
    // 고친 글의 기준 — 다시 만들기 전 경고가 읽는다. 초안이 있으면 초안 글, 없으면 처음 글
    return { text, kept, base: composed ?? text ?? "", placed };
  });
  const initialText = start.text;
  const g = useGroundingCheck(questionId, checks, initialText);
  const [box, setBox] = useState<Box>(() => ({ key: draftKey, local: start.kept?.local ?? {}, seen: start.kept?.seen ?? new Set(), sawDrafting: false }));
  const [editBase, setEditBase] = useState(start.base);
  const [draftPlaced, setDraftPlaced] = useState<string | null>(start.placed);
  const [historyOpen, setHistoryOpen] = useState(false);
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
    setBox({ key: draftKey, local: {}, seen: new Set(), sawDrafting: false });
    setSelected(null);
    // 초안을 답칸에 넣은 글 — 그 자동 저장 한 번에 fromDraft 를 실어 수정 이력에 남긴다(S-80 · question-api.md)
    if (take) { const next = composeDraft(question, ready, NONE, {}); g.setText(next); setEditBase(next); setDraftPlaced(next); }
  }
  // 다 쓴 답은 지금 초안보다 나중일 때만 기준이다(FE#370) — 새 초안 문장은 옛 다 쓴 답과 달라 전부 「다 쓴 뒤 고친 문장」이 되기 때문.
  // 새 초안으로 다시 「다 썼어요」를 누르면 그때부터 기준
  const settled = a.answer && !(ready && !later(a.answer.confirmedAt, ready.createdAt)) ? a.answer.text : null;
  const analysis = useMemo(() => analyze(question, ready, NONE, box.local, box.seen, settled, text, g.check), [question, ready, box.local, box.seen, settled, text, g.check]);
  const latest = useRef(analysis);
  useEffect(() => { latest.current = analysis; });
  const target = question.targetLength ?? null;
  const marked = !!analysis.marks.length || !!analysis.own.length;
  const left = analysis?.checks.length ?? 0;
  const blanksLeft = analysis?.chips.length ?? 0;
  // 확인 전 AI 가정 · 그중 구체 값(specific) — 「확인할 곳」 옆에 따로 보이고, 복사 · 다 썼어요 때 한 번 알린다(막지 않음)
  const supposedLeft = analysis.marks.filter(m => m.need === "supposed");
  const specificLeft = supposedLeft.filter(m => ready?.sentences[m.index]?.specific).length;
  const warnFirst = blanksLeft > 0 || supposedLeft.length > 0;

  useEffect(() => { setEditedAnswer(questionId, edited); }, [questionId, edited]);
  // 자동 저장(S-72) — 글과 이 화면의 표시 상태(답한 빈칸 · 맞아요 문장 글)를 같이
  const savedBox: SavedBox = { v: 1, draftKey, local: box.local, seen: [...box.seen] };
  const autosave = useAnswerAutosave(questionId, { text, state: savedBox }, g.initialized, draft => onAnswerDraftChange(questionId, draft), draftPlaced, start.placed !== null);
  // 아직 저장하지 못한 글이 있으면 새로고침 · 닫기 전에 브라우저가 묻는다
  useEffect(() => {
    if (!autosave.unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosave.unsaved]);

  // 맞아요 — 고치지 않은 AI 보탬 · 생각은 서버에, 고친 문장 · 숫자 · 채운 빈칸 확인은 이 화면에서만(저장된 문장 글과 달라서)
  const confirm = async (mark: Mark) => {
    const sentence = ready?.sentences[mark.index];
    if (!sentence) return;
    if (!mark.edited && mark.need === "marked" && sentence.id != null) { await confirmDraftSentence(sentence.id); await onRefresh(); }
    else setBox(b => ({ ...b, seen: new Set(b.seen).add(mark.text) }));
    // 카드는 닫지 않는다 — 확인한 상태가 보이게(FE#325)
  };
  // AI 가정(S-79 · ADR-014) — 비슷했어요는 문장 그대로, 고치기는 고친 글을 짝 omitted 의 되묻기로 답해 경험의 보완으로 쌓는다.
  // 짝이 경험에 안 붙었으면 비슷했어요는 서버 맞아요, 고치기는 글만 바꾸고 이 화면에서 확인한 것으로 둔다
  const settleSupposed = async (mark: Mark, value: string | null) => {
    if (!ready) return;
    const sentence = ready.sentences[mark.index];
    const pair = pairOf(ready, mark.index);
    const answer = value ?? mark.text;
    if (pairLinked(pair) && pair.question != null) {
      await onAnswer(pair.clarificationId, answer);
      setBox(b => ({ ...b, local: { ...b.local, [pair.clarificationId]: answer } }));
    } else if (value === null && !mark.edited && sentence.id != null) { await confirmDraftSentence(sentence.id); await onRefresh(); }
    else setBox(b => ({ ...b, seen: new Set(b.seen).add(answer) }));
    if (value === null) return;
    // 기다리는 동안 글이 바뀌었을 수 있다 — 그 문장의 지금 자리를 바꾼다
    const now = latest.current.marks.find(m => m.index === mark.index);
    if (now) editor.current?.replace(now.start, now.end, value);
  };

  const loadConfirmed = () => {
    if (!a.answer) return;
    setAsk(null);
    g.setText(a.answer.text); setEditBase(a.answer.text); setSelected(null);
  };
  // 다 쓴 답을 불러온 뒤 초안 글로 돌아가는 길(FE#384) — 이 화면에서 답한 빈칸은 그대로 채워 넣는다
  const draftText = ready ? composeDraft(question, ready, NONE, box.local) : null;
  // 답칸이 초안 글이 아닌 다 쓴 답을 보이나 — 패널 안내가 읽는다. 초안 그대로 확정했으면 초안 글이기도 하다
  const confirmedNotDraft = !!a.answer && text === a.answer.text && draftText !== null && draftText !== text;
  // 비운 답칸도 알린다(FE#519) — 초안이 있는데 비어 있으면 패널이 「넣었어요」라고 하지 않는다. 초안 · 다 쓴 답이 없는 문항은 패널이 말할 거리가 없다
  const boxShows = confirmedNotDraft ? "confirmed" : ready && !text.trim() ? "empty" : null;
  useEffect(() => { setBoxShows(questionId, boxShows); }, [questionId, boxShows]);
  const loadDraft = () => {
    if (draftText === null) return;
    g.setText(draftText); setEditBase(draftText); setSelected(null);
  };
  // 수정 이력 창의 「다 쓴 답 불러오기」 · 「초안 글 다시 넣기」(FE#463)
  const canLoadConfirmed = !!a.answer && text !== a.answer.text;
  const copy = async () => {
    setAsk(null);
    try { await navigator.clipboard.writeText(text); showToast("답칸의 글을 복사했어요. 표시는 복사하지 않아요."); }
    catch { showToast("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.", true); }
  };
  // 되돌린 글을 답칸에 — 이 답칸의 「수정 이력」과 헤더 「최근 수정」(FE#401)이 같이 쓴다
  const applyRestore = (result: RestoreResult) => {
    if (!result.answerDraft) return;
    g.setText(result.answerDraft.text); setEditBase(result.answerDraft.text); setSelected(null);
    onAnswerDraftChange(questionId, result.answerDraft);
  };
  const isMine = (r: RestoreResult["revision"]) => r.targetType === "ANSWER" && r.targetId === questionId;
  useRestoreListener({
    before: r => isMine(r) ? autosave.retry() : undefined,
    restored: result => { if (!isMine(result.revision) || !result.answerDraft) return false; applyRestore(result); return true; },
  });
  // 「다 썼어요」 전에 기다리던 자동 저장을 버린다 — 늦게 도착하면 지운 임시 글이 되살아난다(계약)
  // 저장했다는 알림은 잠깐 떴다 사라진다 — 답칸 아래에 저장 줄을 두지 않는다(FE#543)
  const confirmAnswer = async () => { setAsk(null); await autosave.settle(); void a.confirm(text, () => { onAnswerDraftChange(questionId, null); showToast("다 쓴 답으로 저장했어요."); }); };

  const locked = a.busy || a.answer?.newFacts?.status === "ANALYZING";
  // 확정 답과 같은 글은 다시 확정하지 않는다 — 서버도 아무것도 바꾸지 않는다(ETC#266)
  const same = !!a.answer && text === a.answer.text;
  const analyzing = g.check?.status === "ANALYZING";
  // 0회면 분석을 다시 쓰는 「다시 시도」 · 「다시 찾기」를 막는다(FE#391)
  const exhausted = useAnalysisExhausted(1, g.busy || analyzing || a.busy);
  const valid = !!text.trim() && text.length <= MAX_GROUNDING_TEXT_LENGTH;
  const checkedSame = g.check?.status === "COMPLETED" && text === g.check.text;
  // 고친 사실 문장 — 그 글로 근거 점검을 안 했으면 다 썼어요 때 한 번 권한다(뜻이 바뀐 건 코드가 못 잡는다)
  const editedFacts = analysis?.marks.filter(m => m.edited && ready?.sentences[m.index].kind === "FACT").length ?? 0;
  const groundFirst = editedFacts > 0 && !(g.check?.status === "COMPLETED" && g.check.text === text);
  // 근거 점검은 필요할 때만(FE#336) — 손대지 않은 초안은 문장마다 근거가 이미 붙어 있다. 고친 사실 문장 · 초안 밖에서 직접 쓴 문장이 있거나 점검이 진행 · 실패 중일 때 보인다
  const ownText = splitSentences(text).some(p => p.text.trim() && !analysis.marks.some(m => m.start < p.end && p.start < m.end));
  const showGround = editedFacts > 0 || ownText || analyzing || g.busy || !!g.failure || g.check?.status === "FAILED";
  // 빈 답칸에는 잃을 글이 없으니 초안 글을 다시 넣을 수 있다(FE#519)
  const canLoadDraft = (confirmedNotDraft || (draftText !== null && !text.trim())) && !drafting;
  const copyAnswer = () => { if (warnFirst) setAsk("copy"); else void copy(); };
  const finish = () => { if (groundFirst) setAsk("ground"); else void confirmAnswer(); };
  return <>
    {/* 답칸 머리줄 한 줄(FE#336 · FE#463 · FE#543) — 왼쪽 글자 수 / 목표 · 구성 틀 줄(오른쪽 끝에 확인할 곳), 오른쪽 복사 · 수정 이력 · 문항 지우기. 제목은 두지 않는다(구역 이름은 aria-label) */}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">{text.length.toLocaleString()}자 /{" "}
        <TargetLengthField value={target} onSave={onTargetLength} />
        {marked && target !== null && text.length < target && <InfoTip label="목표 글자 수" align="end">자료에 있는 내용으로만 써서 목표보다 짧을 수 있어요. 빈칸 · 빠진 사실에 답하면 다음 초안이 길어져요.</InfoTip>}</span>
      {marked && <div id={`draft-title-${questionId}`} role="group" aria-label="답변 초안"
        // 좁은 폭은 글자 수 · 아이콘이 첫 줄, 구성 틀 줄이 둘째 줄을 통째로 쓴다 — 사이에 끼면 세 줄로 꺾인다
        className="order-last flex min-w-0 basis-full flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:order-none sm:basis-0 sm:flex-1">
        {ready && <DraftGuidance draft={ready} />}
        <span className="-ml-2 inline-flex items-center"><InfoTip label="차곡이 초안">차곡이 초안이에요. 바로 고쳐 쓰고, 밑줄 · 빈칸을 누르면 근거와 이유가 보여요. 최종 문장은 직접 정해요. 답칸에서 Alt + ↓ 를 누르면 다음 확인할 곳으로 가요.</InfoTip></span>
        {/* 확인할 곳은 부가 정보라 작게 — 구성 틀 줄의 오른쪽 끝, 남은 개수는 늘 보인다(FE#262 · FE#269 · FE#543). 사용법은 ⓘ 로 접는다 */}
        <span role="status" className={cn("ml-auto inline-flex items-center gap-1.5 text-note font-medium tabular-nums", left ? "text-review" : "text-evidence")}>
          {/* 숫자는 Alt + ↓ 가 도는 수와 같다 — AI 가정도 그 안에 센다(FE#381). 「AI 가정」은 답칸 표시처럼 물결 밑줄 — 그 자체가 범례다 */}
          {left > 0 ? <><span aria-hidden="true" className="size-1.5 rounded-full bg-review" /><span>확인할 곳 {left}군데</span>
            {supposedLeft.length > 0 && <span className="font-normal">· 그중 <span className="underline decoration-wavy decoration-review-line underline-offset-[3px]">AI 가정</span> {supposedLeft.length}</span>}</>
            : "모두 확인했어요 ✓"}
        </span>
      </div>}
      {/* 복사 · 수정 이력 · 문항 지우기 — 같은 줄, 같은 크기(FE#543) */}
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11 text-muted hover:text-ink lg:size-9" aria-label="답 복사" title="답 복사" disabled={!text.trim()} onClick={copyAnswer}><CopyIcon aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="size-11 text-muted hover:text-ink lg:size-9" aria-label="수정 이력" title="수정 이력" aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}><ClockCounterClockwiseIcon aria-hidden="true" /></Button>
        {trailing}
      </div>
      <RevisionDialog open={historyOpen} onOpenChange={setHistoryOpen} target={{ type: "ANSWER", id: questionId }} title="수정 이력"
        description="이 문항의 답을 「다 썼어요」 · 초안 넣기 · 되돌리기 때 남긴 기록이에요. 쓰는 중 자동 저장은 남지 않아요."
        // 지금 답칸 글 — 이 글과 같은 줄에는 되돌리기를 두지 않는다(자동 저장은 이력에 안 남아 맨 위 기록과 다를 수 있다)
        current={text}
        // 기다리던 자동 저장을 먼저 보낸다 — 늦게 도착해 되돌린 임시 글을 덮지 않게
        beforeRestore={() => autosave.retry()}
        onRestored={applyRestore}
        // 다 쓴 답 · 초안 글로 돌아가는 길은 여기 하나(FE#463) — 답칸 아래에 링크를 쌓지 않는다. 답칸에 글이 있으면 덮기 전에 묻는다(FE#384)
        actions={(canLoadConfirmed || canLoadDraft) && <>
          {canLoadConfirmed && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" onClick={() => { setHistoryOpen(false); if (text.trim()) setAsk("load"); else loadConfirmed(); }}>다 쓴 답 불러오기</Button>}
          {canLoadDraft && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" onClick={() => { setHistoryOpen(false); loadDraft(); }}>초안 글 다시 넣기</Button>}
        </>} />
    </div>
    {drafting && <p role="status" className="m-0 text-sm text-muted">차곡이가 초안을 만들고 있어요. 다 되면 답칸에 들어와요.</p>}
    {draft?.status === "FAILED" && !drafting && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 차곡이에서 다시 만들 수 있어요.</p>}
    <label htmlFor={`answer-${questionId}`} className="sr-only">내가 쓴 답</label>
    <div className="grid min-w-0 overflow-hidden rounded-md border border-hairline bg-canvas has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink">
      <DraftEditor handleRef={editor} inputId={`answer-${questionId}`} question={question} draft={ready} analysis={analysis} local={box.local}
        text={text} onText={g.setText} placeholder="여기에 답을 쓰거나, 차곡이에게 초안을 부탁해 보세요."
        disabled={g.loading || g.busy || analyzing || !g.initialized || locked} cardsDisabled={draftBusy || locked}
        selected={selected} onSelect={setSelected} onConfirm={confirm} onActorDecided={onRefresh} onSupposed={settleSupposed}
        onConfirmOwn={o => setBox(b => ({ ...b, seen: new Set(b.seen).add(o.text) }))}
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
            「분석 1회」는 분석을 쓰는 「근거 점검」 옆에만(S-15) — 「다 썼어요」는 저장만 하고(FE#270), 「초안 부탁하기」는 분석을 쓰지 않는다(FE#249) */}
        <div className="flex flex-wrap items-center gap-2">
          <SaveState status={autosave.status} onRetry={() => void autosave.retry()} />
          {/* 「다 썼어요」가 다시 켜지는 것이 신호 — 따로 안내 줄을 두지 않는다(FE#463) */}
          {a.answer && !same && <span role="status" className="text-xs text-muted">다 쓴 답과 달라요</span>}
          {/* 같은 글은 다시 점검하지 않는다 — 분석 1회를 아끼고 판정이 오락가락하지 않게(FE#317). 실패한 점검은 아래 「같은 글로 다시 시도」 */}
          {showGround && <><AnalysisButton variant="ghost" className="min-h-11 lg:min-h-10" running={g.busy || analyzing} title={checkedSame ? "이미 점검한 글이에요 — 고치면 다시 점검할 수 있어요" : undefined}
            disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || checkedSame} onClick={() => void g.submit(text)}>
            {g.busy || analyzing ? "근거 점검 중…" : checkedSame ? "점검했어요" : "근거 점검"}
          </AnalysisButton>
          {!checkedSame && <AnalysisCost running={g.busy || analyzing} className="-ml-1.5" />}</>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftLabel && <Button variant="secondary" className="min-h-11 lg:min-h-10" onClick={onAskDraft}>{draftLabel}</Button>}
          <Button className="min-h-11 lg:min-h-10" title={same ? "다 쓴 답과 같은 글이에요 — 고치면 다시 누를 수 있어요" : undefined}
            disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || locked || same} onClick={() => { if (warnFirst) setAsk("confirm"); else finish(); }}>{a.busy ? "처리 중…" : "다 썼어요"}</Button>
        </div>
      </div>
    </div>
    {autosave.status === "error" && <p role="alert" className="m-0 text-sm text-error">쓰는 글을 저장하지 못했어요. {autosave.error} 글은 이 화면에 그대로 있어요 — 「다시 저장」을 눌러 주세요.</p>}
    {a.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{a.failure.message}{a.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      {!a.failure.limit && <Button variant="secondary" className="min-h-11 lg:min-h-10" title={a.failure.action === "find" ? "분석 1회" : undefined} disabled={a.busy || (a.failure.action === "find" && exhausted)} onClick={() => void (a.failure?.action === "confirm" ? a.confirm(a.failure.text!, () => showToast("다 쓴 답으로 저장했어요.")) : a.failure?.action === "find" ? a.retryFind() : a.refresh())}>
        {a.failure.action === "confirm" ? "같은 답으로 다시 저장" : a.failure.action === "find" ? "다시 찾기" : "저장 상태 다시 확인"}
      </Button>}
    </div>}
    {g.loading && <p role="status" className="m-0 text-sm text-muted">마지막 근거 점검을 불러오고 있어요…</p>}
    {analyzing && <p role="status" className="m-0 text-sm text-muted">문장을 근거와 대조하고 있어요. 새로고침해도 점검한 글과 진행 상태를 이어서 확인해요.</p>}
    {g.failure && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.failure.message}{g.pollFailures >= 3 && " 자동 확인을 멈췄어요."}</p>
      {!g.failure.limit && <Button variant="secondary" className="min-h-11 lg:min-h-10" title={g.failure.retryText !== undefined ? "분석 1회" : undefined} disabled={g.busy || (g.failure.retryText !== undefined && exhausted)} onClick={() => void (g.failure?.retryText !== undefined ? g.submit(g.failure.retryText) : g.refresh())}>
        {g.failure.retryText !== undefined ? "같은 글로 다시 시도" : "점검 상태 다시 확인"}
      </Button>}
    </div>}
    {g.check?.status === "FAILED" && g.failure?.retryText === undefined && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{g.check.error?.message || "근거 점검을 마치지 못했어요."} 점검할 글은 저장돼 있어요.</p>
      <Button variant="secondary" className="min-h-11 lg:min-h-10" title="분석 1회" disabled={g.busy || exhausted} onClick={() => void g.submit(g.check!.text)}>같은 글로 다시 시도</Button>
    </div>}
    {/* 점검 결과는 답칸 문장 표시 · 카드에만 붙는다 — 답칸 아래 목록은 두지 않는다(FE#307 · FE#336). 근거 없음은 「확인할 곳」이 센다 */}
    <Dialog open={ask !== null} onOpenChange={o => { if (!o) setAsk(null); }}>
      <DialogContent>
        {ask === "ground" ? <>
          <DialogTitle>고친 사실 문장 {editedFacts}개가 있어요</DialogTitle>
          <DialogDescription>고친 내용이 근거와 맞는지는 「근거 점검」(분석 1회)으로 볼 수 있어요.</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => { setAsk(null); void g.submit(text); }}>근거 점검하기</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={() => void confirmAnswer()}>그냥 다 썼어요</Button>
          </DialogFooter>
        </> : ask === "load" ? <>
          <DialogTitle>다 쓴 답을 불러올까요?</DialogTitle>
          <DialogDescription>{edited ? "지금 답칸에서 고친 글은 다 쓴 답으로 바뀌어요." : "지금 답칸의 초안 글은 다 쓴 답으로 바뀌어요."}{draftText !== null && " 초안 글은 「초안 글 다시 넣기」로 다시 넣을 수 있어요."}</DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => setAsk(null)}>취소</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={loadConfirmed}>불러오기</Button>
          </DialogFooter>
        </> : supposedLeft.length > 0 ? <>
          {/* AI 가정이 남았으면 한 번 알린다 — 막지 않는다(S-79 · ADR-014). 빈칸도 남았으면 한 줄 더 */}
          <DialogTitle>AI 가정 {supposedLeft.length}곳{specificLeft ? ` · 구체 값 ${specificLeft}곳` : ""}이 확인 전이에요</DialogTitle>
          <DialogDescription>
            회색 문장은 자료에 없어 차곡이가 그럴 법하게 쓴 것이에요. {ask === "copy" ? "그대로 복사하면 확인하지 않은 문장이 글에 남아요." : "그대로 저장하면 확인하지 않은 문장이 답에 남아요."}
            {blanksLeft > 0 && ` 빈칸 ${blanksLeft}개도 남았어요.`}
          </DialogDescription>
          <DialogFooter>
            <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => { setAsk(null); editor.current?.next(); }}>확인하러 가기</Button>
            <Button className="min-h-11 lg:min-h-10" onClick={() => { if (ask === "copy") void copy(); else finish(); }}>그대로 둘게요</Button>
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

/** 답칸 줄의 자동 저장 상태(S-72) — 저장 중 · 저장됨 · 실패면 다시 저장 */
function SaveState({ status, onRetry }: { status: ReturnType<typeof useAnswerAutosave>["status"]; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "error") return <Button variant="ghost" size="sm" className="min-h-11 lg:min-h-10 text-error" onClick={onRetry}>다시 저장</Button>;
  return <span role="status" className="text-xs text-muted">{status === "saved" ? "저장됨" : "저장 중…"}</span>;
}
