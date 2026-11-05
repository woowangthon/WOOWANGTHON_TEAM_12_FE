// 시험 전용 S-45 계약 응답. 제품 실행에서 쓰거나 AI 판단을 흉내 내지 않는다.
import type { GroundingCheck } from "../../src/lib/api/question-types";
export const GROUNDING_EXAMPLE: GroundingCheck = {
  questionId: 41, status: "COMPLETED", error: null,
  text: "채팅 지연을 WebSocket으로 해결했습니다. 서버의 구독 코드를 바꿨습니다. 직접 문서를 정리했습니다. 응답 속도가 80% 빨라졌습니다. 개발자가 되고 싶습니다. 예전에 확인한 문장입니다.",
  sentences: [
    { text: "채팅 지연을 WebSocket으로 해결했습니다.", status: "SOURCE", evidence: [{ type: "CITATION", id: 901, experienceId: 999, activityId: 7, text: "채팅 지연을 WebSocket으로 해결했다." }], note: null },
    { text: "서버의 구독 코드를 바꿨습니다.", status: "USER_INPUT", evidence: [{ type: "SUPPLEMENT", id: 902, experienceId: 999, activityId: 7, text: "서버의 구독 코드를 바꿨다." }], note: null },
    { text: "직접 문서를 정리했습니다.", status: "USER_INPUT", evidence: [{ type: "EXPERIENCE", id: 999, experienceId: 999, activityId: 7, text: "직접 문서를 정리했다." }], note: null },
    { text: "응답 속도가 80% 빨라졌습니다.", status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(80)가 받치는 근거 · 보완에 없어요" },
    { text: "개발자가 되고 싶습니다.", status: "OPINION", evidence: [], note: null },
    { text: "예전에 확인한 문장입니다.", status: "SOURCE", evidence: [], note: null },
  ],
  createdAt: "2026-11-05T15:00:00+09:00", updatedAt: "2026-11-05T15:00:12+09:00",
};
