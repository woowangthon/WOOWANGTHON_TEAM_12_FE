// MOCK(timeline-applications): API 주소가 없는 목 모드에서만 경험의 「지원서 N곳에 쓰임」(S-38 usedIn)에 붙일 가상 지원을 돌려준다. 타임라인 「지원도 같이 보기」(S-37)는 지원서 화면이 생겨 뺐다(FE#461).
// 시안 6 의 지원 예시를 본떠 지어낸 것이고 실제 단체가 아니다. 실제 API 실패 대체용이 아니다.
// 일부러 섞은 것: 활동이 있는 해 · 상태 넷(냈음 · 합격 · 불합격 · 모름) · 작성 중(낸 달 없음)

import type { Application } from "@/lib/api/question-types";

const app = (id: number, organization: string, applicationStatus: Application["applicationStatus"], submittedMonth: string | null): Application => ({
  id, organization, applicationStatus, submittedMonth, organizationType: null, jobRole: null, postingUrl: null,
  questions: [{ id: id * 10, applicationId: id, organization, text: "지원 동기를 적어 주세요.", questionType: null, questionTypeBy: null, status: "COMPLETED", createdAt: "2026-01-01T00:00:00Z" }],
  createdAt: "2026-01-01T00:00:00Z",
});

export const MOCK_APPLICATIONS: Application[] = [
  app(901, "OO 부트캠프", "WRITING", null),
  app(902, "IT 연합 동아리 운영진", "UNKNOWN", "2026-01"),
  app(903, "UX 리서치 학회 신입 모집", "PASSED", "2025-08"),
  app(904, "OO 공모전", "NOT_PASSED", "2025-03"),
  app(905, "OO 기업 여름 인턴", "SUBMITTED", "2024-05"),
];
