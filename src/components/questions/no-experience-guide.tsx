import Link from "next/link";
import type { QuestionType } from "@/lib/api/question-types";

/** 추천이 0개일 때 — 문항 유형(S-41)에 맞춰 무엇을 기록하면 되는지 한 줄(S-19 · FE#586). 코드 표라 AI 를 부르지 않는다(S-26 「자주 나오는 문항」과 같은 식).
 *  표에 없는 유형(기타 · 지원 동기 등)은 안내를 더하지 않고 공통 문구만 보인다. 부족한 사람처럼 읽히지 않게 「이런 기록이 있으면」 결로 쓴다 */
const RECORD_HINT: Partial<Record<QuestionType, string>> = {
  STRENGTH_WEAKNESS: "남에게 들은 피드백, 고쳐 가는 습관, 여러 번 비슷하게 행동한 일을 적어 두면 장단점 문항에 쓸 수 있어요.",
  FAILURE: "잘 안 된 일과 그때 한 행동, 그 뒤 달라진 것을 적어 두면 실패 문항에 쓸 수 있어요.",
  COLLABORATION: "함께 한 일에서 내가 맡은 업무를 적어 두면 협업 문항에 쓸 수 있어요.",
  CONFLICT: "팀 안에서 의견이 갈린 일과 상대가 중요하게 본 것을 적어 두면 갈등 문항에 쓸 수 있어요.",
  PROBLEM_SOLVING: "막혔던 일과 원인을 찾아 해결한 과정을 적어 두면 문제 해결 문항에 쓸 수 있어요.",
  GROWTH: "배우거나 바뀐 계기와 그 뒤 달라진 행동을 적어 두면 성장 문항에 쓸 수 있어요.",
};

export const recordHintOf = (type: QuestionType | null | undefined) => (type && RECORD_HINT[type]) || null;

/** 유형에 맞는 안내 한 줄 + 기록하러 가는 링크(내 경험의 「자료 넣기」 창). 안내할 유형이 아니면 null */
export function NoExperienceGuide({ type, questionId, className }: { type: QuestionType | null | undefined; questionId: number; className?: string }) {
  const hint = recordHintOf(type);
  if (!hint) return null;
  return <p className={className ?? "m-0 text-sm text-body"}>
    {hint}{" "}
    <Link href={`/experience?add=1&fromQuestion=${questionId}`} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-3 lg:min-h-0">기록하러 가기 →</Link>
  </p>;
}
