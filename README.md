# WOOWANGTHON_TEAM_12_FE — 차곡 프론트엔드

2026 AI 우왕톤 12팀 「내가 우왕이 될 상인가」 — **차곡**: 흩어진 기록은 차곡차곡 정리하고, 지원서엔 딱 맞게 꺼내 쓰는 AI 동료.

**서비스: https://app-woowang.miroda.live** (main 이 올라갈 때마다 Vercel 이 자동 배포). 심사용 테스트 계정은 제출 폼에 있다.

프로젝트 개요 · 문제 · AI 검증 · 아키텍처 · 결정 기록은 [ETC 레포](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC)에 있다. 스택을 고른 이유는 ETC [ADR-005](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/blob/main/docs/decisions/ADR-005-fe-stack.md).

## 이 레포가 맡는 것

- 화면 전부 — 홈 입력(차곡이) · 내 경험(연도별 타임라인 · 활동 세부 · STAR · 근거) · 지원서(문항 · 공고 · 초안) · 작성 지침 · 외부 AI 연결 · 공개 프로필
- 자료 글자 뽑기 — PDF · PPTX · Notion ZIP · 옵시디언 폴더 · GitHub 공개 레포의 글자를 **브라우저에서** 뽑아 글자만 BE 로 보낸다(서버에 파일을 올리지 않는다)
- 데이터 판단은 하지 않는다 — 저장 · 인증 · AI 호출은 전부 BE API 로. AI 호출이 실패하면 정해 둔 답으로 덮지 않고 오류와 「다시 시도」를 보인다

## 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS 4 · shadcn/ui 부품(button · sheet · dialog — 레포에 복사해 디자인 기준대로 고침)
- pdf.js(`pdfjs-dist`) · JSZip — PDF · PPTX · Notion ZIP 글자 뽑기
- 시험: Playwright · 린트: ESLint(`eslint-config-next`)
- 배포: Vercel — main 만 운영으로 자동 배포. PR 미리보기는 없다(ETC ADR-020)

## 실행 방법

Node.js 20.9 이상(24 권장)이 필요하다.

```bash
npm install
npm run dev        # http://localhost:3000
```

- **API 주소를 비우면 목 모드**다 — 백엔드 없이 화면을 본다. 로그인이 없고, 목 데이터는 코드에 `MOCK(<id>)` 주석이 달려 있으며 ETC `docs/ai-scope.md` §3 에 전부 등록돼 있다. 목 모드는 **API 주소가 없을 때만** 켜지고, 실제 API 가 실패했을 때 목 결과로 바꾸지 않는다.
- **실제 백엔드에 붙이려면** `.env.local` 에 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api`(로컬 BE — [BE README](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_BE#실행-방법)). 변수 이름은 `.env.example` 에 있다. `NEXT_PUBLIC_` 변수는 브라우저 번들에 들어가므로 비밀값을 넣지 않는다.
- 로그인은 아이디 · 비밀번호 + 서버 세션 쿠키다(ETC `docs/contracts/auth-api.md`). 운영에선 `app-woowang` · `api-woowang` 이 같은 상위 도메인이라 쿠키가 실린다.

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
| `npm test` | Playwright — 1440 · 1024 · 390px 화면 시험과 API 요청 모양 시험(`tests/`) |

`npm test` 는 처음 한 번 `npx playwright install chromium` 이 필요하다. 3100 포트에 격리된 개발 서버를 띄우고(worktree 여러 개에서 동시에 돌릴 땐 `PW_PORT=3101` 처럼 나눈다) 브라우저 요청을 시험용 응답으로 받는다 — 화면 동작 · 요청 모양을 보는 시험이고 실제 AI 품질 검증은 아니다(AI 품질은 AI 레포 채점 스크립트). 목 모드 회귀 시험은 `TEST_MOCK=1 npm test -- --project=desktop --project=mobile`.

## 코드 지도

| 자리 | 하는 일 |
| --- | --- |
| `src/app/(app)/page.tsx` | 홈 — 입력 하나(차곡이) · 쌓인 블록 · 「이어서」 |
| `src/app/(app)/experience` | 내 경험 — 연도별 타임라인 · 활동 세부 · 경험 · STAR · 근거 |
| `src/app/(app)/applications` · `questions` | 지원서 — 문항 · 공고 요건 줄 · 경험 추천 · 되묻기 · 초안 |
| `src/app/(app)/guidelines` | 작성 지침 |
| `src/app/(app)/connections` | 외부 AI 연결(MCP 주소 · 쓰기 켜기 · 최근 수정) |
| `src/app/p/[token]` | 공개 프로필 |
| `src/components/<화면>` | 화면별 부품 — `home` · `experience` · `applications` · `questions` · `source` · `connections` · `revisions` · `export` · `auth` … |
| `src/lib/api` | BE API 호출 — 계약(ETC `docs/contracts/`)과 같은 타입 · 오류 처리. `http.ts` 가 401 이면 로그인 화면으로 |
| `src/lib/source-file` | 자료 글자 뽑기 — `pdf.ts` · `pptx.ts` · `notion-zip.ts` · `github.ts` · `notes.ts`(옵시디언 폴더) |
| `src/lib/mock` | 목 모드 데이터(API 주소가 없을 때만) |
| `tests/` | Playwright 시험 |
| `scripts/design-diff` | 시안과 앱을 같은 폭에서 재서 견주는 도구(아래) |

## 시안과 비교하기

시안 HTML 과 앱을 같은 폭(1440 · 1024)으로 열어, 브라우저가 계산한 값으로 견준다. 코드를 읽어 옮기면 뒤에서 덮어쓴 규칙을 놓친다. **UI PR 에는 이 표를 붙인다.**

```bash
npm run design:diff -- home   # 화면: home · quick-find · add-menu · notifications · experience · apply
```

- 시안은 `../WOOWANGTHON_TEAM_12_ETC/docs/design/chagok`(옆에 클론), 앱은 API 주소를 비운 목 모드로 스스로 띄운다. 실제 서버에 닿지 않는다.
- 결과는 `artifacts/design-diff/<화면>/` — 폭마다 나란한 이미지 `<폭>.png` 와 차이 표 `report.md`. 커밋되지 않는다.
- 이 폴더에서 `npm run dev` 가 돌고 있으면 목 모드 서버를 가리킨다: `npm run design:diff -- home --app-url http://localhost:3000`. 그 밖의 인자: `--widths 1440` · `--etc <ETC 경로>`.
- 화면을 더하려면 `scripts/design-diff/screens/<화면>.json` 하나를 만든다. `pairs` 의 `design` · `app` 은 Playwright 선택자, `open` 은 재기 전에 누를 곳이다. 목 모드에 없는 데이터가 필요하면 `"api": "fake-question"`(시험용 가짜 BE `tests/fake-question-api.ts`) — 이때 `--app-url` 은 API 모드 서버여야 한다.
- 일부러 다르게 둔 값은 ETC `docs/design/DESIGN.md` 「시안과 일부러 다른 곳」에 적고, 짝에 `"intent": { "높이": "이유" }` 를 달면 표에 「의도」로 나온다.

## 배포

- **main 에 머지되면** 운영 URL 이 갱신된다(Vercel).
- **PR 미리보기는 없다** — `vercel.json` 의 `git.deploymentEnabled` 가 main 만 배포한다. Vercel Hobby 하루 배포 한도(100)에 PR 미리보기가 쌓여 운영 배포까지 막혔기 때문이다(2026-11-12 · ETC ADR-020).
- UI PR 은 Playwright 시험(가짜 API)으로 1440 · 1024 · 390 을 찍어 `docs/fe-<번호>/` 에 두고 PR 본문에 붙인다. 개발 서버 배지는 `nextjs-portal { display: none }` 으로 숨기고 찍는다.
- 배포 계정 · 도메인 · 환경 변수는 사람만 다룬다. 레포엔 `.env.example` 만 둔다.

| 주소 | 무엇 |
| --- | --- |
| `https://app-woowang.miroda.live` | 운영 화면. `NEXT_PUBLIC_API_BASE_URL=https://api-woowang.miroda.live/api` 로 빌드된다 |
| `https://api-woowang.miroda.live/api` | 실제 BE. 앱의 로그인(세션 쿠키)으로 막는다 — 팀원만 들이던 Cloudflare Access 는 로그인 · 하루 한도를 붙인 뒤 풀었다(2026-11-14 · BE#21) |
