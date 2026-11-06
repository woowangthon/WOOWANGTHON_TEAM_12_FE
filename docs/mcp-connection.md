# FE #57 MCP 연결 화면

- 진입: PC 사이드바 또는 모바일 상단 주 메뉴의 「연결」 → `/connections`. 기존 「내 경험 · 지원」과 같은 내비게이션을 사용한다. 별도 설정 화면이나 다른 연동의 빈 버튼은 추가하지 않았다.
- BE 확인: 2026-11-04, `origin/main`을 fetch한 뒤 로컬 main과 동일한 `3af9dfa`임을 확인했다. MCP 연결 API 구현이 없고 BE #41은 Open, MCP 관련 PR은 검색되지 않았다.
- API 주소가 없으면 기존 `isMockMode()`에 따라 목을 사용하고 화면에 실제 연결이 아님을 표시한다. API 주소가 있으면 기존 `request()`로 `/mcp/connection`을 호출한다(기존 base에 `/api` 포함). GET / POST / DELETE, 본문 없는 POST·DELETE, 세션 쿠키, 204 처리는 기존 공통 계층을 따른다. 실패 후 목으로 전환하지 않는다.
- 비밀 주소는 생성 응답에서만 받아 화면 state에 둔다. GET 결과에서는 상태·시각만 추려 보관한다. 새로고침, 라우트 이탈, 브라우저 pagehide 시 주소를 지우며 뒤로 가기 복원도 처리한다. URL을 저장소·쿠키·쿼리·로그에 기록하지 않는다. 오류 응답 본문도 이 화면에 그대로 표시하지 않는다.
- 목 저장소에는 생성 시각만 저장한다. `https://mcp-preview.invalid/…`는 연결 불가능한 고정 예시이며 실제 서버 토큰이 아니다.
- 재발급·해제는 공통 Dialog로 확인한다. 변경 요청 결과가 불확실하면 이전 연결 유지나 해제 성공을 단정하지 않고 GET 상태 재확인 버튼을 제공한다. POST를 자동 재시도하지 않는다.
- 실제 BE 응답, 이전 토큰 무효화, 운영 배포·Access의 `/mcp/*` 우회, 실제 Claude 연결은 미검증이다. 자동 테스트는 합성 HTTP 응답을 사용한다.

## 검증 명령

```powershell
$env:PW_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test --project=mcp-desktop --project=mcp-mobile
$env:TEST_MOCK='1'
node node_modules/@playwright/test/cli.js test --project=mcp-desktop --project=mcp-mobile
Remove-Item Env:TEST_MOCK
npm.cmd run check
```

브라우저는 설치된 Edge를 사용했다. 테스트 trace는 끄고 합성 데이터만 캡처한다. 테스트는 `artifacts/mcp-*.png`에 캡처 7장을 생성하지만, 저장소에는 PC·모바일 목 생성 화면과 1024px 기존 연결 화면 3장만 포함한다. 나머지 재생성 가능한 캡처는 `.gitignore`로 제외한다. 실제 비밀 주소는 캡처하지 않는다.

2026-11-04 최종 결과:

- MCP 합성 HTTP 테스트: PC 5개 + 모바일 5개, **10개 통과**. 생성·복사 성공/실패·새로고침·라우트 이탈 후 뒤로 가기·시각·미사용·재발급 확인/취소·해제·GET/POST/DELETE 오류·네트워크·401·잘못된 응답·POST 응답 유실·이미 해제된 연결의 204를 확인했다. 이전 토큰의 실제 무효화는 BE 미구현으로 검증하지 않았다.
- MCP 목 테스트: PC·모바일 **2개 통과**. 목 표시·사용 불가능한 주소·저장소에 주소 없음·새로고침 후 상태만 복원 확인.
- 기존 타임라인 목 회귀 테스트: PC·모바일 **4개 통과**(편집·자료 분석·빈 상태·오류).
- `npm.cmd run check`: **통과**(ESLint, 타입 검사, 프로덕션 빌드, `/connections` 정적 페이지 생성).
- 캡처는 외부 폰트 CDN에 의존하지 않도록 시스템 대체 글꼴을 사용했고 개발 도구 배지를 숨겼다.

## 변경 파일

- `src/app/(app)/connections/page.tsx` — 연결 라우트
- `src/components/connections/connection-screen.tsx` — 상태별 화면·복사·확인·오류·주소 수명 관리
- `src/lib/api/mcp.ts` — 계약 타입·응답 검증·기존 요청 계층 연결
- `src/lib/mock/mcp.ts` — 명시적 목 구현
- `src/components/app-header.tsx` — 기존 PC·모바일 주 메뉴에 연결 추가
- `tests/mcp.spec.ts`, `tests/mcp-mock.spec.ts` — 기능·오류·보안·목 테스트
- `playwright.config.ts` — MCP PC·모바일 프로젝트
- `docs/mcp-connection.md` — 이 기록 및 ETC 별도 등록 행
- `.gitignore` — 자동 생성 캡처를 제외하고 검토용 3장만 포함
- `artifacts/mcp-mcp-desktop-mock-created.png`, `artifacts/mcp-mcp-mobile-mock-created.png`, `artifacts/mcp-1024-connected.png` — 검토용 캡처 3장(1440·390·1024)

캡처: [PC 목 생성](../artifacts/mcp-mcp-desktop-mock-created.png) · [모바일 목 생성](../artifacts/mcp-mcp-mobile-mock-created.png) · [1024 기존 연결](../artifacts/mcp-1024-connected.png).

## ETC 별도 PR에 등록할 행

ETC 문서는 이 작업에서 수정하지 않았다. 목 사용 중에는 아래 행을 `docs/ai-scope.md` §3에 등록해야 한다.

| ID | 종류 | 레포 · 위치 | 무엇이 가짜 · 준비된 것인가 | 시연에 나오나 |
| --- | --- | --- | --- | --- |
| `mcp-connection` | MOCK | `FE src/lib/mock/mcp.ts` · `src/lib/api/mcp.ts` | API 주소가 없는 목 모드에서만 MCP 연결 조회·생성·해제를 모의한다. 화면에 목 모드를 표시하며 `.invalid` 임시 주소는 실제 Claude에서 사용할 수 없다. 탭 저장소에는 생성 시각만 남기고 주소는 저장하지 않는다. 실제 API 실패 대체용이 아니다(FE#57) | 아니오 |

이슈 완료의 남은 외부 항목: ETC 목 기록 별도 PR, FE PR 작성 및 캡처 첨부.
