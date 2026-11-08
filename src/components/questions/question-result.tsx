import Link from "next/link";
import { CaretRightIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { CitationList } from "@/components/experience/citation-list";
import { McpAnswerLabel, UserEnteredLabel } from "@/components/experience/supplement-list";
import type { QuestionDetail, Recommendation } from "@/lib/api/question-types";
import type { OverlapUse } from "./overlap";
import { useActivityCategory } from "./activity-categories";
import type { DraftActions } from "./answer-draft";

/** 「바꿔요 — 캠퍼스 중고거래 앱」 → 「바꿔요」 (시안의 활동 칩) */
export const shortName = (name: string) => name.split(" — ")[0];

/** 활동 칩 — 분류색(S-57). onTint — 회색 카드 위(흰 칩), 아니면 흰 바탕 위(분류색 칩). 색은 칩에만 쓴다(시안 6 .act-chip) */
export function ActivityChip({ name, onTint = false }: { name: string; onTint?: boolean }) {
  return <span data-category={useActivityCategory(name)} className={`inline-flex justify-self-start rounded-full px-2.5 py-px text-xs font-semibold whitespace-nowrap text-category-ink ${onTint ? "bg-canvas/85" : "bg-category-soft"}`}>{shortName(name)}</span>;
}

export function RecommendationEvidence({ recommendation }: { recommendation: Pick<Recommendation, "experience" | "evidence"> }) {
  if (!recommendation.evidence.length) return <p className="m-0 text-sm text-muted">이 추천에 연결된 원문 근거나 보완이 없어요.</p>;
  return <div className="grid gap-3">{recommendation.evidence.map((ref, i) => {
    const experience = recommendation.experience;
    if (ref.type === "CITATION") {
      const citation = experience.citations.find(c => c.id === ref.id);
      return citation ? <div key={`${ref.type}-${ref.id}-${i}`}><p className="mt-0 mb-2 text-note font-medium text-evidence">원문 발췌</p><CitationList citations={[citation]} /></div>
        : <p key={i} className="m-0 text-sm text-muted">연결된 원문 근거를 찾지 못했어요.</p>;
    }
    const supplement = experience.supplements.find(s => s.id === ref.id);
    return supplement ? <figure key={`${ref.type}-${ref.id}-${i}`} className="m-0 grid gap-2 rounded-sm border border-hairline bg-canvas p-3.5">
      {/* BE 는 확인 전 답을 추천에서 빼지만, 오더라도 사용자 말처럼 보이지 않게 가른다 */}
      <figcaption>{supplement.mcpChange ? <McpAnswerLabel client={supplement.mcpChange.client} /> : <UserEnteredLabel>내가 입력한 보완</UserEnteredLabel>}</figcaption>
      <p className="m-0 text-note text-muted">{supplement.question}</p>
      <blockquote className="m-0 whitespace-pre-wrap border-l-2 border-hairline pl-3 text-sm text-body">{supplement.answer}</blockquote>
    </figure> : <p key={i} className="m-0 text-sm text-muted">연결된 보완을 찾지 못했어요.</p>;
  })}</div>;
}

/** 이 문항에서 그 경험에 대한 되묻기에 답했나 — 추천은 문항을 넣을 때 한 번 돌아 답해도 그대로라서(question-api.md · AI#21),
 *  카드에 「답함」을 붙여 답이 다음 문항부터 쓰인다고 알린다(FE#65) */
const answeredFor = (question: QuestionDetail, experienceId: number) =>
  question.clarifications.some(c => c.experienceId === experienceId && c.supplementId !== null);

const box = "grid content-start gap-1.5 rounded-[14px] bg-canvas/80 px-3.5 py-3 text-sm leading-relaxed";
const boxTitle = "m-0 text-xs font-semibold text-muted";

/** 「참고 — 꺼내 쓸 경험」(시안 6 apply.html 의 접기 카드). 펼치기 전엔 활동 칩 · 경험 · 이유 한 줄, 펼치면 강조점 · 근거 · 빠진 것.
 *  요구사항 판정 · 되묻기는 차곡이 패널에 있다. elsewhere — 같은 지원의 다른 문항에도 추천된 같은 경험(FE#38 · S-21) */
export function QuestionResult({ question, elsewhere, savingAnswer, requestingDraft, picks, onPick }: { question: QuestionDetail; elsewhere?: (experienceId: number) => OverlapUse[]; onPick: (experienceId: number, on: boolean) => void } & Pick<DraftActions, "onOpenOmissions" | "savingAnswer" | "requestingDraft" | "picks">) {
  const picksLocked = savingAnswer || requestingDraft || question.draft?.status === "ANALYZING";
  const pickedCount = picks.filter(id => question.recommendations.some(r => r.experience.id === id)).length;
  // 초안은 답칸 안에 있다(S-79 · FE#235) — 여기는 참고 경험만
  return <><section aria-labelledby="refs-title">
    <div className="flex flex-wrap items-baseline gap-x-2"><h3 id="refs-title" className="m-0 text-title-md font-semibold">참고 — 꺼내 쓸 경험</h3>{question.recommendations.length > 0 && <span className="text-note text-muted">체크한 경험으로 초안을 만들어요</span>}</div>
    {question.recommendations.length === 0 ? <div className="mt-4 grid gap-2 rounded-sm bg-surface-soft p-5">
      <p className="m-0 font-medium">현재 자료에서 연결된 경험을 찾지 못했어요.</p>
      <p className="m-0 text-sm text-muted">경험이 없다는 뜻은 아니에요. 관련 기록을 더 확인하면 좋겠어요.</p>
    </div> : <ol className="m-0 mt-4 grid list-none gap-2.5 p-0">{question.recommendations.map((r, i) => { const answered = answeredFor(question, r.experience.id); return <li key={r.experience.id} id={`recommendation-${question.id}-${r.experience.id}`}
      className="scroll-mt-5 lg:scroll-mt-20" aria-label={`추천 경험 ${i + 1}`}>
      {/* 첫 추천은 기존처럼 펼쳐 근거를 바로 확인할 수 있게 둔다. */}
      <details open={i === 0} className="group rounded-[18px] border border-hairline bg-surface-faint">
        <summary className="grid cursor-pointer list-none grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-2 px-3 py-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:px-4 [&::-webkit-details-marker]:hidden">
          <CaretRightIcon aria-hidden="true" className="mt-1 size-4 text-muted transition-transform group-open:rotate-90" />
          {/* 체크해도 카드는 접히지 않는다. 좁은 폭은 누르는 자리를 44 로 넓힌다 */}
          <label onClick={e => e.stopPropagation()} className="-mt-3 -mb-1 flex size-11 cursor-pointer items-center justify-center lg:mt-0 lg:mb-0 lg:size-6">
            <input type="checkbox" className="size-4 accent-primary" aria-label={`초안에 쓰기 — ${r.experience.content}`} checked={picks.includes(r.experience.id)}
              disabled={picksLocked || (!picks.includes(r.experience.id) && pickedCount >= 3)} onChange={e => onPick(r.experience.id, e.target.checked)} />
          </label>
          <span className="grid gap-1">
            <ActivityChip name={r.activity.name} onTint />
            <b className="text-ui leading-normal font-bold whitespace-pre-wrap">{r.experience.content}</b>
            <small className="text-note leading-normal text-muted">{r.reason}</small>
          </span>
          {(r.gaps.length > 0 || answered) && <span className="col-start-3 flex flex-wrap gap-1.5 justify-self-start sm:col-start-auto sm:justify-self-end">
            {r.gaps.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-review-line bg-review-soft px-2.5 py-px text-xs font-semibold whitespace-nowrap text-review">
              <WarningCircleIcon aria-hidden="true" className="size-3.5" />빠진 것
            </span>}
            {answered && <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-px text-xs font-semibold whitespace-nowrap text-primary">
              <CheckIcon aria-hidden="true" className="size-3.5" />답함
            </span>}
          </span>}
        </summary>
        <div className="grid gap-2.5 px-4 pb-4 sm:grid-cols-2 sm:px-4.5 sm:pb-4.5 sm:pl-[4.75rem]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-2">
            <span className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted"><ExperienceMeta experience={r.experience} /></span>
            <span className="text-xs text-muted"><b className="font-semibold">AI 해석</b> — 이유 · 강조점 · 빠진 것</span>
          </div>
          <div className={box}>
            <p className={boxTitle}>강조하면 좋은 점</p>
            <p className="m-0 text-body">{r.emphasis}</p>
            {(elsewhere?.(r.experience.id) ?? []).map(u => <p key={u.questionId} className="m-0 text-note text-body"><span className="font-semibold">문항 {u.index + 1}에도 추천</span> — 거기선 「{u.recommendation.emphasis}」</p>)}
          </div>
          <section aria-label={`추천 경험 ${i + 1}의 근거`} className={box}>
            <p className={boxTitle}>추천을 뒷받침하는 기록</p>
            <RecommendationEvidence recommendation={r} />
          </section>
          {r.gaps.length > 0 && <div className={`${box} border border-dashed border-review-line sm:col-span-2`}>
            <p className={boxTitle}>빠진 것 — 자료에서 더 확인할 부분</p>
            <ul className="m-0 list-disc space-y-1 pl-4 text-body">{r.gaps.map((gap, j) => <li key={j}>{gap}</li>)}</ul>
            {answered && <p className="m-0 flex items-start gap-1.5 text-note text-body">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span><b className="font-semibold">차곡이 질문에 답했어요</b> — 보완으로 쌓여 다음 문항부터 근거로 써요. 이 추천은 문항을 넣을 때 만든 거라 위 목록은 그대로예요.</span>
            </p>}
          </div>}
          <Link href={`/experience?activity=${r.activity.id}&fromQuestion=${question.id}`}
            className="inline-flex min-h-11 items-center justify-self-start text-sm font-medium text-ink underline-offset-3 hover:underline sm:col-span-2">타임라인에서 활동 보기 →</Link>
        </div>
      </details>
    </li>; })}</ol>}
  </section></>;
}
