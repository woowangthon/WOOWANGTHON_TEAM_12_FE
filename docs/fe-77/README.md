# FE #77 — 활동 세부 「그때의 나」

기준: ETC SPEC §0 · R-05 F-13 S-34, `experience-api.md`의 `ActivitySummary.note` · `PATCH /api/activities/{id}`, FE #77 최신 댓글의 [확정 계약 PR #121](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/pull/121).

시작 시 `feat/77-activity-note` 브랜치의 작업 트리는 깨끗했다. 최신 `origin/main`(`6f0a8fe`)으로 fast-forward한 뒤 기존 브랜치에서 작업했다. 새 worktree는 만들지 않았으며, 구현 확인 후 사용자 요청에 따라 #77 관련 파일만 커밋한다. Push·PR 생성·Merge는 하지 않는다.

## 사용자 흐름

`/experience` → 활동 선택 → 활동 머리말과 경험 목록 사이의 「그때의 나」.

- 빈 메모는 「계기 · 생각 — 남기고 싶을 때만」과 작성 진입점만 표시한다. 경고·진행률·알림·작성 독촉은 없다.
- 작성 → 저장된 한 줄 + 「내가 입력」. 고치기 → 저장 / 취소. 지우기 → 서버 응답을 받은 뒤 빈 영역으로 돌아간다.
- 경험·원문·보완 데이터는 바꾸지 않으며, 이 메모를 추천 근거로 추가하지 않는다.
- 이슈의 `docs/design/chagok/timeline.html`은 현재 없고, 시안의 활동 세부는 `experience.html`과 `mock.js`의 `refl`에 있다. 해당 배치를 따르되 이어짐 제안은 구현하지 않았다.

## 계약·요청·오류 처리

작성·수정·삭제 모두 기존 API 클라이언트 `updateActivity`와 실제 `PATCH /api/activities/{id}`를 사용한다.

```json
{ "note": "문제만 풀다 보니 직접 서비스를 만들어 보고 싶어졌다" }
```

```json
{ "note": "다시 정리한 당시 생각" }
```

```json
{ "note": null }
```

문자열은 앞뒤 공백을 제거하고, 공백만 있거나 삭제하면 `null`을 보낸다. 정리한 문자열의 JS `length`가 200을 넘거나 CR/LF가 있으면 HTTP 요청 전에 막는다. 줄바꿈을 포함한 붙여넣기는 원래 입력을 유지하며 안내한다. 안내는 「앞뒤 공백을 뺀 200자까지 · 줄바꿈 없이 한 줄」이다. 정리한 값이 저장된 값과 같으면 요청하지 않는다.

기존 이름·기간 편집은 `note`를 싣지 않아 그대로 유지한다. `ActivitySummary`·활동 세부 타입에 `note`를 추가했으며, 기존 목/이전 서버의 조회 응답 호환을 위해 생략도 허용한다. 메모를 PATCH할 때는 실제 응답에 문자열 또는 `null`인 `note`가 있어야 저장 완료로 처리한다. 필드가 빠진 구버전 응답이면 `INVALID_RESPONSE`로 안내하며 입력을 유지한다.

저장 중 입력·버튼을 비활성화하고 ref로 중복 제출을 막는다. 서버 오류·연결 오류는 기존 API 오류 메시지를 표시하고 「다시 시도」로 같은 `note`를 다시 요청한다. 입력을 고치면 이전 실패 요청의 재시도는 취소한다. 실패한 삭제는 기존 메모를 그대로 표시한다. 성공을 낙관적으로 표시하지 않는다.

저장된 `note`는 서버 응답으로 목록·세부 상태의 같은 활동 ID에만 반영한다. 메모 PATCH 응답에 담긴 이름·기간·경험 수로 다른 편집을 덮지 않는다. 저장과 조회가 교차하면 저장 뒤에 도착한 옛 GET이 메모를 되돌리지 않도록 저장 응답을 보존한다. 다음 정상 조회에서는 다시 서버 값을 따른다.

## 실제 BE와 목 구분

제품용 목 응답·새 목 데이터·가짜 저장 성공을 추가하지 않았다. 기존 `src/lib/mock/activities.ts`도 수정하지 않았다. API 주소가 없는 기존 목 모드에서는 메모 저장도 기존처럼 `API_NOT_CONFIGURED`로 실패하며 내용과 재시도를 유지한다. ETC `docs/ai-scope.md` 신규 등록은 필요하지 않다.

로컬 BE `http://localhost:8080/api/auth/me`는 HTTP **401**을 반환했다. 서버는 실행 중이지만 사용할 인증 세션·계정 정보가 제공되지 않아 실제 BE의 작성 → 새로고침 → 수정 → 삭제 지속성은 확인하지 못했다. 비밀 설정 파일을 읽거나 계정을 임의로 만들지 않았다. 아래 Playwright의 저장·재조회 검증은 시험 전용 HTTP 응답에 대한 검증이며 실제 DB 영속성 검증과 구분한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/components/experience/activity-note.tsx` | 독립된 메모 영역·입력·저장·취소·삭제·재시도 |
| `src/components/experience/activity-detail.tsx` | 머리말 아래에 메모 영역 배치 |
| `src/components/experience/timeline-screen.tsx` | note 전용 상태 갱신·늦은 조회 응답 보호 |
| `src/lib/api/types.ts` | 활동 응답·PATCH 요청의 note 타입 |
| `src/lib/api/editing.ts` | 200자·줄바꿈 검증 공통 함수 |
| `src/lib/api/experience.ts` | 실제 PATCH에서 note 정규화·검증·응답 확인 |
| `tests/activity-note.spec.ts` | 화면·요청·실패·전환·경합·반응형 검증 |
| `tests/api.spec.ts` | note 요청 계약·입력 제약·오류 전파 검증 추가 |
| `playwright.config.ts` | 기존 desktop/mobile 프로젝트에 화면 시험 등록 |
| `docs/fe-77/README.md` · `activity-note-{1440,1024,390}.png` | 작업 설명·시험 기록·캡처 |

## 자동화 검증

결과: **90개 모두 통과**(4.3분, Chrome). 새 메모 검증 15개와 기존 활동·경험·보완 편집/API 회귀 75개가 통과했다. `npm.cmd run check`의 lint·typecheck·production build와 `git diff --check`도 모두 통과했다. 화면 1440·1024·390px에서 가로 넘침 검증을 통과하고 캡처를 확인했다. 기존 개발 서버의 홈 instant-navigation·로고 비율 경고는 이번 범위 밖이어서 변경하지 않았다.

새 시나리오: API 3개 + 화면 6개 × PC·모바일 = **15개**. 기존 활동·경험 편집과 API 검증도 함께 실행한다. 시험용 HTTP 응답은 실제 API 모드에서 Playwright가 가로채며 제품 코드가 사용하지 않는다.

```powershell
$env:PW_CHANNEL='chrome'
$env:UPDATE_NOTE_SCREENSHOTS='1'
npx.cmd playwright test activity-note.spec.ts api.spec.ts editing.spec.ts --reporter=list --max-failures=3
npm.cmd run check
git diff --check
```

스크린샷은 시험용 활동·시험 계정만 포함한다. 1024px는 FE AGENTS의 세 화면 폭 지침에 따라 확인한다.

- [PC 1440](activity-note-1440.png)
- [PC 1024](activity-note-1024.png)
- [모바일 390](activity-note-390.png)

남은 확인: 인증된 로컬 BE 환경의 실제 저장 지속성. 이어짐(S-35)·AI 계기 생성·타임라인 메모 표시는 이번 변경 범위에 포함하지 않는다.
