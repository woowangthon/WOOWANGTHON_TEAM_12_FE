// 시험 전용 HTTP 응답: S-79 초안에 AI 가정(SUPPOSED · ADR-014) 두 문장을 더한 것(FE#348). 제품 코드는 읽지 않는다.
// 4 번은 경험 101 에 붙은 가정(짝 되묻기 66), 5 번은 구체 값(specific)이 든 경험에 안 붙은 가정(짝 되묻기 없음)
import type { Draft } from "../../src/lib/api/question-types";
import { DRAFT_S79 } from "./draft-s79";

const [a, b, c, d, opinion] = DRAFT_S79.sentences;

export const SUPPOSED_LINKED = "바꾸기 전에 두 방식을 작은 시험 화면으로 먼저 비교해 봤습니다.";
export const SUPPOSED_SPECIFIC = "이 일로 교내 해커톤에서 우수상을 받았습니다.";

export const DRAFT_SUPPOSED: Draft = {
  ...DRAFT_S79,
  sentences: [a, b, c, d,
    { id: 806, kind: "SUPPOSED", text: SUPPOSED_LINKED, evidence: [], note: null, confirmed: false, specific: false },
    { id: 807, kind: "SUPPOSED", text: SUPPOSED_SPECIFIC, evidence: [], note: null, confirmed: false, specific: true },
    opinion],
  omitted: [
    ...DRAFT_S79.omitted,
    { text: "바꾸기 전 두 방식을 비교한 과정", question: "폴링과 WebSocket 을 바꾸기 전에 어떻게 비교했나요?", experienceId: 101, clarificationId: 66, supplementId: null, placeholder: null, sentenceIndex: 4 },
    { text: "이 일로 받은 상", question: null, experienceId: null, clarificationId: null, supplementId: null, placeholder: null, sentenceIndex: 5 },
  ],
};
