"use client";

import { useState } from "react";
import { useConfirmedAnswer } from "./use-confirmed-answer";
import { NewFactCandidates } from "./new-fact-candidates";
import { Button } from "@/components/ui/button";
import { MAX_GROUNDING_TEXT_LENGTH, type GroundingStatus } from "@/lib/api/question-types";
import { AnswerEvidence } from "./answer-evidence";
import { useGroundingCheck } from "./use-grounding-check";

const LABEL: Record<GroundingStatus, string> = { SOURCE: "원문", USER_INPUT: "내가 입력", UNSUPPORTED: "근거 없음", OPINION: "생각 · AI 해석" };
const TINT: Record<GroundingStatus, string> = { SOURCE: "bg-evidence-soft", USER_INPUT: "bg-primary-soft", UNSUPPORTED: "bg-review-soft", OPINION: "" };

/** 내가 쓴 답(S-45 · S-48): 확정 답 복원 뒤 근거 점검을 독립적으로 읽는다. */
export function AnswerInput({ questionId }: { questionId: number }) {
  const confirmed = useConfirmedAnswer(questionId);
  return <section aria-labelledby={`answer-title-${questionId}`} className="mb-8 grid min-w-0 gap-4 border-b border-hairline pb-6">
    <h3 id={`answer-title-${questionId}`} className="m-0 text-[17px] font-semibold">내가 쓴 답</h3>
    {!confirmed.ready && !confirmed.failure && <p role="status" className="m-0 text-sm text-muted">확정한 답을 불러오고 있어요…</p>}
    {confirmed.ready && <AnswerEditor questionId={questionId} confirmed={confirmed} />}
    <NewFactCandidates confirmed={confirmed} />
  </section>;
}

function AnswerEditor({ questionId, confirmed: a }: { questionId: number; confirmed: ReturnType<typeof useConfirmedAnswer> }) {
  const [initialText] = useState(a.initialText);
  const g = useGroundingCheck(questionId, initialText);
  const locked = a.busy || a.answer?.newFacts?.status === "ANALYZING";
  const analyzing = g.check?.status === "ANALYZING";
  const valid = !!g.text.trim() && g.text.length <= MAX_GROUNDING_TEXT_LENGTH;
  const stale = g.check?.status === "COMPLETED" && g.text !== g.check.text;
  return <>
    <p id={`answer-help-${questionId}`} className="m-0 text-sm leading-relaxed text-muted">답을 쓰거나 붙여 넣어 주세요. 내 경험 전체에서 문장을 받치는 근거를 찾아요. 근거 점검과 확정 뒤 새 경험 후보 찾기는 각각 분석 1회로 세어요. 답 확정 자체는 분석 횟수를 쓰지 않아요.</p>
    <label htmlFor={`answer-${questionId}`} className="sr-only">내가 쓴 답</label>
    <textarea id={`answer-${questionId}`} aria-describedby={`answer-help-${questionId}`} rows={8}
      maxLength={MAX_GROUNDING_TEXT_LENGTH} value={g.text} disabled={g.loading || g.busy || analyzing || !g.initialized || locked}
      placeholder="지원 문항에 맞춰 내 답을 적어 주세요."
      onChange={e => g.setText(e.target.value)}
      className="w-full min-w-0 resize-y rounded-sm border border-hairline bg-canvas p-4 text-[15px] leading-relaxed disabled:bg-surface-soft" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted tabular-nums">{g.text.length.toLocaleString()} / 5,000자</span>
      <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className="min-h-11" disabled={!valid || g.loading || g.busy || analyzing || !g.initialized} onClick={() => void g.submit(g.text)}>
        {g.busy || analyzing ? "근거 점검 중…" : "근거 점검"}
      </Button>
      <Button disabled={!valid || g.loading || g.busy || analyzing || !g.initialized || locked} onClick={() => void a.confirm(g.text)}>{a.busy ? "처리 중…" : "확정"}</Button>
      </div>
    </div>
    {a.answer && <p role="status" className="m-0 text-sm text-muted">{g.text === a.answer.text ? "답을 확정했어요" : "확정한 글과 달라요 · 다시 확정해 주세요"}</p>}
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
