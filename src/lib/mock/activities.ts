// MOCK(timeline-activities): API 주소가 없는 목 모드에서만 가상 활동 · 경험 · 근거를 돌려준다. 실제 API 실패 대체용이 아니다.
// 바꿔요 · 알고리즘 스터디는 계약(experience-api.md) 예시와 같은 자료이고, 나머지는 화면 확인용으로 지어낸 것이다.
// 일부러 섞은 것: 경험이 많은 활동 · 하나뿐인 활동 · 기간이 겹치는 활동 · 해를 넘는 활동 · 진행 중 · 한 달짜리 · 연도만 아는 활동 · 기간 모름 · 경험 0개(이름 · 기간만) · 확인 필요(근거 없음 · 원본에서 못 찾음 · 아직 대조 안 함) · 내가 입력

import type { ActivityDetail, Actor, Citation, Competency, SourceStatus } from "@/lib/api/types";

const SOURCES = {
  bakkwo: { sourceId: 12, sourceName: "바꿔요-회고.md" },
  notes2024: { sourceId: 13, sourceName: "2024-활동정리.md" },
  pasted: { sourceId: 14, sourceName: "붙여넣은 텍스트 2026-10-28 21:14" },
  moabom: { sourceId: 15, sourceName: "모아봄-README.md" },
} as const;

let citationId = 200;
function cite(
  source: keyof typeof SOURCES,
  quote: string,
  line: number | null,
  matched: boolean | null = true,
): Citation {
  citationId += 1;
  return {
    id: citationId,
    ...SOURCES[source],
    quote,
    matched,
    location: line == null ? null : { startLine: line, endLine: line },
  };
}

function exp(
  id: number,
  activityId: number,
  competency: Competency,
  actor: Actor,
  sourceStatus: SourceStatus,
  content: string,
  citations: Citation[],
  competenciesBy: "AI" | "USER" = "AI",
) {
  return { id, activityId, content, competencies: [competency], competenciesBy, actor, sourceStatus, citations };
}

export const MOCK_ACTIVITIES: ActivityDetail[] = [
  // MOCK(timeline-activities): 같은 활동 제안 표시용. AI 판단이 아니며 저장은 기존 목 모드처럼 실패를 알린다.
  {
    id: 18,
    name: "바꿔요 프로젝트 README",
    period: { start: "2025-03", end: "2025-06", ongoing: false },
    mergeSuggestion: { activityId: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false } },
    experiences: [],
  },
  {
    id: 8,
    name: "알고리즘 스터디",
    period: { start: "2024-09", end: null, ongoing: true },
    experiences: [
      exp(111, 8, "OPERATION", "ME", "SOURCE_CONFIRMED", "매주 풀 문제를 고른다", [
        cite("bakkwo", "내가 문제 선정을 맡는다.", 10),
      ]),
    ],
  },
  {
    id: 7,
    name: "바꿔요 — 캠퍼스 중고거래 앱",
    period: { start: "2025-03", end: "2025-06", ongoing: false },
    experiences: [
      exp(101, 7, "PROBLEM_SOLVING", "ME", "SOURCE_CONFIRMED", "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다", [
        cite("bakkwo", "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.", 5),
      ]),
      exp(102, 7, "COLLABORATION", "TEAM", "SOURCE_CONFIRMED", "매주 금요일 스프린트 회고를 했다", [
        cite("bakkwo", "팀은 매주 금요일 스프린트 회고를 했다.", 6),
      ]),
      exp(103, 7, "IMPLEMENTATION", "TEAM", "SOURCE_CONFIRMED", "서비스를 AWS 에 배포했다", [
        cite("bakkwo", "배포는 팀원이 맡아 AWS 에 올렸다.", 7),
      ]),
      exp(104, 7, "IMPLEMENTATION", "ME", "NEEDS_REVIEW", "백엔드 API 설계를 맡았다", [
        cite("bakkwo", "나는 백엔드 API 설계를 전부 맡았다.", null, false),
      ]),
      exp(105, 7, "PROBLEM_SOLVING", "ME", "USER_ENTERED", "거래가 끝난 뒤에도 「예약 중」으로 남는 버그를 재현 테스트부터 짜고 고쳤다", [
        cite("bakkwo", "거래 완료 뒤에도 '예약 중'으로 남는 버그가 있었다.", 9),
      ]),
      exp(106, 7, "COLLABORATION", "UNKNOWN", "SOURCE_CONFIRMED", "사용자 피드백을 모아 다음 스프린트 할 일을 정했다", [
        cite("bakkwo", "피드백을 모아 다음 스프린트에 무엇을 할지 정했다.", 11),
      ]),
    ],
  },
  {
    id: 10,
    name: "밴드 동아리 「소리결」 총무",
    period: { start: "2024-03", end: "2025-02", ongoing: false },
    experiences: [
      exp(121, 10, "OPERATION", "ME", "SOURCE_CONFIRMED", "동아리 회비 장부를 스프레드시트로 옮겨 매달 공개했다", [
        cite("notes2024", "회비 장부 엑셀로 정리, 매달 단톡에 공개", 3),
      ]),
      exp(122, 10, "COLLABORATION", "TEAM", "SOURCE_CONFIRMED", "정기 공연 두 번을 준비했다", [
        cite("notes2024", "1학기 · 2학기 정기공연 준비(운영진 전체)", 5),
      ]),
      exp(123, 10, "COMMUNICATION", "ME", "SOURCE_CONFIRMED", "연습실 예약 규칙을 정해 공지했다", [
        cite("notes2024", "연습실 겹치는 문제 → 예약 규칙 만들어서 공지함", 7),
      ]),
    ],
  },
  {
    id: 9,
    name: "교내 SW 경진대회",
    period: { start: "2024-11", end: "2024-11", ongoing: false },
    experiences: [
      exp(131, 9, "IMPLEMENTATION", "ME", "SOURCE_CONFIRMED", "공공 와이파이 위치를 지도에 띄우는 화면을 만들었다", [
        cite("notes2024", "SW 경진대회 — 공공와이파이 지도 화면 내가 만듦", 12),
      ]),
      exp(132, 9, "COMMUNICATION", "UNKNOWN", "NEEDS_REVIEW", "발표 자료를 만들었다", []),
    ],
  },
  {
    id: 16,
    name: "신입생 학습 멘토",
    period: { start: "2025", end: "2025", ongoing: false },
    experiences: [
      exp(141, 16, "COMMUNICATION", "ME", "SOURCE_CONFIRMED", "신입생 세 명과 격주로 만나 C 언어 과제를 같이 봤다", [
        cite("pasted", "신입생 멘토링 — 3명, 격주로 C 과제 같이 봄", 2),
      ]),
    ],
  },
  {
    id: 11,
    name: "UX 리서치 수업 팀 프로젝트",
    period: { start: "2025-09", end: "2025-12", ongoing: false },
    experiences: [
      exp(151, 11, "ANALYSIS", "TEAM", "SOURCE_CONFIRMED", "학생 여덟 명을 인터뷰해 학식 앱의 불편을 정리했다", [
        cite("pasted", "학식 앱 사용자 인터뷰 8명 (팀원 넷이 나눠서)", 6),
      ]),
      exp(152, 11, "IMPLEMENTATION", "ME", "SOURCE_CONFIRMED", "인터뷰 결과로 메뉴 화면 프로토타입을 만들었다", [
        cite("pasted", "프로토타입은 내가 피그마로 만듦", 7),
      ]),
    ],
  },
  {
    id: 12,
    name: "IT 연합 동아리 웹 파트",
    period: { start: "2025-08", end: "2026-02", ongoing: false },
    experiences: [
      exp(161, 12, "IMPLEMENTATION", "ME", "SOURCE_CONFIRMED", "동아리 소개 페이지를 반응형으로 다시 만들었다", [
        cite("pasted", "동아리 홈페이지 리뉴얼 — 모바일 대응은 내가", 10),
      ]),
      exp(162, 12, "LEARNING", "ME", "USER_ENTERED", "코드 리뷰를 처음 받아 보며 PR 을 작게 나누는 습관이 생겼다", [
        cite("pasted", "처음으로 코드리뷰 받아봄", 11),
      ], "USER"),
    ],
  },
  {
    id: 13,
    name: "현장실습 — 핀테크 스타트업 프론트엔드",
    period: { start: "2026-01", end: "2026-02", ongoing: false },
    experiences: [
      exp(171, 13, "IMPLEMENTATION", "ME", "SOURCE_CONFIRMED", "송금 내역 화면의 무한 스크롤을 고쳤다", [
        cite("pasted", "송금내역 무한스크롤 버그 수정", 15),
      ]),
      exp(172, 13, "COLLABORATION", "TEAM", "NEEDS_REVIEW", "디자이너와 매주 화면 검수 회의를 했다", [
        cite("pasted", "디자이너랑 주 1회 화면 검수", 16, null),
      ]),
    ],
  },
  {
    id: 14,
    name: "졸업 프로젝트 「모아봄」",
    period: { start: "2026-03", end: null, ongoing: true },
    experiences: [
      exp(181, 14, "IMPLEMENTATION", "ME", "SOURCE_CONFIRMED", "사진을 날짜별로 묶어 보여 주는 타임라인 화면을 만들고 있다", [
        cite("moabom", "타임라인 화면(날짜별 사진 묶음) — 담당: 나", 8),
      ]),
      exp(182, 14, "PROBLEM_SOLVING", "TEAM", "SOURCE_CONFIRMED", "중간 발표에서 업로드가 느리다는 지적을 받고 이미지 압축을 넣었다", [
        cite("moabom", "중간발표 피드백: 업로드 느림 → 업로드 전 이미지 압축 추가", 14),
      ]),
      exp(183, 14, "COLLABORATION", "TEAM", "SOURCE_CONFIRMED", "이슈와 PR 로 일을 나눈다", [
        cite("moabom", "작업은 GitHub 이슈 · PR 단위로 나눈다.", 20),
      ]),
    ],
  },
  {
    id: 15,
    name: "기술 블로그",
    period: { start: null, end: null, ongoing: false },
    experiences: [
      exp(191, 15, "LEARNING", "ME", "SOURCE_CONFIRMED", "프로젝트에서 겪은 문제를 글로 정리한다", [
        cite("notes2024", "틈틈이 블로그에 트러블슈팅 글 씀", 20),
      ]),
    ],
  },
  {
    // 이력서 항목처럼 원본에 이름 · 기간만 있는 활동 — AI 는 경험을 지어내지 않고 활동만 돌려준다 (SPEC S-03 · FE#22)
    id: 17,
    name: "정보처리기사 필기 준비",
    period: { start: "2025-02", end: "2025-04", ongoing: false },
    experiences: [],
  },
];
