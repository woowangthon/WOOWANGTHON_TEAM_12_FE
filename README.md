# WOOWANGTHON_TEAM_12_FE

**운영 URL: https://woowangthon-team-12-fe.vercel.app** (main 이 올라갈 때마다 Vercel 이 자동 배포)

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
