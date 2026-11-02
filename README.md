# WOOWANGTHON_TEAM_12_FE

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
- 실제 API 모드는 활동 목록·상세 GET과 활동·경험 PATCH만 연결한다. 실패 시 목 결과로 대체하지 않는다. 인증 헤더는 추가하지 않는다.
- 목 모드에서도 편집·취소·검증을 확인할 수 있지만, 저장은 `API_NOT_CONFIGURED` 오류를 표시하고 입력을 유지한다. 목 저장 성공이나 서버 저장을 흉내 내지 않는다.
- 활동 상세의 「활동 수정」과 각 경험의 「수정」에서 편집한다. 저장 실패 시 입력을 유지하며, 취소하면 저장 전 값으로 돌아간다. 서버의 PATCH 응답으로 타임라인·상세·근거 시트를 갱신한다.
- 경험의 `sourceStatus`와 `citations`는 서버 응답을 그대로 사용한다. `perspective`는 조회·PATCH 모두 `string | null`이다. null은 빈 입력으로 표시하고, 기존 관점을 지우면 PATCH에 `perspective: null`을 보낸다. 변경하지 않은 관점은 요청에서 생략한다.
- 자료 넣기·분석·재시도는 BE #5 완료 전까지 기존 `MOCK(source-analysis)`를 유지한다. 실제 API 모드에서 목 분석 결과를 실제 활동 목록에 섞지 않는다. 기존 목 마커는 제거하지 않았으므로 ETC `docs/ai-scope.md` §3의 등록도 유지해야 한다.
- 경험 추가·삭제(FE #12)는 포함하지 않는다.

### 자동 테스트

```bash
npx playwright install chromium
npm test
```

`npm test`는 API·검증 테스트 6개와 데스크톱(1440px)·모바일(390px) 편집 테스트를 실행한다. 관점의 null 유지·문자열 입력·null로 지우기도 검증한다. 3100 포트에 격리된 개발 서버를 띄우고 브라우저 요청을 테스트 응답으로 처리한다. 실제 DB 저장이나 배포된 서버와의 통합 테스트가 아니다.

목 타임라인·목 저장 실패·자료 넣기 회귀 테스트는 PowerShell에서 다음과 같이 실행한다. Windows 실행 정책으로 `npm.ps1`이 차단되면 `npm.cmd`를 사용한다.

```powershell
$env:TEST_MOCK = '1'
npm.cmd test -- --project=desktop --project=mobile
Remove-Item Env:TEST_MOCK
```

설치된 Microsoft Edge를 사용하려면 실행 전 `$env:PW_CHANNEL = 'msedge'`를 설정한다. 테스트 보고서·추적 파일·로컬 npm 캐시는 Git에서 제외한다.

### 백엔드 배포 후 확인할 것

BE #9의 실제 주소를 설정한 뒤 실제 DB 저장·새로고침 후 유지, 운영·미리보기 도메인의 CORS, Cloudflare Access를 확인한다. BE #5의 자료 등록·작업 조회·재시도는 이번 작업의 실제 연동 범위 밖이다. 이 항목들은 현재 미검증이다.

## 배포 · 미리보기

- **PR 을 열면** Vercel 봇이 PR 에 미리보기 URL 을 댓글로 단다. 커밋을 더 올리면 같은 댓글이 새 URL 로 바뀐다.
- **main 에 머지되면** 운영 URL 이 갱신된다.
- 배포 계정 · 도메인 · 환경 변수는 사람만 다룬다. 레포엔 `.env.example` 만 둔다.

### 처음 한 번 — Vercel 연결 (사람이)

1. [vercel.com](https://vercel.com) 에 GitHub 계정으로 로그인 → **Add New… → Project**.
2. `woowangthon/WOOWANGTHON_TEAM_12_FE` 를 Import 한다. 목록에 없으면 「Adjust GitHub App Permissions」에서 `woowangthon` 조직에 Vercel 앱을 설치하고 이 레포를 고른다(조직 관리자 승인이 필요할 수 있다).
3. Framework 는 Next.js 로 자동 인식된다. 설정을 바꾸지 않고 **Deploy**.
4. 나온 운영 URL(`*.vercel.app`)을 이 README 맨 위와 이슈 #4 에 적는다.
5. 확인: 아무 PR 이나 열어 Vercel 봇 댓글에 미리보기 URL 이 뜨는지 본다.
6. 팀원이 미리보기를 열 때 Vercel 로그인 화면이 뜨면 **Settings → Deployment Protection → Vercel Authentication** 을 끈다(공개 레포라 미리보기에 감출 것이 없다).

나중에 `app.<도메인>` 을 붙일 땐 Vercel 프로젝트 **Settings → Domains** 에 추가하고, 안내대로 DNS(CNAME)를 건다(ETC ADR-004 — FE · BE 를 같은 상위 도메인 아래에).
