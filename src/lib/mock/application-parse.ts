// MOCK(application-parse): API 주소가 없는 목 모드에서만 지원 나누기를 모의한다. AI 판단이 아니고 실제 API 실패 대체용도 아니다.
// 고정 예시를 돌려주지 않는다 — 넣은 글의 번호 달린 줄 · [대괄호] 이름 · 낱말만 규칙으로 읽어, 글에 없는 문항을 만들지 않는다.
import type { ParsedApplication } from "../api/entrance";

export function mockParseApplication(text: string): ParsedApplication {
  const questions = text.split("\n").flatMap(line => line.trim().match(/^\d+[.)]\s*(.+)$/)?.[1] ?? []).slice(0, 10);
  return {
    organization: text.match(/\[([^\]\n]{1,100})\]/)?.[1].trim() ?? null,
    organizationType: text.includes("부트캠프") ? "BOOTCAMP" : text.includes("동아리") ? "CLUB" : null,
    jobRole: text.includes("백엔드") ? "BACKEND" : text.includes("프론트") ? "FRONTEND" : null,
    questions,
  };
}
