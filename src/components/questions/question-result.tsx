import Link from "next/link";
import { useState } from "react";
import { CaretRightIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { CitationList } from "@/components/experience/citation-list";
import { McpAnswerLabel, UserEnteredLabel } from "@/components/experience/supplement-list";
import type { QuestionDetail, Recommendation } from "@/lib/api/question-types";
import { periodText } from "@/lib/period";
import type { OverlapUse } from "./overlap";
import { ActivityTag } from "@/components/experience/activity-category";
import { useActivityCategory } from "./activity-categories";
import type { DraftActions } from "./answer-draft";
import { groupByActivity, type ActivityGroup } from "./use-draft-picks";
import { RematchButton, type Rematch } from "./rematch-button";

/** 「바꿔요 — 캠퍼스 중고거래 앱」 → 「바꿔요」 (시안의 활동 칩) */
export const shortName = (name: string) => name.split(" — ")[0];

/** 활동 칩 — 분류색(S-57). 어느 바탕 위에서도 같은 분류색 칩. 색은 칩에만 쓴다(시안 6 .act-chip) */
export function ActivityChip({ name }: { name: string }) {
  return <ActivityTag category={useActivityCategory(name)} className="justify-self-start whitespace-nowrap">{shortName(name)}</ActivityTag>;
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
const badge = "inline-flex items-center gap-1 rounded-full px-2.5 py-px text-xs font-semibold whitespace-nowrap";

/** 카드에 처음 보이는 줄 수 — 넘으면 「더 보기」(FE#358 기본값) */
const VISIBLE_LINES = 3;

/** 「참고 — 꺼내 쓸 경험」(시안 6 apply.html 의 접기 카드)을 활동 카드로 묶는다(S-84 · FE#358).
 *  카드 = 활동 이름 · 기간 + 그 활동 첫 추천의 이유 · 강조점(AI 해석) + 「이 문항에 쓸 만한 줄」. 사용자는 활동만 체크한다.
 *  줄을 펼치면 근거 · 빠진 것. 요구사항 판정 · 되묻기는 차곡이 패널에 있다. elsewhere — 같은 지원의 다른 문항에도 추천된 같은 경험(FE#38 · S-21) */
export function QuestionResult({ question, elsewhere, savingAnswer, requestingDraft, picks, onPick, onRematch }: { question: QuestionDetail; elsewhere?: (experienceId: number) => OverlapUse[]; onPick: (activityId: number, on: boolean) => void; onRematch: Rematch } & Pick<DraftActions, "onOpenOmissions" | "savingAnswer" | "requestingDraft" | "picks">) {
  const picksLocked = savingAnswer || requestingDraft || question.draft?.status === "ANALYZING";
  const groups = groupByActivity(question.recommendations);
  // 초안은 답칸 안에 있다(S-79 · FE#235) — 여기는 참고 경험만
  return <><section aria-labelledby="refs-title">
    <div className="flex flex-wrap items-baseline gap-x-2"><h3 id="refs-title" className="m-0 text-title-md font-semibold">참고 — 꺼내 쓸 경험</h3>{groups.length > 0 && <span className="text-note text-muted">체크한 활동으로 초안을 만들어요</span>}
      {/* 추천이 있어도 그 뒤에 넣은 경험을 반영한다(S-90) — 0개일 때는 아래 안내 자리에 크게 */}
      {groups.length > 0 && <RematchButton className="ml-auto justify-items-end" questionId={question.id} onRematch={onRematch} busy={picksLocked} />}</div>
    {groups.length === 0 ? <div className="mt-4 grid gap-2 rounded-sm bg-surface-soft p-5">
      <p className="m-0 font-medium">현재 자료에서 연결된 경험을 찾지 못했어요.</p>
      <p className="m-0 text-sm text-muted">경험이 없다는 뜻은 아니에요. 관련 기록을 더 확인하면 좋겠어요.</p>
      <p className="m-0 mt-1 text-sm text-body">경험을 더 넣으셨나요? 지금 쌓인 경험으로 다시 찾아볼 수 있어요.</p>
      <RematchButton prominent questionId={question.id} onRematch={onRematch} busy={picksLocked} />
    </div> : <ol className="m-0 mt-4 grid list-none gap-2.5 p-0">{groups.map((g, i) => <ActivityCard key={g.activity.id} group={g} index={i} question={question} elsewhere={elsewhere}
      checked={picks.includes(g.recommendations[0].experience.id)} disabled={picksLocked} onPick={on => onPick(g.activity.id, on)} />)}</ol>}
  </section></>;
}

function ActivityCard({ group, index, question, elsewhere, checked, disabled, onPick }: {
  group: ActivityGroup; index: number; question: QuestionDetail; elsewhere?: (experienceId: number) => OverlapUse[]; checked: boolean; disabled: boolean; onPick: (on: boolean) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { activity, recommendations } = group;
  const first = recommendations[0];
  const hidden = recommendations.length - VISIBLE_LINES;
  const lines = showAll || hidden <= 0 ? recommendations : recommendations.slice(0, VISIBLE_LINES);
  return <li aria-label={`추천 활동 ${index + 1}`} className={`grid gap-3 rounded-[18px] border bg-surface-faint px-3 py-3 sm:px-4 ${checked ? "border-primary" : "border-hairline"}`}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
      {/* 좁은 폭은 누르는 자리를 44 로 넓힌다 */}
      <label className="-mt-2.5 -ml-2.5 flex size-11 cursor-pointer items-center justify-center lg:mt-0 lg:ml-0 lg:size-6">
        <input type="checkbox" className="size-4 accent-primary" aria-label={`초안에 쓰기 — ${activity.name}`} checked={checked} disabled={disabled} onChange={e => onPick(e.target.checked)} />
      </label>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ActivityChip name={activity.name} />
          <b className="text-ui leading-normal font-bold">{activity.name}</b>
          <span className="text-note text-muted">{periodText(activity.period)}</span>
        </div>
        <p className="m-0 text-note leading-normal text-muted"><b className="font-semibold">AI 해석</b> — {first.reason}</p>
      </div>
    </div>
    <div className={box}>
      <p className={boxTitle}>강조하면 좋은 점 · AI 해석</p>
      <p className="m-0 text-body">{first.emphasis}</p>
    </div>
    <div className="grid gap-1.5">
      <p className={boxTitle}>이 문항에 쓸 만한 줄</p>
      <ul className="m-0 grid list-none gap-1.5 p-0">{lines.map(r => <RecommendationLine key={r.experience.id} recommendation={r} question={question} elsewhere={elsewhere} />)}</ul>
      {hidden > 0 && <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}
        className="inline-flex min-h-11 lg:min-h-8 items-center justify-self-start text-sm font-medium text-ink underline-offset-3 hover:underline">
        {showAll ? "접기" : `${hidden}줄 더 보기`}
      </button>}
    </div>
    <Link href={`/experience?activity=${activity.id}&fromQuestion=${question.id}`}
      className="inline-flex min-h-11 lg:min-h-10 items-center justify-self-start text-sm font-medium text-ink underline-offset-3 hover:underline">타임라인에서 활동 보기 →</Link>
  </li>;
}

/** 「쓸 만한 줄」 하나 — 펼치면 근거 · 빠진 것 · 다른 문항에도 추천. 줄은 넣고 빼지 않는다(S-84) */
function RecommendationLine({ recommendation: r, question, elsewhere }: { recommendation: Recommendation; question: QuestionDetail; elsewhere?: (experienceId: number) => OverlapUse[] }) {
  const answered = answeredFor(question, r.experience.id);
  // 줄 이름은 문항 전체 추천 순번 — 카드가 묶여도 「추천 경험 N」으로 찾는다
  const n = question.recommendations.indexOf(r) + 1;
  const others = elsewhere?.(r.experience.id) ?? [];
  return <li id={`recommendation-${question.id}-${r.experience.id}`} aria-label={`추천 경험 ${n}`} className="scroll-mt-5 lg:scroll-mt-20">
    <details className="group rounded-[14px] bg-canvas/80">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
        <CaretRightIcon aria-hidden="true" className="mt-1 size-3.5 text-muted transition-transform group-open:rotate-90" />
        <span className="text-sm leading-relaxed font-medium whitespace-pre-wrap text-ink">{r.experience.content}</span>
        {(r.gaps.length > 0 || answered) && <span className="col-start-2 flex flex-wrap gap-1.5 justify-self-start sm:col-start-auto sm:justify-self-end">
          {r.gaps.length > 0 && <span className={`${badge} border border-dashed border-review-line bg-review-soft text-review`}>
            <WarningCircleIcon aria-hidden="true" className="size-3.5" />빠진 것
          </span>}
          {answered && <span className={`${badge} bg-primary-soft text-primary`}>
            <CheckIcon aria-hidden="true" className="size-3.5" />답함
          </span>}
        </span>}
      </summary>
      <div className="grid gap-2.5 px-3 pb-3 sm:pl-8.5">
        <span className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted"><ExperienceMeta experience={r.experience} /></span>
        {others.map(u => <p key={u.questionId} className="m-0 text-note text-body"><span className="font-semibold">문항 {u.index + 1}에도 추천</span> — 거기선 「{u.recommendation.emphasis}」</p>)}
        <section aria-label={`추천 경험 ${n}의 근거`} className="grid gap-1.5">
          <p className={boxTitle}>추천을 뒷받침하는 기록</p>
          <RecommendationEvidence recommendation={r} />
        </section>
        {r.gaps.length > 0 && <div className={`${box} border border-dashed border-review-line`}>
          <p className={boxTitle}>빠진 것 — 자료에서 더 확인할 부분 · AI 해석</p>
          <ul className="m-0 list-disc space-y-1 pl-4 text-body">{r.gaps.map((gap, j) => <li key={j}>{gap}</li>)}</ul>
          {answered && <p className="m-0 flex items-start gap-1.5 text-note text-body">
            <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span><b className="font-semibold">차곡이 질문에 답했어요</b> — 보완으로 쌓여 다음 문항부터 근거로 써요. 이 추천은 문항을 넣을 때 만든 거라 위 목록은 그대로예요.</span>
          </p>}
        </div>}
      </div>
    </details>
  </li>;
}
