"use client";

import { useRef, useState } from "react";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { suggestedFrame, type DraftFrame } from "@/lib/draft-frames";
import type { QuestionDetail } from "@/lib/api/question-types";
import { FramePicker } from "./draft-guidance";
import { ActivityChip } from "./question-result";
import { requestError, failureReason } from "./draft-errors";
import type { DraftActions } from "./answer-draft";

/** 시안 6 mateFeed: 초안 요청은 차곡이 안에서, 결과는 왼쪽에서 확인한다. */
export function DraftComposer({ question, onGenerate, onRefresh, savingAnswer, requestingDraft }: { question: QuestionDetail } & Pick<DraftActions, "onGenerate" | "onRefresh" | "savingAnswer" | "requestingDraft">) {
  const [selected, setSelected] = useState(() => question.draft ? question.draft.experienceIds : question.recommendations.slice(0, 3).map(r => r.experience.id));
  const [selectionChanged, setSelectionChanged] = useState(false);
  const draft = question.draft ?? null;
  const [chosenFrame, setChosenFrame] = useState<DraftFrame | null>(null);
  const frame = chosenFrame ?? (draft ? draft.frame ?? 'NONE' : suggestedFrame(question.questionType));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const pending = useRef(false);

  const analyzing = busy || requestingDraft || draft?.status === "ANALYZING";
  const ids = draft && !selectionChanged ? draft.experienceIds : selected;
  const allowed = ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length && ids.every(id => question.recommendations.some(r => r.experience.id === id));
  const generate = async () => {
    if (pending.current || savingAnswer || analyzing || !allowed) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      // 실패 재시도는 저장된 experienceIds로 같은 POST. 새 선택은 완료 뒤 재생성에 사용한다.
      await onGenerate(ids, frame);
      setChosenFrame(null);
      setSelectionChanged(false);
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
    <p className="m-0 text-xs leading-relaxed text-muted">경험을 1 ~ 3개 골라 주세요. 만든 문장은 답변 초안에서 근거와 함께 확인할 수 있어요.</p>
    {draft?.status === "COMPLETED" && <p className="m-0 text-xs leading-relaxed text-muted">다시 만들면 고른 경험과 최신 보완으로 다시 써요.</p>}
    <fieldset disabled={analyzing || savingAnswer} className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold">초안에 쓸 경험 · {selected.filter(id => question.recommendations.some(r => r.experience.id === id)).length}개 선택</legend>
      {question.recommendations.map(r => <label key={r.experience.id} className="flex min-w-0 items-start gap-3 rounded-sm bg-surface-soft p-3 text-sm leading-relaxed">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={selected.includes(r.experience.id)}
          disabled={!selected.includes(r.experience.id) && selected.length >= 3}
          onChange={e => { setSelectionChanged(true); setError(null); setSelected(ids => (e.target.checked ? [...ids, r.experience.id] : ids.filter(id => id !== r.experience.id)).filter(id => question.recommendations.some(r => r.experience.id === id))); }} />
        <span className="grid min-w-0 gap-1 break-words"><ActivityChip name={r.activity.name} />{r.experience.content}</span>
      </label>)}
      {!question.recommendations.length && <p className="m-0 text-sm text-muted">추천된 경험이 있으면 초안을 만들 수 있어요.</p>}
    </fieldset>
    <FramePicker frame={frame} disabled={analyzing || savingAnswer} proposed={!draft && chosenFrame === null} onChange={setChosenFrame} />
    <div className="flex flex-wrap items-center gap-3">
      <Button className="min-h-11" onClick={() => void generate()} disabled={!allowed || analyzing || savingAnswer}>{analyzing ? "초안 만드는 중…" : draft ? "다시 만들기" : "초안 만들기"}</Button>
      <AnalysisCost running={analyzing} />
    </div>
    {analyzing && <p className="m-0 text-sm text-muted">고른 경험으로 초안을 만드는 중이에요…</p>}
    {error && (error.code !== "DRAFT_IN_PROGRESS" || analyzing) && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{error.text}</p>
      <Button variant="secondary" className="min-h-11" disabled={busy || savingAnswer} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
    {draft?.status === "FAILED" && !analyzing && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 「다시 만들기」로 같은 경험을 다시 요청할 수 있어요.</p>}

  </section>;
}
