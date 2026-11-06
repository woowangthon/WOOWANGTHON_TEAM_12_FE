> 초기 구현 및 Mock 회귀 검증 기록입니다. 이후 수행한 실제 BE·AI·DB 검증은 [실제 E2E 보고서](fe-106-real-e2e-report.md)를 기준으로 확인하세요.

# FE #106 구현 보고

브랜치: `feat/106-global-work-status`. 작업 폴더: `WOOWANGTHON_TEAM_12_FE-106`. 기준 main: `809da2d4a4914c857594ebacf7846334d1c75763`.

기본 FE 저장소는 main에 보존했고, 기존 미커밋 변경이 없는 것을 확인한 뒤 별도 worktree에서 작업했습니다. 커밋·Push·PR 생성·Merge는 하지 않았습니다.

## 1. 구현한 기능

- 로그인한 앱의 공통 레이아웃에서 실제 작업 상태를 조회합니다. 진행 중이면 3초, 없으면 30초 후 다음 조회를 예약합니다. 숨겨진 탭은 요청을 취소하고 멈추며, 다시 보이면 즉시 갱신합니다. 조회 중복과 늦은 응답, 로그아웃·언마운트·인증 오류를 처리합니다.
- 공통 상단과 사이드바에서 알림 목록을 엽니다. 다섯 작업 종류와 네 진행 상태를 표시하고, 완료·실패 및 오류 코드를 구분합니다. 서버가 제공하지 않는 진행률·예상 완료 시간은 표시하지 않습니다.
- 최근 소식의 안 읽음을 계산하고 목록을 연 순간 표시한 최신 `finishedAt`으로 읽음을 저장합니다. 빈 목록은 POST하지 않습니다. 이후 도착한 소식, 읽음 요청 중 재열기, GET/POST 응답 순서, 다른 기기의 읽음 변경, ISO 시각의 오프셋과 밀리초 이하 정밀도를 처리합니다.
- 자료는 기존 경험 화면에 분석 상세·결과 활동 링크·기존 재시도를 연결합니다. 문항은 실제 선택 상태와 답·초안 영역으로 이동합니다.
- 차곡이는 기존 패널에서 `runId`로 단계·확인 카드를 복원합니다. 새로고침, 문항 없는 작업, 삭제된 문항의 작업도 지원합니다. 확인·생성·재시도는 사용자 조작으로만 실행됩니다.
- 기존 화면별 상세 폴링과 409 선택지를 유지했습니다. 푸시·메일·새 AI 생성 기능은 추가하지 않았습니다.

## 2. 변경 파일

제품 코드:

- `src/lib/api/work.ts`: 계약 타입, 실제 API, 읽음 경계, 작업별 이동 경로.
- `src/lib/api/http.ts`: 기존 공통 요청에 선택적인 AbortSignal 지원.
- `src/components/work/use-work.ts`: 전역 조회·탭 상태·읽음 저장 수명 관리.
- `src/components/work/work-provider.tsx`: 공통 진행 표시·알림 목록·초점·반응형 UI.
- `src/components/work/source-work-detail.tsx`: 자료 작업 상태·결과·기존 재시도 연결.
- `src/app/(app)/layout.tsx`, `src/components/app-header.tsx`: 공통 틀 및 사이드바 연결.
- `src/components/experience/timeline-screen.tsx`: 실제 자료 작업 상세 연결.
- `src/components/questions/application-screen.tsx`, `use-applications.ts`, `use-chagok-run.ts`, `chagok-panel.tsx`: 문항 이동·영역 초점·차곡이 복원.

검증 및 산출물:

- `tests/global-work.spec.ts`: 전역 작업 20개 시나리오.
- `playwright.config.ts`: 1440/1024/390px 프로젝트.
- `tests/signed-in.ts`: 자동화 전용 기본 빈 작업 응답.
- 기존 테스트 15개 파일의 API 처리기는 `/api/work`를 공통 픽스처로 전달하도록 한 줄씩 보완했습니다: `activity-links.spec.ts`, `activity-note.spec.ts`, `analysis.spec.ts`, `editing.spec.ts`, `entrance.spec.ts`, `experience-management.spec.ts`, `experience-search.spec.ts`, `experience-used-in.spec.ts`, `fake-question-api.ts`, `home.spec.ts`, `period-drag.spec.ts`, `public-profile.spec.ts`, `regroup.spec.ts`, `supplement-editing.spec.ts`, `timeline-applications.spec.ts`.
- `.gitignore`: 검토용 세 스크린샷만 보존하도록 예외 추가.
- `artifacts/fe-106-*.md`, `artifacts/fe-106-test-results.json`, `artifacts/work-work-*-test-api.png`: 보고서·PR 본문·검증 집계·화면.

테스트가 다시 생성한 다른 기능의 기존 스크린샷은 원래대로 복원했습니다. 의존성·잠금 파일과 `.env`, API 키, 서버 설정은 변경하지 않았습니다.

## 3. 실제 BE 연동

제품은 공통 HTTP 요청으로 `GET /api/work`, `POST /api/work/seen`을 사용합니다. 실패 시 가짜 결과로 대체하지 않습니다. API 주소가 없는 기존 목 모드에서는 서버 연결 안내만 표시하며 가짜 진행 작업을 만들지 않습니다.

병합된 BE #88의 코드와 계약을 대조했습니다. 실제 계정 로그인·실제 BE 데이터 생성/수정·실제 AI 호출은 수행하지 않았습니다. 자동화 검증의 API 응답과 계정은 모두 시험용입니다.

## 4. 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npm run check` | lint · 타입 검사 · 프로덕션 빌드 통과 |
| 전역 작업 Playwright | 20개 × 1440/1024/390px = 60개 통과 |
| 정밀 ISO 시각 경계 추가 검증 | 세 폭에서 3개 통과 |
| 전체 Playwright | 총 638개: 600 통과 · 19 건너뜀 · 19 실패 |
| 원본 main 비교 | 동일 커밋에서 기존 실패 17개 재현, 비교 프로젝트 조건상 1개 건너뜀 |
| 기록 저장 오류 2개 재실행 | 독립 출력 폴더에서 2개 통과 |

전체 실패 19개 중 17개는 main에서도 재현됐습니다. `question-matching.spec.ts`의 상태 선택자·요청 횟수 검증 8개가 PC·모바일에서 각각 실패했고, `sidebar.spec.ts`의 애니메이션 중간 프레임 검증 1개가 실패했습니다. 상세 폴링의 동작을 바꾸거나 이 기존 테스트들을 이번 이슈 범위에서 다시 쓰지 않았습니다.

나머지 2개는 추가 테스트와 전체 테스트가 같은 추적 파일 폴더를 사용해 발생한 ENOENT였습니다. 출력 폴더를 분리한 뒤 아래 두 테스트를 순차 재실행하여 모두 통과했습니다.

- `answer-draft.spec.ts`: saving an omitted answer uses its server ID, persists after reload and regenerates only on click
- `editing.spec.ts`: AI marker: undefined, SOURCE_CONFIRMED, 1 competencies

검증 환경은 Windows의 설치된 Chrome입니다. 전체 실행은 `npm test -- --workers=2`에 기록용 reporter를 붙였고, 재실행은 worker 1개와 별도 `.cache/retry-results`를 사용했습니다. [기계 판독용 집계](fe-106-test-results.json)에 실패별 main 재현 여부가 있습니다.

로컬 원문 로그: `.cache/check-final-state.log`, `.cache/all-tests-final.log`, `.cache/main-comparison.log`, `.cache/artifact-retry.log`, `.cache/precision-tests.log`.

## 5. 스크린샷

**테스트 API 응답이며 실제 BE/AI 데이터가 아닙니다.** 각 이미지 안에도 출처를 표시했습니다.

- [PC 1440px](work-work-1440-test-api.png)
- [태블릿/레일 1024px](work-work-1024-test-api.png)
- [모바일 390px](work-work-390-test-api.png)

## 6. 사용자가 수동 확인할 항목

- 실제 로그인 세션과 배포 환경의 API 주소·쿠키·CORS에서 조회와 읽음 저장이 정상인지 확인합니다.
- 실제 자료 분석·추천·근거 점검·초안·차곡이 작업을 시작하여 화면 이동·새로고침 후 진행 상태와 완료/실패 소식을 확인합니다.
- 실제 차곡이 확인 카드를 다른 화면과 새로고침 후 열고, 사용자 승인 전에는 생성되지 않는지 확인합니다. 실제 재시도도 사용자 조작으로 검증합니다.
- 다른 탭·기기에서 목록을 읽은 뒤 다음 조회에서 읽음 상태가 동기화되는지 확인합니다.
- 실제 모바일 기기의 터치·스크롤·탭 전환 동작을 확인합니다. 자동화의 390px 검증은 실제 모바일 기기 검증과 구분합니다.

## 7. 남은 사항과 위험

실제 계정 E2E는 요청에 따라 사용자 검증으로 남아 있습니다. 전체 테스트는 main에서 재현되는 기존 실패 17개 때문에 녹색 상태가 아닙니다. 이번 변경으로 인한 미해결 기능 회귀는 검증에서 확인되지 않았습니다.

독립된 자료 상세 라우트가 없는 기존 FE 구조를 따라 `/experience` 안에 자료의 분석 상세를 표시했습니다. 시안 6의 알림함을 기존 Sheet로 구현했고, 모바일 상세 화면에서도 접근하도록 공통 상단 표시를 추가했습니다.

## 8. 권장 PR

제목: `feat(work): 전역 작업 진행 상태·소식과 차곡이 작업 복원 (#106)`

[PR 본문 초안](fe-106-pr.md)을 준비했습니다. PR 생성과 커밋·Push·Merge는 수행하지 않았습니다.
