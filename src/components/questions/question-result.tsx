import Link from "next/link";
import { CheckIcon, MinusCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { CitationList } from "@/components/experience/citation-list";
import { Button } from "@/components/ui/button";
import type { QuestionDetail, Recommendation, RequirementStatus } from "@/lib/api/question-types";
import type { OverlapUse } from "./overlap";

const JUDGMENT: Record<RequirementStatus, { label: string; icon: typeof CheckIcon }> = {
  SUPPORTED: { label: "근거 있음", icon: CheckIcon },
  PARTIAL: { label: "일부 확인됨", icon: MinusCircleIcon },
  NOT_FOUND: { label: "자료에서 확인 안 됨", icon: WarningCircleIcon },
};

export function RecommendationEvidence({ recommendation }: { recommendation: Recommendation }) {
  if (!recommendation.evidence.length) return <p className="m-0 text-sm text-muted">이 추천에 연결된 원문 근거나 보완이 없어요.</p>;
  return <div className="grid gap-3">{recommendation.evidence.map((ref, i) => {
    const experience = recommendation.experience;
    if (ref.type === "CITATION") {
      const citation = experience.citations.find(c => c.id === ref.id);
      return citation ? <div key={`${ref.type}-${ref.id}-${i}`}><p className="mb-2 text-[13px] font-medium text-evidence">원문 발췌</p><CitationList citations={[citation]} /></div>
        : <p key={i} className="m-0 text-sm text-muted">연결된 원문 근거를 찾지 못했어요.</p>;
    }
    const supplement = experience.supplements.find(s => s.id === ref.id);
    return supplement ? <figure key={`${ref.type}-${ref.id}-${i}`} className="m-0 grid gap-2 rounded-sm border border-hairline p-3.5">
      <figcaption className="text-[13px] font-medium text-muted">내가 입력한 보완</figcaption>
      <p className="m-0 text-[13px] text-muted">{supplement.question}</p>
      <blockquote className="m-0 whitespace-pre-wrap border-l-2 border-hairline pl-3 text-sm text-body">{supplement.answer}</blockquote>
    </figure> : <p key={i} className="m-0 text-sm text-muted">연결된 보완을 찾지 못했어요.</p>;
  })}</div>;
}

/** elsewhere — 같은 지원의 다른 문항에도 추천된 같은 경험(FE#38 · S-21). 막지 않고 강조점만 나란히 */
export function QuestionResult({ question, elsewhere }: { question: QuestionDetail; elsewhere?: (experienceId: number) => OverlapUse[] }) {
  return <div className="grid gap-8">
    <section aria-labelledby="requirements-title">
      <h3 id="requirements-title" className="m-0 text-[17px] font-semibold">문항에서 살펴보는 것</h3>
      <p className="mt-2 mb-4 text-sm text-muted">AI 해석 예시예요. 「자료에서 확인 안 됨」은 경험이 없다는 뜻이 아니에요.</p>
      <ul className="m-0 list-none p-0">{question.requirements.map((requirement, i) => {
        const { label, icon: Icon } = JUDGMENT[requirement.status];
        const related = requirement.experienceIds.flatMap(id => {
          const index = question.recommendations.findIndex(r => r.experience.id === id);
          return index < 0 ? [] : [{ id, index }];
        });
        return <li key={i} className="grid gap-2 border-b border-hairline py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-[15px]">{requirement.text}</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted"><Icon aria-hidden="true" className="size-4 shrink-0" />{label}</span>
          </div>
          {related.length > 0 && <div className="flex flex-wrap gap-3">{related.map(({ id, index }) => <a key={id} href={`#recommendation-${question.id}-${id}`} className="inline-flex min-h-11 items-center text-[13px] text-evidence underline underline-offset-4">추천 경험 {index + 1}에서 확인</a>)}</div>}
          {requirement.status === "NOT_FOUND" && <p className="m-0 text-[13px] text-muted">관련 기록을 더 확인하면 좋겠어요.</p>}
        </li>;
      })}</ul>
    </section>
    <section aria-labelledby="recommendations-title">
      <h3 id="recommendations-title" className="m-0 text-[17px] font-semibold">이 문항에 꺼내 볼 경험</h3>
      {question.recommendations.length === 0 ? <div className="mt-4 grid gap-2 rounded-sm bg-surface-soft p-5">
        <p className="m-0 font-medium">현재 자료에서 연결된 경험을 찾지 못했어요.</p>
        <p className="m-0 text-sm text-muted">경험이 없다는 뜻은 아니에요. 관련 기록을 더 확인하면 좋겠어요.</p>
      </div> : <ol className="m-0 list-none p-0">{question.recommendations.map((r, i) => <li key={r.experience.id} id={`recommendation-${question.id}-${r.experience.id}`} className="scroll-mt-5 border-b border-hairline py-6" aria-label={`추천 경험 ${i + 1}`}>
        <p className="mt-0 mb-2 text-[13px] font-medium text-muted">{i + 1}. {r.activity.name}</p>
        <h4 className="m-0 whitespace-pre-wrap text-base leading-relaxed font-medium">{r.experience.content}</h4>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted"><ExperienceMeta experience={r.experience} /></div>
        <div className="my-4 grid gap-3 border-l-2 border-hairline pl-4">
          <p className="m-0 text-xs font-semibold text-muted">AI 해석 · 예시</p>
          <div><h5 className="m-0 text-sm font-semibold">왜 이 경험인가요?</h5><p className="mt-1 mb-0 text-sm text-body">{r.reason}</p></div>
          <div><h5 className="m-0 text-sm font-semibold">강조해 볼 점</h5><p className="mt-1 mb-0 text-sm text-body">{r.emphasis}</p></div>
          {r.gaps.length > 0 && <div><h5 className="m-0 text-sm font-semibold">자료에서 더 확인할 부분</h5><ul className="mt-1 mb-0 list-disc space-y-1 pl-4 text-sm text-body">{r.gaps.map((gap, j) => <li key={j}>{gap}</li>)}</ul></div>}
          {(elsewhere?.(r.experience.id) ?? []).map(u => <p key={u.questionId} className="m-0 text-sm text-body"><span className="font-semibold">문항 {u.index + 1}에도 추천</span> — 거기선 「{u.recommendation.emphasis}」</p>)}
        </div>
        <section aria-label={`추천 경험 ${i + 1}의 근거`} className="grid gap-2">
          <h5 className="m-0 text-sm font-semibold">추천을 뒷받침하는 기록</h5>
          <RecommendationEvidence recommendation={r} />
        </section>
        <Button asChild variant="link" className="mt-3 text-sm"><Link href={`/?questionMock=1&activity=${r.activity.id}&fromQuestion=${question.id}`}>타임라인에서 활동 보기 →</Link></Button>
      </li>)}</ol>}
    </section>
  </div>;
}
