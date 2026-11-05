# FE #75 — 답변 초안 실제 API 연결

기준: SPEC §0 · R-03 F-09 S-27, ETC `question-api.md`의 Draft 계약, UNKNOWN 수행 주체 변경 [ETC PR #136](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/pull/136), 화면 선행 [FE PR #100](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_FE/pull/100).

시작 시 `feat/75-draft-api`는 미커밋 변경이 없었다. #74가 반영된 최신 `origin/main`(`847247e`)까지 fast-forward한 뒤 같은 브랜치에서 작업했다. 새 브랜치·worktree는 만들지 않았으며, 구현 확인 후 사용자 요청에 따라 #75 관련 파일만 커밋한다. Push·PR 생성·Merge는 하지 않는다. BE #45와 AI #26의 GitHub 완료 상태를 확인했으나 로컬 서버의 버전·실제 AI 호출 검증과는 구분한다.

## 사용자 흐름과 계약

추천 경험 1~3개 선택 → 실제 `POST /api/questions/{questionId}/draft` → 202 `Draft(ANALYZING)` → `GET /api/questions/{id}`의 `draft` 폴링 → COMPLETED / FAILED → 근거 확인·문장만 복사 / 다시 만들기.

요청 본문은 아래 한 필드뿐이다. 0개·4개 이상·중복·비추천 경험은 HTTP 전에 막는다. 질문 문맥은 추천 ID 검증에만 사용하며 HTTP 요청에 싣지 않는다.

```json
{ "experienceIds": [101] }
```

- 기존 `Draft`·`DraftEvidence` 타입과 문장·근거·omitted·복사 UI를 재사용한다. 실제 응답의 문장과 `evidence[].text`를 그대로 표시하며 FE에서 생성하거나 문장을 재작성하지 않는다.
- 실패 재생성은 기본적으로 서버의 실패한 `draft.experienceIds`로 같은 POST를 사용한다. 선택 오류가 있으면 경험을 다시 골라 요청할 수 있다. 완료 초안도 같은 POST로 대체한다. 생성 중에는 과거 문장·복사 버튼을 새 결과처럼 표시하지 않는다.
- `CITATION`은 원문, `SUPPLEMENT`와 `EXPERIENCE`는 「내가 입력」으로 구분한다. 자료 이름·보완 질문은 문항 추천의 같은 ID에서 보충하고, 본문은 서버 evidence의 text를 쓴다. 연결이 사라져도 안전한 기본 표시가 있다.
- 근거 0개, 문장 0개, omitted만 있는 결과와 복사 실패 처리를 유지한다.
- UNKNOWN을 「팀은」이나 「제가」로 변환하는 FE 로직은 없다. 주체를 비운 서버 문장을 그대로 표시하는 시험을 추가했다. TEAM 규칙이나 AI 생성 로직은 바꾸지 않았다.

## 폴링·새로고침·오류

별도 초안 GET API·컴포넌트 자체 폴링·localStorage를 추가하지 않았다. `useApplications`가 가진 문항 상태와 GET 폴링을 사용한다.

- 문항 분석 또는 `draft.status`가 ANALYZING인 문항만 **2초 간격**으로 조회한다. 완료·실패면 멈춘다. 새로고침 시 기존 URL의 문항을 GET하고 ANALYZING이면 이어서 폴링한다.
- 기존 generation 번호표와 effect 정리를 사용해 늦은 응답을 버린다. POST 응답의 draft만 해당 문항 ID에 적용하고, 추천·보완을 덮지 않는다. 탭을 옮겨도 이전 요청은 이전 문항에만 반영한다. 화면을 떠난 후 응답은 적용하지 않는다.
- 컴포넌트의 pending ref와 훅의 문항별 진행 요청 Set으로 중복 POST를 막는다. Set은 요청 중복 방지용이며 초안 결과·이력 저장소가 아니다.
- 일시적 GET 실패는 받은 결과를 보존하며 다시 확인한다. **연속 3회 실패한 문항만 자동 확인을 중단**하고 기존 「다시 불러오기」로 상태 조회를 재개한다. 서버의 생성 작업을 다시 실행하지 않는다.
- 400 INVALID_REQUEST는 경험 재선택, 404 QUESTION_NOT_FOUND는 문항 확인, 409 QUESTION_NOT_COMPLETED는 분석 완료 대기, 429 DAILY_LIMIT_EXCEEDED는 하루 분석 횟수 안내를 표시한다. 기존 초안은 요청이 거절되면 그대로 둔다.
- 409 DRAFT_IN_PROGRESS는 즉시 GET으로 현재 문항을 읽고 진행 중인 draft의 폴링에 합류한다. 별도 retry POST는 없다.
- 네트워크 오류 등 생성 요청 결과가 불확실하면 「초안 상태 확인」으로 POST를 반복하지 않고 GET할 수 있다.
- FAILED의 AI_TIMEOUT·AI_UNAVAILABLE·AI_FAILED와 서버 오류 메시지를 표시하고 다시 만들기를 제공한다. 공통 request의 세션 쿠키·401 인증 만료 처리를 그대로 사용한다.

## 목 제거와 ETC 후속 작업

삭제: `src/lib/mock/question-draft.ts` 전체. 제거: 제품 코드와 시험의 초안 목 마커, 목 모드 배지·고지·실패 재현 선택, 고정 성공 문장, 브라우저 메모리 작업 저장소와 500ms 목 폴링, `fetchDraftQuestion` 목 조회 함수.

기존 다른 기능의 목은 바꾸지 않았다. 고정 계약 예시는 **시험 전용** `tests/fixtures/draft-example.ts`로 옮겨 모의 HTTP 응답에만 사용한다. 제품 코드에서 이 fixture를 가져오지 않는다. #74 설명과 캡처는 과거 기록임을 표시해 남겼다.

ETC 문서는 수정하지 않았다. 최신 ETC `origin/main`의 `docs/ai-scope.md` **§3 표에서 ID가 `question-draft`인 아래 한 행만 삭제**하는 별도 PR이 필요하다. 다른 등록 행·§2 모델 기록은 삭제하지 않는다.

| ID | 종류 | 레포 · 위치 | 무엇이 가짜 · 준비된 것인가 | 시연에 나오나 |
| --- | --- | --- | --- | --- |
| `question-draft` | MOCK | `FE src/lib/mock/question-draft.ts` · `src/lib/api/questions.ts` · `src/components/questions/answer-draft.tsx` · `tests/answer-draft*.spec.ts` | FE#74 답변 초안만 브라우저 메모리에서 생성 요청·문항 draft 폴링·완료·실패·재생성을 재현한다. 계약 A(경험 101·근거 201·보완 301)의 두 문장 또는 선택한 경험의 확인된 발췌·보완·직접 입력 본문을 사용하며 실제 BE·AI 호출이나 서버 저장은 없다. 화면에 「초안 목 모드」와 실패 재현 선택을 표시한다. 문항별 최신 하나만 유지하고 새로고침하면 사라진다. 기존 추천·되묻기·보완 실제 API는 그대로이며 실패 대체용이 아니다. 실제 연결은 FE#75 | 시연 사용 시 영상에 「모킹」 표시 — 실제 시연 여부 미정 |

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/lib/api/questions.ts` | 실제 초안 POST·선택 검증, 목 조회 함수 제거 |
| `src/lib/mock/question-draft.ts` | 삭제 |
| `src/components/questions/use-applications.ts` | 문항 폴링에 draft 포함·생성·상태 재조회·중복 방지 |
| `src/components/questions/answer-draft.tsx` | 서버 draft 표시·실제 요청 핸들러·오류 안내, 목 UI/폴링 제거 |
| `src/components/questions/application-screen.tsx` · `src/components/questions/question-result.tsx` | 기존 화면에 생성·재조회 핸들러 연결 |
| `tests/fake-question-api.ts` · `tests/fixtures/draft-example.ts` | 시험 전용 POST·GET 초안 계약 응답 |
| `tests/answer-draft-api.spec.ts` · `tests/answer-draft.spec.ts` | 목 직접 호출 시험을 모의 HTTP 시험으로 전환·확장 |
| `tests/question-matching.spec.ts` | 실제 초안 모드의 회귀 검증 |
| `docs/fe-74/README.md` | 과거 기록임을 표시 |
| `docs/fe-75/README.md` · `http-draft-{1440,1024,390}.png` | 작업·검증·ETC 후속 기록 및 HTTP 시험 캡처 |

## 검증과 캡처

최종 결과: **96개 통과 · 기존 제외 1개**(Chrome, 6.1분). 초안 계약/API 3개와 화면 19개 × PC·모바일 = 초안 관련 **41개**, 기존 문항 추천·되묻기/API 회귀 **55개**가 통과했다. 기존 모바일의 `add source from the application screen...` 제외는 유지했다.

`npm.cmd run check`: lint·typecheck·production build 모두 통과(exit 0). `git diff --check`: 통과. `src`·`tests`에서 초안 목 마커·목 모듈 참조·`fetchDraftQuestion`이 남지 않았음을 확인했다. 1440·1024·390px의 캡처·가로 넘침 검증을 통과했다. 기존 개발 서버의 홈 instant-navigation·로고 비율 경고는 변경하지 않았다.

```powershell
$env:PW_CHANNEL='chrome'
$env:UPDATE_DRAFT_SCREENSHOTS='1'
npx.cmd playwright test answer-draft.spec.ts answer-draft-api.spec.ts question-matching.spec.ts question-api.spec.ts --reporter=list --max-failures=3
npm.cmd run check
git diff --check
```

아래 이미지는 **모의 HTTP 응답 기반** 캡처다. 실제 BE·AI 연동 결과가 아니다. 시험 활동·시험 계정만 사용한다.

- [HTTP 시험 PC 1440](http-draft-1440.png)
- [HTTP 시험 PC 1024](http-draft-1024.png)
- [HTTP 시험 모바일 390](http-draft-390.png)

## 실제 연동에서 확인하지 못한 것

로컬 `http://localhost:8080/api/auth/me`는 HTTP **401**을 반환했다. 인증된 세션·테스트 계정이 제공되지 않아 실제 BE·AI에 문항 생성·되묻기 답변·초안 생성을 보내지 못했다. 계정을 임의로 만들거나 비밀 설정 파일을 읽지 않았다.

따라서 실제 환경의 문항 A → 추천 → 되묻기 답변 → 초안 → 원문/보완 근거와 omitted 확인 → 복사 데모, 실제 분석 한도 차감, DB 저장 후 새로고침 복원과 실제 데이터 캡처는 **미검증**이다. 계약 예시 ID 101·201·301이나 문장이 실제 AI에서도 그대로 나온다고 가정하지 않는다.

남은 완료 조건: 인증된 실제 BE·AI 데모 및 실제 데이터 캡처, 별도 ETC PR에서 위 등록 행 삭제. FE 구현·HTTP 시험과 이 두 후속 항목을 구분한다.
