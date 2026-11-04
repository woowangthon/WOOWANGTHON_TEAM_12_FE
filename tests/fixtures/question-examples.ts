// 시험용 — ETC question-api.md 문항 41·42 의 예시 JSON. 시험의 가짜 BE(fake-question-api.ts)가 돌려준다. 제품 코드는 쓰지 않는다.
// competenciesBy는 experience-api.md에 따라 AI. 예시의 순서·문구·근거 ID·보완 관계를 보존한다.
import type { QuestionDetail } from "../../src/lib/api/question-types";

export const QUESTION_EXAMPLES: QuestionDetail[] = [
  {
    "id": 41,
    "applicationId": 21,
    "organization": "OO 백엔드 부트캠프",
    "text": "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요.",
    "status": "COMPLETED",
    "error": null,
    "requirements": [
      {
        "text": "기술 문제의 원인을 찾아 해결한 경험",
        "status": "SUPPORTED",
        "experienceIds": [
          101
        ]
      },
      {
        "text": "해결한 뒤 결과를 확인한 방법",
        "status": "NOT_FOUND",
        "experienceIds": []
      },
      {
        "text": "Java · Spring 사용 경험",
        "status": "NOT_FOUND",
        "experienceIds": []
      }
    ],
    "recommendations": [
      {
        "activity": {
          "id": 7,
          "name": "바꿔요 — 캠퍼스 중고거래 앱",
          "period": {
            "start": "2025-03",
            "end": "2025-06",
            "ongoing": false
          }
        },
        "experience": {
          "id": 101,
          "activityId": 7,
          "content": "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
          "competencies": [
            "PROBLEM_SOLVING",
            "IMPLEMENTATION"
          ],
          "actor": "ME",
          "sourceStatus": "SOURCE_CONFIRMED",
          "citations": [
            {
              "id": 201,
              "sourceId": 12,
              "sourceName": "바꿔요-회고.md",
              "quote": "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.",
              "matched": true,
              "location": {
                "startLine": 5,
                "endLine": 5
              }
            }
          ],
          "supplements": [
            {
              "id": 301,
              "question": "폴링을 WebSocket 으로 바꿀 때 직접 고친 부분은 어디였나요?",
              "answer": "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다",
              "questionId": 41,
              "createdAt": "2026-11-04T10:05:00+09:00",
              "updatedAt": "2026-11-04T10:05:00+09:00"
            }
          ],
          "competenciesBy": "AI"
        },
        "reason": "채팅 지연이라는 기술 문제를 직접 해결한 사례라 문항과 맞는다",
        "emphasis": "폴링의 한계를 보고 WebSocket 으로 바꾼 판단",
        "evidence": [
          {
            "type": "CITATION",
            "id": 201
          }
        ],
        "gaps": [
          "직접 고친 범위가 자료에 없다",
          "고친 뒤 확인한 방법이 자료에 없다"
        ]
      }
    ],
    "clarifications": [
      {
        "id": 61,
        "experienceId": 101,
        "question": "폴링을 WebSocket 으로 바꿀 때 직접 고친 부분은 어디였나요?",
        "supplementId": 301
      },
      {
        "id": 62,
        "experienceId": 101,
        "question": "바꾼 뒤 메시지가 제때 오는지 어떻게 확인했나요?",
        "supplementId": null
      }
    ],
    "createdAt": "2026-11-04T10:00:00+09:00",
    "updatedAt": "2026-11-04T10:00:24+09:00"
  },
  {
    "id": 42,
    "applicationId": 22,
    "organization": "OO 연합 동아리",
    "text": "팀 프로젝트에서 맡은 역할과, 팀과 함께 일한 방식을 적어 주세요.",
    "status": "COMPLETED",
    "error": null,
    "requirements": [
      {
        "text": "팀에서 내가 맡은 역할",
        "status": "SUPPORTED",
        "experienceIds": [
          101
        ]
      },
      {
        "text": "팀과 함께 일한 방식",
        "status": "PARTIAL",
        "experienceIds": [
          102
        ]
      }
    ],
    "recommendations": [
      {
        "activity": {
          "id": 7,
          "name": "바꿔요 — 캠퍼스 중고거래 앱",
          "period": {
            "start": "2025-03",
            "end": "2025-06",
            "ongoing": false
          }
        },
        "experience": {
          "id": 102,
          "activityId": 7,
          "content": "매주 금요일 스프린트 회고를 했다",
          "competencies": [
            "COLLABORATION"
          ],
          "actor": "TEAM",
          "sourceStatus": "SOURCE_CONFIRMED",
          "citations": [
            {
              "id": 202,
              "sourceId": 12,
              "sourceName": "바꿔요-회고.md",
              "quote": "팀은 매주 금요일 스프린트 회고를 했다.",
              "matched": true,
              "location": {
                "startLine": 6,
                "endLine": 6
              }
            }
          ],
          "supplements": [],
          "competenciesBy": "AI"
        },
        "reason": "팀이 매주 회고로 일하는 방식을 맞춘 사례다",
        "emphasis": "정기 회고로 진행을 함께 점검한 방식",
        "evidence": [
          {
            "type": "CITATION",
            "id": 202
          }
        ],
        "gaps": [
          "회고에서 내가 맡은 몫이 자료에 없다"
        ]
      },
      {
        "activity": {
          "id": 7,
          "name": "바꿔요 — 캠퍼스 중고거래 앱",
          "period": {
            "start": "2025-03",
            "end": "2025-06",
            "ongoing": false
          }
        },
        "experience": {
          "id": 101,
          "activityId": 7,
          "content": "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
          "competencies": [
            "PROBLEM_SOLVING",
            "IMPLEMENTATION"
          ],
          "actor": "ME",
          "sourceStatus": "SOURCE_CONFIRMED",
          "citations": [
            {
              "id": 201,
              "sourceId": 12,
              "sourceName": "바꿔요-회고.md",
              "quote": "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.",
              "matched": true,
              "location": {
                "startLine": 5,
                "endLine": 5
              }
            }
          ],
          "supplements": [
            {
              "id": 301,
              "question": "폴링을 WebSocket 으로 바꿀 때 직접 고친 부분은 어디였나요?",
              "answer": "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다",
              "questionId": 41,
              "createdAt": "2026-11-04T10:05:00+09:00",
              "updatedAt": "2026-11-04T10:05:00+09:00"
            }
          ],
          "competenciesBy": "AI"
        },
        "reason": "팀에서 실시간 채팅 기능을 직접 맡아 고친 역할이 드러난다",
        "emphasis": "서버 엔드포인트와 앱 코드를 모두 맡은 범위",
        "evidence": [
          {
            "type": "CITATION",
            "id": 201
          },
          {
            "type": "SUPPLEMENT",
            "id": 301
          }
        ],
        "gaps": []
      }
    ],
    "clarifications": [
      {
        "id": 63,
        "experienceId": 102,
        "question": "매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?",
        "supplementId": null
      }
    ],
    "createdAt": "2026-11-04T10:20:00+09:00",
    "updatedAt": "2026-11-04T10:20:19+09:00"
  }
];
