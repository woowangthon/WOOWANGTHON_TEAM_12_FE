"use client";

import { useState } from "react";
import { useConfirmedAnswer } from "./use-confirmed-answer";
import { NewFactCandidates } from "./new-fact-candidates";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { MAX_GROUNDING_TEXT_LENGTH, type Answer, type GroundingStatus, type QuestionDetail } from "@/lib/api/question-types";
import { AnswerEvidence } from "./answer-evidence";
import { useGroundingCheck, type GroundingChecks } from "./use-grounding-check";

const LABEL: Record<GroundingStatus, string> = { SOURCE: "원문", USER_INPUT: "내가 입력", UNSUPPORTED: "근거 없음", OPINION: "생각 · AI 해석" };
const TINT: Record<GroundingStatus, string> = { SOURCE: "bg-evidence-soft", USER_INPUT: "bg-primary-soft", UNSUPPORTED: "bg-review-soft", OPINION: "" };

type AnswerChange = (id: number, answer: Answer | null) => void;

/** 내가 쓴 답(S-45 · S-48): 받아 둔 문항의 확정 답으로 시작하고, 근거 점검은 독립적으로 읽는다. 문항을 못 받았으면 화면의 「다시 불러오기」를 쓴다 */
export function AnswerInput({ questionId, question, loadFailed, onAnswerChange, checks, onAskDraft }: { questionId: number; question: QuestionDetail | null; loadFailed: boolean; onAnswerChange: AnswerChange; checks: GroundingChecks; onAskDraft: () => void }) {
  return <section aria-labelledby={`answer-title-${questionId}`} className="mb-8 grid min-w-0 gap-3">
    <h3 id={`answer-title-${questionId}`} className="m-0 text-[17px] font-semibold">내가 쓴 답</h3>
    {question ? <LoadedAnswer questionId={questionId} saved={question.answer ?? null} onAnswerChange={onAnswerChange} checks={checks} draftLabel={question.status === "ANALYZING" || question.status === "FAILED" ? null : question.draft ? "초안 설정 열기" : "초안 부탁하기"} onAskDraft={onAskDraft} />
      : !loadFailed && <p role="status" className="m-0 text-sm text-muted">쓴 답을 불러오고 있어요…</p>}
  </section>;
}

function LoadedAnswer({ questionId, saved, onAnswerChange, checks, draftLabel, onAskDraft }: { questionId: number; saved: Answer | null; onAnswerChange: AnswerChange; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void }) {
  const confirmed = useConfirmedAnswer(questionId, saved, onAnswerChange);
  return <>
    <AnswerEditor questionId={questionId} confirmed={confirmed} checks={checks} draftLabel={draftLabel} onAskDraft={onAskDraft} />
    <NewFactCandidates confirmed={confirmed} />
  </>;
}

function AnswerEditor({ questionId, confirmed: a, checks, draftLabel, onAskDraft }: { questionId: number; confirmed: ReturnType<typeof useConfirmedAnswer>; checks: GroundingChecks; draftLabel: string | null; onAskDraft: () => void }) {
  const [initialText] = useState(a.initialText);
  const g = useGroundingCheck(questionId, checks, initialText);
  const locked = a.busy || a.answer?.newFacts?.status === "ANALYZING";
  const analyzing = g.check?.status === "ANALYZING";
  const valid = !!g.text.trim() && g.text.length <= MAX_GROUNDING_TEXT_LENGTH;
  const stale = g.check?.status === "COMPLETED" && g.text !== g.check.text;
  return <>
    <label htmlFor={`answer-${questionId}`} className="sr-only">내가 쓴 답</label>
    <div className="grid min-w-0 overflow-hidden rounded-[18px] border border-hairline bg-canvas has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink">
    <textarea id={`answer-${questionId}`} rows={8}
      maxLength={MAX_GROUNDING_TEXT_LENGTH} value={g.text} disabled={g.loading || g.busy || analyzing || !g.initialized || locked}
      placeholder="여기에 답을 쓰거나, 차곡이에게 초안을 부탁해 보세요."
      onChange={e => g.setText(e.target.value)}
      className="block w-full min-w-0 resize-y border-0 bg-transparent p-5 text-[15px] leading-relaxed outline-none focus-visible:outline-none disabled:bg-surface-soft" />
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft px-3.5 py-2.5">
      {/* 왼쪽은 글을 살피는 일, 오른쪽은 다음 행동 — 초안 부탁을 더 많이 쓴다(FE#215). 「다 썼어요」가 줄 끝이다. 「분석 1회」는 줄에 한 번, 오른쪽 묶음 앞에(S-15) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted tabular-nums">{g.text.length.toLocaleString()} / 5,000자</span>
        <Button variant="ghost" className="min-h-11" title="분석 1회를 써요" disabled={!valid || g.loading || g.busy || analyzing || !g.initialized} onClick={() => void g.submit(g.text)}>
          {g.busy || analyzing ? "근거 점검 중…" : "근거 점검"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisCost running={g.busy || analyzing || locked} />
        {draftLabel && <Button variant="secondary" className="min-h-11" onClick={onAskDraft}>{draftLabel}</Button>}
        <Button disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || locked} onClick={() => void a.confirm(g.text)}>{a.busy ? "처리 중…" : "다 썼어요"}</Button>
      </div>
    </div>
    </div>
    {a.answer && <p role="status" className="m-0 text-sm text-muted">{g.text === a.answer.text ? "다 쓴 답으로 저장했어요" : "고친 내용이 있어요 · 「다 썼어요」를 다시 눌러 주세요"}</p>}
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
      <p className="m-0 text-xs leading-relaxed text-muted">근거 없음은 현재 자료에서 받칠 근거를 찾지 못했다는 뜻이에요. 거짓이라는 뜻은 아니에요. 판정과 이유는 AI 해석이니 직접 확인해 주세요.</p>
      <ol aria-label={stale ? "고치기 전 문장별 근거" : "문장별 근거"} className="m-0 grid list-none gap-4 p-0">
        {g.check.sentences.map((s, i) => <li key={i} className="grid min-w-0 gap-2">
          <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-loose"><span className={`${TINT[s.status]} rounded-sm px-1 py-0.5`}>{s.text}</span></p>
          <p className={`m-0 text-xs font-semibold ${s.status === "UNSUPPORTED" ? "text-review" : "text-muted"}`}>{LABEL[s.status]}</p>
          {s.status === "UNSUPPORTED" && <p className="m-0 text-sm text-review">지우거나, 사실이면 근거를 더해 주세요.</p>}
          {s.note && <p className="m-0 text-sm text-muted">AI 해석 — {s.note}</p>}
          {s.evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={questionId} />)}
          {(s.status === "SOURCE" || s.status === "USER_INPUT") && !s.evidence.length && <p className="m-0 text-sm text-muted">연결된 근거가 지금은 없어요. 판정은 점검했을 때 그대로이니 다시 점검해 주세요.</p>}
        </li>)}
      </ol>
    </div>}
  </>;
}
