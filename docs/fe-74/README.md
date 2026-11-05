# FE #74 — 답변 초안 목

> 이 문서는 #74 당시의 목 구현 기록이다. #75에서 제품용 초안 목·실패 재현·메모리 폴링을 제거하고 실제 API로 전환했다. 현재 동작과 ETC 등록 삭제 대상은 [FE #75 작업 기록](../fe-75/README.md)을 따른다. 아래 목 설명·캡처·등록 행은 과거 기록이며 현재 제품 동작이 아니다.

기준: ETC `docs/SPEC.md` §0 · S-23 · S-27, `docs/contracts/question-api.md` 답변 초안 절, [ETC PR #123](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/pull/123). `feat/74-draft-mock` 브랜치에서 작업했다. 사용자 요청에 따라 #74 관련 파일만 커밋하며 Push·PR 생성·Merge는 하지 않는다.

## 화면과 흐름

지원의 완료된 문항 → 결과 본문의 **답변 초안** → 추천 경험 선택(기본 전부, 최대 3개) → 초안 만들기 → 문장별 근거 펼치기 → 텍스트로 복사.

- 시안 `apply.html`처럼 초안을 추천 경험 위에 둔다. 모바일에서도 결과와 근거를 함께 읽도록 본문을 사용한다. 초안 직접 수정·근거 점검·작성 지침은 추가하지 않았다.
- 기존 추천·요구사항·차곡이의 되묻기·보완은 유지한다. 기존 실제 API 함수와 폴링은 변경하지 않았다.
- `CITATION`: 원문과 자료 이름. `SUPPLEMENT`: 내가 입력 + 보완 질문·답. `EXPERIENCE`: 내가 입력 + 직접 넣거나 고친 경험 본문.
- 문장 0개, 근거 삭제로 `evidence: []`, omitted만 있는 결과, 클립보드 거부를 구분한다. 복사에는 `sentences[].text`만 공백으로 이어 넣는다.
- 화면의 **초안 목 모드**, 서버 저장·AI 생성 없음, 새로고침 시 소멸 안내와 **목 결과 / 실패 재현**을 표시한다. 완료 안내는 실제 저장 성공으로 표현하지 않는다.

## 계약과 목 구현

`Draft`는 계약의 `questionId`, `status`, `error`, `experienceIds`, `sentences[{ text, evidence[{ type, id, experienceId, activityId, text }] }]`, `omitted`, `createdAt`, `updatedAt`을 사용한다. `QuestionDetail.draft`는 미생성 시 null이며, 아직 이 필드를 주지 않는 기존 추천 서버와 호환하기 위해 타입에서는 생략도 허용한다.

API 계층의 `createQuestionDraft`가 `{ experienceIds }` 요청으로 `ANALYZING` 결과를 돌려주고, `fetchDraftQuestion`은 문항 응답의 `draft`를 폴링한다. 약 1.5초 뒤 `COMPLETED` 또는 `FAILED(AI_TIMEOUT)`로 전이한다. 문항별 메모리 Map에 최신 하나만 유지한다. 재시도도 같은 생성 함수와 직전 `experienceIds`를 쓴다. 생성 중 중복과 0개·4개 이상·중복·비추천 선택을 검증한다.

확인된 원문(`matched: true`), 선택한 경험의 보완, `USER_ENTERED` 본문만 사용한다. 계약 A의 정확한 근거 201·보완 301이 있으면 계약의 두 문장을 재현하고, 다른 기록은 원래 텍스트를 그대로 사용한다. 새 근거 ID나 사용자 역할·성과·수치를 만들지 않는다. 목의 omitted는 계약 예시 또는 기존 문항의 `NOT_FOUND` 요구사항이며 실제 AI 판단이 아니다.

FE #75에서는 API 계층의 두 목 함수를 실제 `POST /api/questions/{questionId}/draft`와 `GET /api/questions/{id}`에 연결한다. `question` 문맥과 실패 재현 인자는 현재 목 내부에 필요한 값이며 실제 요청 JSON 필드가 아니다. 목 파일·표시·실패 재현 선택을 제거하고 실제 인증·404·429·연결 실패 및 새로고침 후 복원을 검증해야 한다. 초안 UI와 계약 타입은 재사용한다.

## ETC 목 등록 — 별도 PR로 반영할 행

ETC 저장소는 수정하지 않았다. `docs/ai-scope.md` **§3 「목 · 샘플 · 테스트 계정」의 기존 표 마지막 행 다음**에 아래 한 행을 추가한다. 마커 ID는 코드와 동일한 `question-draft`다.

| ID | 종류 | 레포 · 위치 | 무엇이 가짜 · 준비된 것인가 | 시연에 나오나 |
| --- | --- | --- | --- | --- |
| `question-draft` | MOCK | `FE src/lib/mock/question-draft.ts` · `src/lib/api/questions.ts` · `src/components/questions/answer-draft.tsx` · `tests/answer-draft*.spec.ts` | FE#74 답변 초안만 브라우저 메모리에서 생성 요청·문항 draft 폴링·완료·실패·재생성을 재현한다. 계약 A(경험 101·근거 201·보완 301)의 두 문장 또는 선택한 경험의 확인된 발췌·보완·직접 입력 본문을 사용하며 실제 BE·AI 호출이나 서버 저장은 없다. 화면에 「초안 목 모드」와 실패 재현 선택을 표시한다. 문항별 최신 하나만 유지하고 새로고침하면 사라진다. 기존 추천·되묻기·보완 실제 API는 그대로이며 실패 대체용이 아니다. 실제 연결은 FE#75 | 시연 사용 시 영상에 「모킹」 표시 — 실제 시연 여부 미정 |

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/components/questions/answer-draft.tsx` | 초안 화면·선택·상태·근거 상세·복사 |
| `src/components/questions/question-result.tsx` | 기존 추천 앞에 초안 배치 |
| `src/lib/api/question-types.ts` | Draft·근거·생성 요청 타입 |
| `src/lib/api/questions.ts` | 초안 생성·문항 draft 조회 목 진입점 추가 |
| `src/lib/mock/question-draft.ts` | 선택 검증·최신 하나·상태 전이·근거 기반 목 응답 |
| `tests/answer-draft.spec.ts` | PC·모바일 초안 화면 검증·스크린샷 |
| `tests/answer-draft-api.spec.ts` | 요청 검증·계약 상태·선택 경험 격리·근거 삭제/수정 검증 |
| `tests/question-matching.spec.ts` | 초안에만 목 표시가 있는 새 화면을 회귀 검증에 반영 |
| `playwright.config.ts` | 새 테스트를 기존 프로젝트에 등록 |
| `docs/fe-74/README.md` · `draft-{1440,1024,390}.png` | 작업 설명·ETC 등록 행·화면 증빙 |

## 검증과 스크린샷

최종 결과: **73개 통과 · 기존 제외 1개**. 새 초안 18개와 기존 추천·되묻기/API 회귀 55개가 통과했다. 전체 74개 실행에서 71개 통과·1개 제외·2개 실패였으며, 두 실패는 기존의 「화면 전체에 목 표시 없음」 검증이었다. 초안만 목 표시가 있는 새 요구사항을 반영한 뒤 해당 PC·모바일 2개를 다시 실행해 모두 통과했다. 기존 모바일 `add source from the application screen...` 항목의 skip은 유지했다.

`npm.cmd run check`: lint·typecheck·production build 모두 통과(exit 0). `git diff --check`: 통과(exit 0). 1440·1024·390px에서 스크린샷과 가로 넘침 검증을 통과했다. 개발 서버가 출력한 기존 홈 instant-navigation 검증·로고 비율 경고는 범위 밖이어서 변경하지 않았다.

- 새 Playwright: 화면 시나리오 8개 × PC·모바일 + API 계약 시나리오 2개 = 18개.
- 회귀 대상: 기존 `question-matching.spec.ts`, `question-api.spec.ts`.
- 브라우저: 설치된 Chrome (`PW_CHANNEL=chrome`). 기본 Playwright 번들 브라우저는 이 환경에 설치되어 있지 않다.
- `npm.cmd run check`와 `git diff --check`를 실행한다.
- 스크린샷은 계약 예시·시험 계정만 사용한다. 실제 개인 자료·비밀 값은 포함하지 않는다.
- 1024px 캡처는 FE `AGENTS.md`의 「확인 폭 셋」 지침에 따라 PC 확대·사이드바 레일 배치 확인 자료로 함께 포함한다.

```powershell
$env:PW_CHANNEL='chrome'
$env:UPDATE_DRAFT_SCREENSHOTS='1'
npx.cmd playwright test answer-draft.spec.ts answer-draft-api.spec.ts question-matching.spec.ts question-api.spec.ts --reporter=list
npm.cmd run check
git diff --check
```

- [PC 1440](draft-1440.png)
- [PC 1024](draft-1024.png)
- [모바일 390](draft-390.png)
