// 시험 전용 HTTP 응답: ETC question-api.md의 Draft 예시. 제품 코드는 읽지 않는다.
import type { Draft } from "../../src/lib/api/question-types";
export const DRAFT_EXAMPLE: Draft = {
  questionId: 41, status: "COMPLETED", error: null, experienceIds: [101],
  sentences: [
    { text: "「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다.", evidence: [{ type: "CITATION", id: 201, experienceId: 101, activityId: 7, text: "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다." }] },
    { text: "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.", evidence: [{ type: "SUPPLEMENT", id: 301, experienceId: 101, activityId: 7, text: "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다" }] },
  ],
  omitted: ["바꾼 뒤 메시지가 제때 오는지 확인한 방법", "Java · Spring 을 쓴 경험", "이 경험에서 배운 점 · 느낀 점"],
  createdAt: "2026-11-04T10:10:00+09:00", updatedAt: "2026-11-04T10:10:21+09:00",
};
