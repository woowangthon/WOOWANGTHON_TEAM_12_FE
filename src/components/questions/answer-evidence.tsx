import { mcpAnswerName } from "@/components/experience/supplement-list";
import type { DraftEvidence, QuestionDetail } from "@/lib/api/question-types";

/** 초안과 근거 점검은 같은 근거 모양을 쓴다. 추천 밖 경험도 응답의 text · activityId로 연다. */
export function AnswerEvidence({ evidence: e, questionId, question }: { evidence: DraftEvidence; questionId: number; question?: QuestionDetail }) {
  // 이름은 응답의 sourceName · question 이 먼저다(S-75) — 보조 재료처럼 추천에 없는 경험도 그린다. 이전 응답이면 추천 목록에서 찾는다
  const experience = question?.recommendations.find(r => r.experience.id === e.experienceId)?.experience;
  const citation = e.type === "CITATION" ? experience?.citations.find(c => c.id === e.id) : null;
  const supplement = e.type === "SUPPLEMENT" ? experience?.supplements.find(s => s.id === e.id) : null;
  const sourceName = e.sourceName ?? citation?.sourceName;
  const asked = e.question ?? supplement?.question;
  return <details className="min-w-0 rounded-sm border border-hairline-soft bg-surface-soft px-3 py-2 text-sm">
    <summary className={`min-h-11 lg:min-h-10 cursor-pointer content-center break-words font-medium ${e.type === "CITATION" ? "text-evidence" : "text-body"}`}>
      {e.type === "CITATION" ? `원문 · ${sourceName ?? "연결된 발췌"}` : e.type === "SUPPLEMENT" ? `${supplement?.mcpChange ? mcpAnswerName(supplement.mcpChange.client) : "내가 입력"} · ${asked ?? "보완"}` : "내가 입력 · 직접 넣거나 고친 경험"}
    </summary>
    <div className="grid gap-2 pt-3">
      {asked && e.type === "SUPPLEMENT" && <p className="m-0 text-note text-muted">질문 · {asked}</p>}
      <blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 leading-relaxed text-body">{e.text}</blockquote>
      <a href={`/experience?activity=${e.activityId}&fromQuestion=${questionId}`} className="inline-flex min-h-11 lg:min-h-10 items-center text-xs underline underline-offset-3">내 경험에서 보기 →</a>
    </div>
  </details>;
}
