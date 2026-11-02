# FE #7 자료 등록·분석 작업 API

2026-11-02에 BE 최신 main `fbef4f9cda3b2f6553442f292be0c0b0ea73d602`와 ETC 최신 main의 `docs/contracts/experience-api.md`(파일 SHA `9436199c10b3762290b6a3a9782a9c42d5959786`), `docs/ai-scope.md` §3(파일 SHA `80d3f2d69cdb149fc8ef3b854c5b9dcd5a112109`)을 직접 읽어 대조했다. BE·ETC·기존 PR은 수정하지 않았다.

## 직접 확인한 BE 구현

경로는 BE의 `src/main/java/com/woowangthon/backend/` 아래다.

- `job/JobController.java`: 자료 등록, 작업 조회, 재시도의 HTTP 메서드·경로·202/200 상태
- `job/AnalysisService.java`: `SourceRequest(kind, name, text)`, 원본 저장, 50,000자 검증, 같은 작업 재시도, 결과 저장
- `job/JobResponses.java`: 등록 응답과 상태 응답 DTO
- `job/AnalysisJob.java`: 분석 중·완료·실패 전이, 오류와 결과 ID 유지
- `job/ExtractionRunner.java`, `ai/AiClient.java`: 실제 AI 서버 `POST /extract`, 실패·타임아웃 분류
- `common/GlobalExceptionHandler.java`: `{ error: { code, message } }` 오류 응답
- 기존 `activity/ActivityController.java`, `ActivityResponses.java`, `ActivityService.java`와 `experience/ExperienceController.java`, `ExperienceResponse.java`, `ExperienceService.java`: 기존 4개 조회·수정 API 계약 유지 확인

[BE 구현](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_BE/tree/fbef4f9cda3b2f6553442f292be0c0b0ea73d602/src/main/java/com/woowangthon/backend)과 [ETC 계약](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/blob/main/docs/contracts/experience-api.md)의 이번 3개 API 경로·JSON 구조·오류 코드는 일치한다. 기간 비교도 이후 PM 확정대로 BE와 동일한 공통 길이 비교·연도 0000 허용을 FE에 반영했다. 이전 검증 문서의 기간 항목에 수정 결과를 기록했다.

## 실제 요청·응답

기본 주소 예: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api`. 인증 헤더는 추가하지 않는다. 모든 요청은 기존 공통 오류 처리와 `cache: "no-store"`를 사용한다.

| API | 요청 | 성공 응답 |
| --- | --- | --- |
| POST `/api/sources` | JSON `{ kind: "TEXT", name: null, text: "원본" }` 또는 `{ kind: "FILE", name: "notes.md", text: "원본" }` | 202 `{ sourceId: number, jobId: number, status: "ANALYZING" }` |
| GET `/api/jobs/{jobId}` | 본문 없음 | 200 아래 `Job` |
| POST `/api/jobs/{jobId}/retry` | 본문 없음 | 202 아래 `Job`, `status: "ANALYZING"`, `error: null` |

`Job`은 계약의 필드를 그대로 사용한다.

```typescript
{
  jobId: number;
  sourceId: number;
  status: "ANALYZING" | "COMPLETED" | "FAILED";
  activityIds: number[];
  error: { code: string; message: string } | null;
  createdAt: string; // ISO 8601 + 시간대
  updatedAt: string;
}
```

- `.md`·`.txt`는 브라우저에서 읽어 JSON의 text로 전송한다. multipart를 만들지 않는다.
- `text.length > 50000`을 차단한다. Java `String.length()`와 같은 UTF-16 단위라 이모지 25,000개는 한도 안, 이모지 25,000개와 영문 1자는 한도 밖이다.
- 등록 오류: 400 `EMPTY_TEXT`, `UNSUPPORTED_FILE_TYPE`, `INVALID_REQUEST`; 413 `TEXT_TOO_LONG`.
- 작업 오류: 404 `JOB_NOT_FOUND`; 재시도 409 `JOB_NOT_FAILED`.
- 작업 자체의 실패는 HTTP 오류와 구분한다. GET 200의 `status: "FAILED"`, `error.code`가 `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_FAILED`, `INTERNAL_ERROR`일 때 실패 이유와 재시도를 표시한다.
- `COMPLETED`인데 `activityIds: []`면 실패가 아닌 빈 결과 안내다. 임의의 활동을 생성하지 않는다.

## 화면·복원·재시도

- 등록 중 중복 제출을 막고 실패하면 입력과 서버 오류를 유지한다. 202 응답의 jobId로 상태 조회를 시작한다.
- 첫 조회는 즉시, 분석 중이면 응답 후 2초 뒤 다음 GET을 보낸다. 완료·실패·조회 오류에서 자동 폴링을 멈춘다.
- localStorage에는 원본 텍스트 대신 `{ jobId, name }`만 저장한다. API 주소별 키와 목 전용 키를 분리하고 저장소 값을 검증한다. 서버가 확인되지 않는 예전 공용 키는 실제 서버의 작업으로 추측해 복원하지 않는다.
- 새로고침하면 POST를 반복하지 않고 저장된 작업의 GET으로 현재 상태를 확인한다. 서버에 없는 작업은 복원 대상에서 빼고 오류를 표시한다. 저장소 접근이 막힌 환경에서는 같은 페이지의 분석은 가능하지만 새로고침 복원은 보장되지 않는다.
- 재시도는 새 원본·새 작업을 만들지 않고 같은 jobId에 본문 없는 POST를 보낸다. 중복 재시도를 막으며 409 등 실패 메시지와 상태 재확인을 제공한다.
- 작업 전환·알림 닫기·unmount 뒤의 오래된 GET 응답은 상태나 완료 알림을 덮지 않는다.
- 실제 모드에서 완료하면 활동 목록을 다시 GET한다. 선택된 활동이 있으면 상세를 다시 GET하고, 선택이 없으면 서버가 반환한 새 활동 중 하나의 상세를 연다. 목록 갱신 실패는 별도 오류로 표시한다.
- 기존 경험 수정의 nullable 관점·출처 상태·근거 유지와 PATCH 응답 기반 갱신은 유지한다.

## AI와 목 데이터 구분

최신 BE의 `AiClient`는 `AI_BASE_URL`에 실제 HTTP 요청을 보낸다. 기본 주소는 `http://localhost:8000`, 제한 시간은 120초다. AI 서버가 없으면 `AI_UNAVAILABLE` 실패를 남기며 고정 결과로 대체하지 않는다. FE는 서버의 `COMPLETED` 응답 전에는 분석 완료를 표시하지 않는다. 실제 AI 모델 실행과 결과 품질은 이번 자동 테스트로 검증한 것이 아니다.

API 주소가 없는 개발용 목 모드에서는 기존 타임라인·자료 분석 모의를 유지하고 화면에 목임을 표시한다. 실제 API 실패 시 이 코드로 돌아가지 않는다. 코드 검색 결과 `timeline-activities`, `source-analysis`는 모두 이 모드에서 여전히 사용하므로 제거할 미사용 마커는 없다.

ETC는 읽기 전용이므로 변경하지 않았다. `docs/ai-scope.md` §3에서 다음 두 행은 갱신이 필요하다.

| ID | 필요한 설명 변경 |
| --- | --- |
| `timeline-activities` | 「BE 대신 반환, FE#7에서 제거」를 「API 주소 없는 개발용 목 조회, 실제 API 실패 대체 아님」으로 갱신 |
| `source-analysis` | 「BE API 대신 모의, FE#7에서 제거」를 「API 주소 없는 개발용 목 등록·분석·재시도, 실제 모드에서는 서버 사용」으로 갱신 |

두 마커를 나중에 완전히 제거한다면 코드와 ETC §3 행을 함께 제거해야 한다. 이번에는 기존 목 기능 유지 요구에 따라 코드를 남겼다.

## 검증과 남은 항목

자동 테스트는 계약에 맞춘 테스트 응답을 사용한다. 실제 BE·DB·AI 통합 성공으로 표시하지 않는다. 테스트는 등록 JSON, 파일 읽기, UTF-16 한도, 상태 폴링·중단, 새로고침 복원, 재시도·충돌, 오류·빈 결과, 목록·상세 재조회, 기존 조회·수정 회귀를 포함한다.

- PM 기간 규칙 반영 후 `PW_CHANNEL=msedge npm test` 재검증: API 9개 + 데스크톱·모바일 36개, 총 45개 통과.
- `TEST_MOCK=1 PW_CHANNEL=msedge npm test -- --project=desktop --project=mobile`: 기존 목 기능 회귀 4개 통과.
- `npm.cmd run check`: lint·타입 검사·운영 빌드 통과. Windows PowerShell 실행 정책 때문에 동일 npm 명령을 `.cmd`로 실행했다.

이번 세션의 `http://localhost:8080/api/activities` 실제 요청은 `ECONNREFUSED`였다. 따라서 실제 서버의 POST/GET/재시도 성공, DB 저장·새로고침 후 영속성, AI 서버·모델 호출, CORS·Cloudflare Access 통합은 미검증이다. 실행 환경에서 BE README대로 DB·BE와 AI 서버를 준비한 뒤 검증해야 한다. BE·ETC 코드나 배포·Vercel 설정은 변경하지 않았다.
