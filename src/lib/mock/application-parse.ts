// MOCK(application-parse): API 주소가 없는 목 모드에서만 지원 나누기를 모의한다. AI 판단이 아니고 실제 API 실패 대체용도 아니다.
// 고정 예시를 돌려주지 않는다 — 넣은 글의 번호 달린 줄 · [대괄호] 이름 · 낱말만 규칙으로 읽어, 글에 없는 문항을 만들지 않는다.
import type { ParsedApplication } from "../api/entrance";
import { ApiError } from "../api/errors";

export function mockParseApplication(text: string): ParsedApplication {
  const questions = text.split("\n").flatMap(line => line.trim().match(/^\d+[.)]\s*(.+)$/)?.[1] ?? []).slice(0, 10);
  return {
    organization: text.match(/\[([^\]\n]{1,100})\]/)?.[1].trim() ?? null,
    organizationType: text.includes("부트캠프") ? "BOOTCAMP" : text.includes("동아리") ? "CLUB" : null,
    jobRole: text.includes("백엔드") ? "BACKEND" : text.includes("프론트") ? "FRONTEND" : null,
    questions,
  };
}

// MOCK(application-parse-url): 목 모드에서만 공고 링크 읽기(S-46)를 모의한다 — 링크를 받지 않는다(네트워크 없음).
// 주소에 든 낱말로 화면 상태를 고른다: blocked → URL_BLOCKED · unreadable → URL_UNREADABLE · form → 문항 없음, 그 밖엔 고정 예시 공고.
// 고정 예시는 칸 꼬리표 「목 규칙으로 채움」 · 목 모드 표시와 함께만 보인다. 실제 API 실패 대체용이 아니다.
export function mockParseApplicationUrl(url: string): ParsedApplication {
  if (url.includes("blocked")) throw new ApiError("URL_BLOCKED", "이 사이트는 자동으로 읽는 것을 막아 두었어요.", 422);
  if (url.includes("unreadable")) throw new ApiError("URL_UNREADABLE", "글이 거의 없는 페이지예요 — 화면을 그림이나 스크립트로 그리는 사이트일 수 있어요.", 422);
  if (url.includes("form")) return { organization: "OO 연합 동아리 12기", organizationType: "CLUB", jobRole: null, questions: [] };
  return mockParseApplication("[OO 백엔드 부트캠프 4기]\n1. 기술적인 문제를 해결한 경험을 구체적으로 적어 주세요. (500자)\n2. 지원 동기와 수료 후 목표를 적어 주세요. (500자)");
}
