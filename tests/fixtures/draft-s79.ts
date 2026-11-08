// 시험 전용 HTTP 응답: 세 등급(S-78) · 빈칸 · 주체 확인 전 근거가 섞인 초안(FE#235). 제품 코드는 읽지 않는다.
import type { Draft } from "../../src/lib/api/question-types";

const quote = "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.";
const citation = { type: "CITATION" as const, id: 201, experienceId: 101, activityId: 7, text: quote, sourceName: "바꿔요-회고.md", question: null, actor: "ME" as const };

export const DRAFT_S79: Draft = {
  questionId: 41, status: "COMPLETED", error: null, experienceIds: [101], frame: "NONE", guidelines: [], useContext: true, freeRegenerate: false,
  sentences: [
    { id: 801, kind: "FACT", text: "「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다.", evidence: [citation], note: null, confirmed: false },
    { id: 802, kind: "ELABORATED", text: "메시지가 늦게 오면 거래 약속을 잡는 대화가 자주 끊기는 문제였습니다.", evidence: [citation], note: "대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요", confirmed: false },
    { id: 803, kind: "FACT", text: "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.", note: null, confirmed: false,
      evidence: [{ type: "SUPPLEMENT", id: 301, experienceId: 101, activityId: 7, text: "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다", sourceName: null, question: "폴링을 WebSocket 으로 바꿀 때 직접 고친 부분은 어디였나요?", actor: "ME" }] },
    { id: 804, kind: "ELABORATED", text: "제가 배포 전 부하를 점검했고, 바꾼 뒤 메시지 지연은 [줄어든 정도]였습니다.", note: "누가 했는지 확인해 주세요", confirmed: false,
      evidence: [{ type: "CITATION", id: 203, experienceId: 103, activityId: 7, text: "배포 전에 부하를 점검했다.", sourceName: "바꿔요-회고.md", question: null, actor: "UNKNOWN" }] },
    { id: 805, kind: "OPINION", text: "앞으로도 문제의 원인을 끝까지 살피는 개발자가 되고 싶습니다.", evidence: [], note: null, confirmed: false },
  ],
  omitted: [
    { text: "바꾼 뒤 지연이 줄어든 정도", question: "WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?", experienceId: 101, clarificationId: 64, supplementId: null, placeholder: "[줄어든 정도]", sentenceIndex: 3 },
    { text: "이 경험에서 배운 점 · 느낀 점", question: "채팅 방식을 바꾸며 배운 점이나 느낀 점이 있나요?", experienceId: 101, clarificationId: 65, supplementId: null, placeholder: null, sentenceIndex: null },
  ],
  createdAt: "2026-11-08T10:10:00+09:00", updatedAt: "2026-11-08T10:10:21+09:00",
};
