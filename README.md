# WOOWANGTHON_TEAM_12_FE

**운영 URL: https://app-woowang.miroda.live** (main 이 올라갈 때마다 Vercel 이 자동 배포) — 실제 API 를 보려면 먼저 Access 로그인([아래](#운영에서-실제-api-로-보기))

2026 AI 우왕톤 12팀 「내가 우왕이 될 상인가」 — 프론트엔드

전체 개요 · 명세 · 아키텍처 · 결정 기록은 [ETC 레포](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC). 스택을 고른 이유는 ETC `docs/decisions/ADR-005-fe-stack.md`.

## 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS 4
- ESLint (`eslint-config-next`)
- 배포: Vercel — main 은 운영, PR 은 미리보기

## 실행 방법

Node.js 20.9 이상(24 권장)이 필요하다.

```bash
npm install
npm run dev        # http://localhost:3000
```

## 검증

PR 을 올리기 전에 돌린다. GitHub Actions(`.github/workflows/ci.yml`)도 PR 마다 같은 것을 돌린다.

```bash
npm run check      # = lint → typecheck → build
```

| 명령 | 하는 일 |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | 라우트 타입 생성(`next typegen`) 뒤 `tsc --noEmit` |
| `npm run build` | 운영 빌드 |

## 활동·경험 API 및 편집 (FE #7)

- `NEXT_PUBLIC_API_BASE_URL`은 `/api`까지 포함한 백엔드 기본 주소다. 변수 이름과 빈 기본값은 `.env.example`에 있다. 주소를 비우면 기존 목 타임라인을 사용한다.
- `NEXT_PUBLIC_` 변수는 브라우저 번들에 포함되므로 비밀값을 넣지 않는다. 주소 변경 후 개발 서버를 재시작하고, 운영 환경에서는 다시 빌드한다.
- 실제 API 모드는 활동 목록·상세 GET, 활동·경험 PATCH, 자료 등록 POST, 분석 작업 GET, 재시도 POST를 연결한다. 실패 시 목 결과로 대체하지 않는다. 인증 헤더는 추가하지 않는다.
- 목 모드에서도 편집·취소·검증을 확인할 수 있지만, 저장은 `API_NOT_CONFIGURED` 오류를 표시하고 입력을 유지한다. 목 저장 성공이나 서버 저장을 흉내 내지 않는다.
- 활동 상세의 「활동 수정」과 각 경험의 「수정」에서 편집한다. 저장 실패 시 입력을 유지하며, 취소하면 저장 전 값으로 돌아간다. 서버의 PATCH 응답으로 타임라인·상세·근거 시트를 갱신한다.
- 경험의 `sourceStatus`와 `citations`는 서버 응답을 그대로 사용한다.
- 경험의 역량은 `competencies` 배열이다(ETC contracts README 「값 목록」의 닫힌 목록 13개, 경험당 0~3개, 없으면 `[]`). 고치기·직접 추가 모두 목록에서 최대 3개를 고르고 자유 입력은 없다(FE #18). 고른 순서가 곧 보내는 순서다 — 앞에 둔 역량이 더 잘 맞는 것이다. PATCH는 바뀌었을 때만 배열을 통째로 보낸다: 그대로면 필드를 빼고, 순서만 달라도 보내며, 다 지우면 `[]`를 보낸다. 응답의 역량이 계약과 다르면(옛 `perspective` 응답 등) `INVALID_RESPONSE`로 표시한다.
- 메타 줄의 「AI」 표시는 출처 상태가 「내가 입력」이 아닐 때만 보인다(FE #21 기준). BE가 역량을 누가 골랐는지 저장하지 않아, AI가 뽑은 경험의 본문만 고쳐도 표시가 사라진다 — PM 확인 대기.
- 자료 넣기·분석·재시도는 API 주소가 있으면 실제 BE에 연결한다. 주소가 없는 개발용 목 모드에서만 `MOCK(source-analysis)`를 사용한다. 완료·실패 시 폴링을 멈추고, 완료 뒤 목록·상세를 다시 조회한다. 새로고침 후에는 서버별로 저장한 작업 ID를 재조회한다.
- 목 코드는 오프라인 화면 확인에 계속 사용하므로 마커를 유지한다. ETC `docs/ai-scope.md` §3의 두 FE 항목은 「API 주소가 비어 있는 목 모드 전용」으로 갱신돼 있다. 자세한 내용은 [자료 분석 API 연동 기록](docs/source-analysis-api.md)에 있다.
- 경험 직접 추가·지우기(되돌리기 포함)는 FE #12에서 붙였다.

### 자동 테스트

```bash
npx playwright install chromium
npm test
```

`npm test`는 API·검증 테스트 9개와 데스크톱(1440px)·모바일(390px) 편집·자료 분석 테스트를 실행한다. 기간의 공통 정밀도 비교·연도 0000, 역량 고르기(최대 3개·순서·`[]`·안 바뀌면 생략), 폴링·새로고침 복원·재시도·빈 결과·실패, 50,000자 UTF-16 경계와 파일 JSON 등록을 검증한다. 3100 포트에 격리된 개발 서버를 띄우고 브라우저 요청을 테스트 응답으로 처리한다. 실제 DB 저장이나 배포된 서버·AI와의 통합 테스트가 아니다.

목 타임라인·목 저장 실패·자료 넣기 회귀 테스트는 PowerShell에서 다음과 같이 실행한다. Windows 실행 정책으로 `npm.ps1`이 차단되면 `npm.cmd`를 사용한다.

```powershell
$env:TEST_MOCK = '1'
npm.cmd test -- --project=desktop --project=mobile
Remove-Item Env:TEST_MOCK
```

설치된 Microsoft Edge를 사용하려면 실행 전 `$env:PW_CHANNEL = 'msedge'`를 설정한다. 테스트 보고서·추적 파일·로컬 npm 캐시는 Git에서 제외한다.

### 백엔드 배포 후 확인할 것

최신 BE Controller·DTO·서비스·오류 처리 대조, 로컬 `SEED_SAMPLE=true` 실행 방법과 `http://localhost:8080/api` 설정은 [FE #7 API 검증 기록](docs/fe-7-api-verification.md)에 정리했다. 기간은 PM 확정대로 BE `Period.startsAfter()`와 동일하게 짧은 날짜 길이까지 비교한다. `2025-03 → 2025`는 유효하며 연도 `0000`을 별도로 금지하지 않는다. 실제 BE·DB 검증은 실행 환경이 준비된 뒤 수행해야 한다.

BE #4·#5의 조회·수정·자료 등록·작업 조회·재시도 연결 코드는 준비됐다. BE와 AI 서버를 실행한 뒤 DB 저장·새로고침 후 유지, 운영·미리보기 도메인의 CORS, Cloudflare Access를 확인해야 한다. 실제 서버·DB·AI 통합 검증은 미완료다.

## 경험 옮기기 · 활동 합치기 (FE #10)

- 옮기기(`POST /api/experiences/{id}/move`): PC(≥1024px)는 경험 왼쪽 손잡이를 끌어 타임라인의 다른 활동 줄에 놓는다. 모든 폭에서 경험 ⋯ 메뉴 「다른 활동으로 옮기기」로도 옮긴다. 화면에 바로 반영하고, 실패하면 원래 자리 · 개수로 돌린 뒤 알린다.
- 끌어다 놓기는 라이브러리 없이 브라우저 HTML5 Drag and Drop 을 쓴다 — 끌기는 PC 에서만 쓰고 모바일은 메뉴라 터치 끌기가 필요 없다.
- 합치기(`POST /api/activities/{keep}/merge`): 활동 ⋯ 메뉴 「다른 활동과 합치기」 → 합칠 활동 · 남길 활동을 고르고 무엇이 어디로 가는지 확인한 뒤 보낸다. 되돌릴 수 없어서 응답을 기다렸다 반영하고, 실패하면 창에 이유를 남기고 화면은 그대로 둔다.
- 목 모드에서는 둘 다 `API_NOT_CONFIGURED` 로 실패하고 원래대로 돌아간다(성공을 흉내 내지 않는다).

## 활동 기간 고치기 (FE #25 · #26)

- 세부 「활동 수정」: 시작 · 종료를 연 · 월 고르기로. 연 · 월을 안 바꾸면 원래 문자열(`YYYY-MM-DD` 까지)을 그대로 보낸다.
- PC 타임라인(S-17): 활동 줄에 마우스를 올리면 기간 띠의 시작 · 끝에 손잡이가 나온다. 끄는 동안 「바꿀 기간 …」이 보이고, 놓으면 `PATCH /api/activities/{id}` — 바로 반영하고 실패하면 원래대로 돌린 뒤 알린다. 그해 안에서만 끈다(다른 해 · 모바일은 세부에서).

## 지원 문항 매칭 — 목 (FE #30)

- 상단 「지원 문항」 또는 `/questions`에서 문항을 넣고 예시 결과를 확인한다. API 주소 설정과 관계없이 이 기능은 **목 전용**이며, 실제 BE·AI·인증·하루 한도 API를 호출하지 않는다.
- ETC `question-api.md`의 문항 41·42를 비교할 수 있다. 41은 같은 「바꿔요」 활동의 경험 101, 42는 경험 102를 먼저 보여 주며, 42의 두 번째 추천은 보완 301을 근거로 재사용한다. 이유·강조점·추가 확인할 부분은 AI 해석 예시, 원문 발췌와 보완은 별도 근거로 구분한다.
- 직접 넣은 문항은 3초간 `ANALYZING` 후 고정 예시로 완료된다(화면은 2초마다 조회). 협업 예시와 같은 문항 텍스트는 문항 42 결과, 나머지는 문항 41 결과를 쓴다. 입력 내용을 실제로 분석하지 않는다.
- `/questions?matching=fail`에서 새로 넣으면 실패를 재현한다. 「다시 시도」는 새 문항 없이 같은 ID로 예시 분석을 다시 시작한다. `/questions?matching=empty`는 추천 0개·요구사항 전부 「자료에서 확인 안 됨」을 재현한다.
- 문항·결과·분석 시작 시각·선택은 `localStorage`의 `mock:question-matching:v1`에 보관한다. 새로고침하거나 화면을 오가도 이어지고, 초기 예시의 목록용 시각은 첫 방문 시점에 맞춘다. 저장소를 쓸 수 없으면 오류를 보여 주고 저장됐다고 표시하지 않는다.
- 추천의 「타임라인에서 활동 보기」는 `/?questionMock=1&activity=7`로 이동한다. 같은 타임라인·활동 세부를 **목 읽기 전용**으로 사용해 예시 ID를 실제 서버에 보내지 않는다. 일반 타임라인의 API·편집 동작은 유지한다.
- 되묻기 답변·보완 편집은 #31, 실제 API 연결은 #32, 인증 UI는 #37 범위다. 이 화면은 답변 초안을 만들지 않는다.
- 화면: [PC](docs/fe-30/questions-desktop.png) · [모바일](docs/fe-30/questions-mobile.png). ETC 목 등록 문구는 별도 ETC PR에서 반영한다.

## 로그인 · 하루 분석 한도 (FE #37)

계약: ETC `docs/contracts/auth-api.md`. 아이디 · 비밀번호 + 서버 세션 쿠키(`credentials: "include"`), 인증 헤더 없음.

- **실제 API 모드에서만** 첫 화면 전에 `GET /api/auth/me` 로 로그인했나 본다(`src/components/auth/auth-gate.tsx`, `layout.tsx` 에서 모든 페이지를 감싼다). 401 이면 로그인 · 가입 화면, 200 이면 그대로.
- **목 모드(API 주소 없음 — PR 미리보기 · `*.vercel.app`)는 로그인이 없다.** 세션 쿠키가 같은 상위 도메인(`app-…` · `api-…`)에서만 실리기 때문(ADR-004).
- 쓰는 중 어느 요청이든 401 `UNAUTHENTICATED`(세션 7일 만료 · BE 재시작)를 받으면 「로그인이 끝났어요」 알림과 함께 로그인 화면으로 간다(`src/lib/api/http.ts` 의 `onUnauthenticated`).
- 가입은 계약 규칙(아이디 영문 · 숫자 · `_` `.` `-` 3 ~ 30자, 비밀번호 8자 이상 · 72바이트까지)을 보내기 전에 검사한다. 가입하면 바로 로그인된다.
- 계정 메뉴(PC 사이드바 맨 아래 · 좁은 폭은 위 막대 오른쪽): 아이디 · 오늘 분석 `used / limit` · 로그아웃.
- 429 `DAILY_LIMIT_EXCEEDED`: 자료 넣기는 「저장하지 않았어요」, 다시 시도는 「자료는 저장돼 있어요」로 이유를 보인다. 자료 넣기 창에 「오늘 남은 분석 n회」.
- 로그인 상태 확인이 연결 실패면(Cloudflare Access 로그인이 없거나 끝남) 오류 화면에 「API 주소 열어 로그인하기」 링크를 보인다.
- 테스트 계정(`test`) 비밀번호는 화면 · README 에 적지 않는다 — Public 레포라 제출 폼에만.
- 시험: `tests/auth.spec.ts`(화면) · `tests/auth-api.spec.ts`(요청 모양). 다른 화면 시험은 `tests/signed-in.ts` 픽스처로 「로그인된 상태」에서 시작하고, 각 `page.route("**/api/**")` 처리기는 `/api/auth/` 를 `route.fallback()` 으로 넘긴다.

## 홈 입력 하나 (FE#86 · S-28)

- 홈의 꺼내기(기본)는 `POST /api/entrance/route`로 글을 가른다. 자료면 자료 넣기, 지원이면 글 전체를 문항 하나로 채운 지원 넣기 창을 연다. 다음 화면에서 사용자가 눌러야 저장한다.
- 한 줄 질문(`ASK`, S-29 전) · 애매함(`UNSURE`) · AI 오류(502 · 504)는 자료/지원을 직접 고른다. 입력창의 「지원으로 만들기 / 자료로 쌓기」로 수정한 글을 들고 다른 쪽으로 보낼 수 있다.
- 쌓기와 파일 올리기는 가르기를 건너뛰고 기존 자료 넣기를 연다. 파일은 S-01의 `.md` · `.txt` 하나를 받는다. PDF · PPTX(S-39), 경험으로 답하기(S-29), 지원 칸 자동 채우기(S-30)는 별도 이슈다.
- 목 모드에선 홈의 「목 분류 결과」로 네 종류를 확인한다. AI를 호출하지 않으며 실제 API 오류를 목 결과로 바꾸지 않는다. 마커 `MOCK(entrance-route)`는 ETC `docs/ai-scope.md` §3에 등록한다.
- 시험: `tests/entrance-api.spec.ts` · `tests/entrance.spec.ts` · `tests/entrance-mock.spec.ts`. UI 시험은 1440 · 1024 · 390에서 HTTP 응답을 흉내 내 요청과 전환을 검사하며 실제 AI 품질 검증은 아니다.

## 배포 · 미리보기

- **PR 을 열면** Vercel 봇이 PR 에 미리보기 URL 을 댓글로 단다. 커밋을 더 올리면 같은 댓글이 새 URL 로 바뀐다.
- **main 에 머지되면** 운영 URL 이 갱신된다.
- 배포 계정 · 도메인 · 환경 변수는 사람만 다룬다. 레포엔 `.env.example` 만 둔다.

### 운영에서 실제 API 로 보기

| 주소 | 무엇 |
| --- | --- |
| `https://app-woowang.miroda.live` | 운영 화면. 공개. `NEXT_PUBLIC_API_BASE_URL=https://api-woowang.miroda.live/api` 로 빌드된다 |
| `https://api-woowang.miroda.live/api` | 실제 BE. **Cloudflare Access 뒤** — 허용 목록의 이메일로 로그인해야 열린다(LLM 비용이 새지 않게) |
| PR 미리보기 · `*.vercel.app` | API 주소를 비워 둔 **목 모드**. `*.vercel.app` 은 API 와 도메인이 달라 Access 쿠키가 안 실리므로 실제 API 를 못 부른다 |

1. 같은 브라우저에서 `https://api-woowang.miroda.live/` 를 먼저 연다 → 이메일 입력 → 메일로 온 코드 입력(1주일 유지).
2. 그다음 `https://app-woowang.miroda.live/` 를 연다.
3. 서버가 최신 BE(BE#33)면 앱의 로그인 화면이 뜬다 — 가입하거나 받은 계정으로 로그인한다.
4. 「로그인 상태를 확인하지 못했어요 · 서버에 연결하지 못했어요」가 뜨면 Access 로그인이 만료된 것 — 화면의 「API 주소 열어 로그인하기」로 1번부터 다시.

- 코드 메일이 안 오면 허용 목록에 없는 것이다. BE 담당에게 이메일을 보내 추가를 부탁한다.
- 공용 PC 에선 로그인하지 않는다. 했으면 그 PC 에서 `https://api-woowang.miroda.live/cdn-cgi/access/logout` 을 연다.
- **에이전트는 Access 로그인(메일 코드)을 할 수 없다.** 실제 서버 확인은 사람이 로그인한 브라우저에서 하고, 에이전트의 시험은 로컬 BE 나 `tests/` 의 HTTP 응답 흉내로 한다.
- 운영 데이터는 팀 공용이다(스프린트 1 은 고정 사용자 하나). 합치기 · 지우기는 되돌릴 수 없으니 운영에서 시험 삼아 하지 않는다.

### 처음 한 번 — Vercel 연결 (사람이)

1. [vercel.com](https://vercel.com) 에 GitHub 계정으로 로그인 → **Add New… → Project**.
2. `woowangthon/WOOWANGTHON_TEAM_12_FE` 를 Import 한다. 목록에 없으면 「Adjust GitHub App Permissions」에서 `woowangthon` 조직에 Vercel 앱을 설치하고 이 레포를 고른다(조직 관리자 승인이 필요할 수 있다).
3. Framework 는 Next.js 로 자동 인식된다. 설정을 바꾸지 않고 **Deploy**.
4. 나온 운영 URL(`*.vercel.app`)을 이 README 맨 위와 이슈 #4 에 적는다.
5. 확인: 아무 PR 이나 열어 Vercel 봇 댓글에 미리보기 URL 이 뜨는지 본다.
6. 팀원이 미리보기를 열 때 Vercel 로그인 화면이 뜨면 **Settings → Deployment Protection → Vercel Authentication** 을 끈다(공개 레포라 미리보기에 감출 것이 없다).

나중에 `app.<도메인>` 을 붙일 땐 Vercel 프로젝트 **Settings → Domains** 에 추가하고, 안내대로 DNS(CNAME)를 건다(ETC ADR-004 — FE · BE 를 같은 상위 도메인 아래에).
