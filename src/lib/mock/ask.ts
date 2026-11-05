import type { AskRecommendation } from "@/lib/api/entrance";
import { MOCK_ACTIVITIES } from "./activities";

export type MockAskResult = "CARDS" | "EMPTY";

/** MOCK(entrance-ask): 목 모드에서만 꺼내기 답(S-29) 예시를 돌려준다. 질문을 읽지 않는 고정 예시이고 AI 판단이 아니다 — 이유 문장에 그렇게 적는다. */
export function mockAsk(result: MockAskResult): AskRecommendation[] {
  if (result === "EMPTY") return [];
  const pick = (activityId: number, experienceId: number, reason: string): AskRecommendation[] => {
    const activity = MOCK_ACTIVITIES.find(a => a.id === activityId);
    const experience = activity?.experiences.find(e => e.id === experienceId);
    if (!activity || !experience) return [];
    return [{
      activity: { id: activity.id, name: activity.name, period: activity.period },
      experience: { ...experience, supplements: [] },
      reason,
      evidence: experience.citations.map(c => ({ type: "CITATION" as const, id: c.id })),
    }];
  };
  return [
    ...pick(8, 111, "목 예시 — AI 판단이 아니에요. 스터디에서 문제 선정을 맡은 자리라 이끈 경험으로 볼 수 있어요"),
    ...pick(7, 102, "목 예시 — AI 판단이 아니에요. 팀이 매주 회고로 의견을 모은 자리예요. 회고를 내가 이끌었는지는 자료에 없어요"),
  ];
}
