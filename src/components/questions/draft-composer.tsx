"use client";

import { useRef, useState } from "react";
import { AnalysisButton, AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { suggestedFrame, type DraftFrame } from "@/lib/draft-frames";
import { MAX_DRAFT_EXPERIENCES, type QuestionDetail } from "@/lib/api/question-types";
import { groupByActivity } from "./use-draft-picks";
import { FramePicker } from "./draft-guidance";
import { requestError, failureReason } from "./draft-errors";
import type { DraftActions } from "./answer-draft";
import { hasEditedAnswer } from "./answer-box-state";

/** 시안 6 mateFeed: 경험은 참고 카드에서 고르고, 틀을 정해 여기서 부탁한다. 결과는 왼쪽에서 확인한다. */
export function DraftComposer({ question, onGenerate, onRefresh, savingAnswer, requestingDraft, picks, onResetPicks }: { question: QuestionDetail } & Pick<DraftActions, "onGenerate" | "onRefresh" | "savingAnswer" | "requestingDraft" | "picks" | "onResetPicks">) {
  const draft = question.draft ?? null;
  const [chosenFrame, setChosenFrame] = useState<DraftFrame | null>(null);
  const suggested = suggestedFrame(question.questionType);
  const frame = chosenFrame ?? (draft ? draft.frame ?? 'NONE' : suggested);
  const [busy, setBusy] = useState(false);
  // 「초안 상태 확인」은 상태만 읽는다 — 만들기 버튼 글자(「초안 만드는 중…」)를 바꾸지 않게 따로 둔다(FE#391)
  const [checking, setChecking] = useState(false);
  // 다시 만들기 전 경고 — 덮이는 것이 있을 때만(고친 글 · 답하지 않은 빠진 사실 질문 · 다 쓴 답)
  const [warning, setWarning] = useState<string[] | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const pending = useRef(false);

  const analyzing = busy || requestingDraft || draft?.status === "ANALYZING";
  const ids = picks;
  const count = ids.filter(id => question.recommendations.some(r => r.experience.id === id)).length;
  const activities = groupByActivity(question.recommendations.filter(r => ids.includes(r.experience.id))).length;
  const allowed = ids.length >= 1 && ids.length <= MAX_DRAFT_EXPERIENCES && new Set(ids).size === ids.length && ids.every(id => question.recommendations.some(r => r.experience.id === id));
  // 확인 전인 외부 AI 답은 BE 가 초안 근거에서 뺀다(S-56) — 고른 경험(안 골랐으면 추천 전체)에 있으면 미리 알린다
  const scope = count ? question.recommendations.filter(r => ids.includes(r.experience.id)) : question.recommendations;
  const pendingAnswers = scope.reduce((n, r) => n + r.experience.supplements.filter(s => s.mcpChange).length, 0);
  // 다시 만들기가 무료인지는 BE 가 정한다(freeRegenerate — 빠진 사실에 답함 · 주체를 정함, S-77)
  const free = !!draft?.freeRegenerate && !analyzing;
  const losses = () => {
    if (!draft) return hasEditedAnswer(question.id) ? ["답칸에 쓴 글이 새 초안으로 바뀌어요."] : [];
    const open = draft.status === "COMPLETED" ? draft.omitted.filter(o => o.clarificationId !== null && o.supplementId === null).length : 0;
    return [
      ...(hasEditedAnswer(question.id) ? ["답칸에서 고친 글이 새 초안으로 바뀌어요."] : []),
      ...(open ? [`답하지 않은 빠진 사실 질문 ${open}개가 사라져요. 새 초안이 필요한 것을 다시 물어요.`] : []),
      ...(question.answer ? ["다 쓴 답은 저장돼 있어요 — 답칸 아래 「다 쓴 답 불러오기」로 돌아갈 수 있어요."] : []),
    ];
  };
  const ask = () => {
    if (pending.current || savingAnswer || analyzing || !allowed) return;
    const list = losses();
    if (list.length) setWarning(list); else void generate();
  };
  const generate = async () => {
    setWarning(null);
    if (pending.current || savingAnswer || analyzing || !allowed) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      // 실패 재시도는 저장된 experienceIds로 같은 POST. 새 선택은 완료 뒤 재생성에 사용한다.
      // 같은 활동의 다른 경험은 늘 재료로 싣는다 — 토글 · 재료 부족 경고는 뺐다(S-75 · S-77 · ADR-014)
      await onGenerate(ids, frame, true);
      setChosenFrame(null);
      onResetPicks(question.id);
    } catch (e) { setError({ text: requestError(e, !!draft), code: e instanceof ApiError ? e.code : undefined }); }
    finally { pending.current = false; setBusy(false); }
  };
  const refresh = async () => {
    if (pending.current || savingAnswer) return;
    pending.current = true; setChecking(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError({ text: requestError(e, !!draft) }); }
    finally { pending.current = false; setChecking(false); }
  };

  return <section aria-label="초안 설정" className="grid min-w-0 gap-3 rounded-md border border-hairline bg-canvas p-3.5">
    {/* 늘 펼쳐 둘 안내는 아니라 ⓘ 로 접는다(FE#269). 재료 부족 · 확인 전 답처럼 조건이 생길 때만 뜨는 경고는 그대로 펼친다 */}
    <div className="flex items-center gap-0.5">
      <h4 className="m-0 text-sm font-semibold">{draft ? "초안 다시 만들기" : "초안 만들기"}</h4>
      <InfoTip label={draft ? "초안 다시 만들기" : "초안 만들기"}>
        체크한 활동의 추천 줄{draft ? "과 최신 보완" : ""}을 뼈대로, 같은 활동의 기록으로 맥락을 채워요. 자료에 없는 장면은 회색 「AI 가정」으로 써서 확인을 받아요.
      </InfoTip>
    </div>
    <p className="m-0 text-sm text-body">{!question.recommendations.length ? "추천된 경험이 있으면 초안을 만들 수 있어요." : count ? `체크한 활동 ${activities}개로 만들어요` : "참고 카드에서 활동을 하나 이상 체크해 주세요."}</p>
    {pendingAnswers > 0 && <p className="m-0 text-note leading-relaxed text-muted">
      외부 AI 를 거친 답 {pendingAnswers}개는 아직 확인 전이라 초안 근거로 쓰이지 않아요. 활동 세부에서 맞아요를 눌러야 근거로 쓰여요.
    </p>}
    <FramePicker frame={frame} suggested={suggested} disabled={analyzing || savingAnswer} proposed={!draft && chosenFrame === null} onChange={setChosenFrame} />
    <div className="flex flex-wrap items-center gap-3">
      {free
        ? <Button data-draft-generate className="min-h-11 lg:min-h-10" onClick={ask} disabled={!allowed || checking || savingAnswer}>다시 만들기</Button>
        : <AnalysisButton data-draft-generate className="min-h-11 lg:min-h-10" running={analyzing} onClick={ask} disabled={!allowed || analyzing || checking || savingAnswer}>{analyzing ? "초안 만드는 중…" : draft ? "다시 만들기" : "초안 만들기"}</AnalysisButton>}
      {free ? <span className="text-xs text-muted">이번 다시 만들기는 분석 횟수를 쓰지 않아요</span> : <AnalysisCost running={analyzing} />}
    </div>
    {error && (error.code !== "DRAFT_IN_PROGRESS" || analyzing) && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{error.text}</p>
      {/* 한도를 다 썼으면 서버에서 확인할 상태가 없다(FE#391) */}
      {error.code !== "DAILY_LIMIT_EXCEEDED" && <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={busy || checking || savingAnswer} onClick={() => void refresh()}>{checking ? "확인하는 중…" : "초안 상태 확인"}</Button>}
    </div>}
    {draft?.status === "FAILED" && !analyzing && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 「다시 만들기」로 같은 경험을 다시 요청할 수 있어요.</p>}
    <Dialog open={warning !== null} onOpenChange={o => { if (!o) setWarning(null); }}>
      <DialogContent>
        <DialogTitle>{draft ? "다시 만들면 답칸이 새 초안으로 바뀌어요" : "초안을 만들면 답칸이 초안으로 바뀌어요"}</DialogTitle>
        <DialogDescription asChild><ul className="m-0 grid gap-1.5 pl-4">{warning?.map(w => <li key={w}>{w}</li>)}</ul></DialogDescription>
        <DialogFooter>
          <Button className="min-h-11 lg:min-h-10" variant="secondary" onClick={() => setWarning(null)}>취소</Button>
          <Button className="min-h-11 lg:min-h-10" onClick={() => void generate()}>{draft ? "그래도 다시 만들기" : "그래도 만들기"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </section>;
}
