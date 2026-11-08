"use client";

import { useRef, useState } from "react";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { suggestedFrame, type DraftFrame } from "@/lib/draft-frames";
import type { QuestionDetail } from "@/lib/api/question-types";
import { FramePicker } from "./draft-guidance";
import { requestError, failureReason } from "./draft-errors";
import type { DraftActions } from "./answer-draft";

/** 시안 6 mateFeed: 경험은 참고 카드에서 고르고, 틀을 정해 여기서 부탁한다. 결과는 왼쪽에서 확인한다. */
export function DraftComposer({ question, onGenerate, onRefresh, savingAnswer, requestingDraft, picks, onResetPicks }: { question: QuestionDetail } & Pick<DraftActions, "onGenerate" | "onRefresh" | "savingAnswer" | "requestingDraft" | "picks" | "onResetPicks">) {
  const draft = question.draft ?? null;
  const [chosenFrame, setChosenFrame] = useState<DraftFrame | null>(null);
  const frame = chosenFrame ?? (draft ? draft.frame ?? 'NONE' : suggestedFrame(question.questionType));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const pending = useRef(false);

  const analyzing = busy || requestingDraft || draft?.status === "ANALYZING";
  const ids = picks;
  const count = ids.filter(id => question.recommendations.some(r => r.experience.id === id)).length;
  const allowed = ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length && ids.every(id => question.recommendations.some(r => r.experience.id === id));
  // 확인 전인 외부 AI 답은 BE 가 초안 근거에서 뺀다(S-56) — 고른 경험(안 골랐으면 추천 전체)에 있으면 미리 알린다
  const scope = count ? question.recommendations.filter(r => ids.includes(r.experience.id)) : question.recommendations;
  const pendingAnswers = scope.reduce((n, r) => n + r.experience.supplements.filter(s => s.mcpChange).length, 0);
  // 재료 부족(S-77) — 고른 경험에서 초안이 받칠 수 있는 글(원문 확인된 발췌 · 확인된 보완 답 · 내가 입력한 본문)이 목표의 절반이 안 되면 알리되 막지 않는다.
  // 같은 활동의 보조 재료(S-75)는 BE 가 고르니 여기서 세지 않는다 — 실제 초안은 이보다 길 수 있다
  const target = question.targetLength ?? null;
  const material = question.recommendations.filter(r => ids.includes(r.experience.id)).reduce((n, { experience: e }) => n
    + e.citations.filter(c => c.matched === true).reduce((m, c) => m + c.quote.length, 0)
    + (e.supplements ?? []).filter(s => !s.mcpChange).reduce((m, s) => m + s.answer.length, 0)
    + (e.sourceStatus === "USER_ENTERED" ? e.content.length : 0), 0);
  const thin = target !== null && count > 0 && material < target / 2;
  // 다시 만들기가 무료인지는 BE 가 정한다(freeRegenerate — 빠진 사실에 답함 · 주체를 정함, S-77)
  const free = !!draft?.freeRegenerate && !analyzing;
  const generate = async () => {
    if (pending.current || savingAnswer || analyzing || !allowed) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      // 실패 재시도는 저장된 experienceIds로 같은 POST. 새 선택은 완료 뒤 재생성에 사용한다.
      await onGenerate(ids, frame);
      setChosenFrame(null);
      onResetPicks(question.id);
    } catch (e) { setError({ text: requestError(e), code: e instanceof ApiError ? e.code : undefined }); }
    finally { pending.current = false; setBusy(false); }
  };
  const refresh = async () => {
    if (pending.current || savingAnswer) return;
    pending.current = true; setBusy(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError({ text: requestError(e) }); }
    finally { pending.current = false; setBusy(false); }
  };

  return <section aria-label="초안 설정" className="grid min-w-0 gap-3 rounded-md border border-hairline bg-canvas p-3.5">
    <h4 className="m-0 text-sm font-semibold">{draft ? "초안 다시 만들기" : "초안 만들기"}</h4>
    {draft?.status === "COMPLETED" && <p className="m-0 text-note leading-relaxed text-muted">다시 만들면 고른 경험과 최신 보완으로 다시 써요.</p>}
    <p className="m-0 text-sm text-body">{!question.recommendations.length ? "추천된 경험이 있으면 초안을 만들 수 있어요." : count ? `체크한 경험 ${count}개로 만들어요` : "참고 카드에서 경험을 1 ~ 3개 골라 주세요."}</p>
    {thin && <p className="m-0 text-note leading-relaxed text-muted">
      고른 경험의 자료가 목표 {target!.toLocaleString("ko-KR")}자의 절반이 안 돼요. 초안이 짧을 수 있어요 — 같은 활동의 다른 경험도 재료로 쓰고, 빠진 사실에 답하면 다음 초안이 길어져요.
    </p>}
    {pendingAnswers > 0 && <p className="m-0 text-note leading-relaxed text-muted">
      외부 AI 를 거친 답 {pendingAnswers}개는 아직 확인 전이라 초안 근거로 쓰이지 않아요. 활동 세부에서 맞아요를 눌러야 근거로 쓰여요.
    </p>}
    <FramePicker frame={frame} disabled={analyzing || savingAnswer} proposed={!draft && chosenFrame === null} onChange={setChosenFrame} />
    <div className="flex flex-wrap items-center gap-3">
      <Button data-draft-generate className="min-h-11" onClick={() => void generate()} disabled={!allowed || analyzing || savingAnswer}>{analyzing ? "초안 만드는 중…" : draft ? "다시 만들기" : "초안 만들기"}</Button>
      {free ? <span className="text-xs text-muted">이번 다시 만들기는 분석 횟수를 쓰지 않아요</span> : <AnalysisCost running={analyzing} />}
    </div>
    {error && (error.code !== "DRAFT_IN_PROGRESS" || analyzing) && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{error.text}</p>
      <Button variant="secondary" className="min-h-11" disabled={busy || savingAnswer} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
    {draft?.status === "FAILED" && !analyzing && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 「다시 만들기」로 같은 경험을 다시 요청할 수 있어요.</p>}

  </section>;
}
