# FE #7 API 대조 및 로컬 검증

2026-11-02에 GitHub의 최신 main을 직접 읽었다. BE·ETC는 읽기 전용으로 확인했다.

- BE main: `6359a3df16de58a39afafaaf2941716a5e21763e`
- ETC main: `8246aaed7cee860133b1890e81e44e5e79f6e878`
- [공식 API 계약](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/blob/8246aaed7cee860133b1890e81e44e5e79f6e878/docs/contracts/experience-api.md)
- [공통 타입·기간·오류 계약](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_ETC/blob/8246aaed7cee860133b1890e81e44e5e79f6e878/docs/contracts/README.md)

## API별 BE 참조

다음 경로는 BE의 `src/main/java/com/woowangthon/backend/` 아래다. 요청 DTO는 별도 record가 아니라 `Map<String, Object>`와 `common/PatchBody.java`로 구현되어 있다.

| API | Controller | 응답 DTO | 서비스 |
| --- | --- | --- | --- |
| GET `/api/activities` | `activity/ActivityController.java` | `activity/ActivityResponses.java`의 `Timeline`, `Summary` | `activity/ActivityService.java`의 `timeline()` |
| GET `/api/activities/{activityId}` | `activity/ActivityController.java` | `ActivityResponses.Detail`, `experience/ExperienceResponse.java` | `ActivityService.detail()` |
| PATCH `/api/activities/{activityId}` | `activity/ActivityController.java` | `ActivityResponses.Summary` | `ActivityService.update()`, `activity/Period.java` |
| PATCH `/api/experiences/{experienceId}` | `experience/ExperienceController.java` | `experience/ExperienceResponse.java` | `experience/ExperienceService.java`, `experience/Experience.java` |

오류는 `common/ApiException.java`, `common/ErrorResponse.java`, `common/GlobalExceptionHandler.java`를 확인했다. CORS는 `common/CorsConfig.java`, 기본 설정은 `src/main/resources/application.properties`를 확인했다.

## 일치한 항목

- 메서드·경로·200 응답 일치. ID는 숫자이고 JSON 필드는 camelCase다. 목록은 배열 자체가 아닌 `{ activities: [...] }`다.
- 활동 요약은 `id`, `name`, `period`, `experienceCount`다. 상세는 `id`, `name`, `period`, `experiences`다.
- 활동 PATCH는 선택적인 `name`, `period`를 받는다. FE는 기간을 수정할 때 `start`, `end`, `ongoing`을 모두 보낸다. 시작·종료는 null 또는 부분 날짜이고 진행 중이면 종료는 null이다.
- 경험 PATCH는 선택적인 `content`, `perspective`, `actor`만 보낸다. `perspective`는 문자열 또는 null이고, 생략은 유지·null은 지우기다. `content`는 공백만 있을 수 없다. `actor`는 `ME`, `TEAM`, `UNKNOWN`이다.
- 경험 응답에는 `id`, `activityId`, `content`, `perspective`, `actor`, `sourceStatus`, `citations`가 있다. 근거의 `matched`, `location`은 null일 수 있다.
- `Experience.editByUser()`는 실제 값이 바뀔 때만 `USER_ENTERED`로 바꾸고 citations는 건드리지 않는다. FE는 출처 상태를 만들지 않고 서버 응답 전체를 반영한다.
- 400 `INVALID_REQUEST`·`INVALID_PERIOD`, 404 `ACTIVITY_NOT_FOUND`·`EXPERIENCE_NOT_FOUND`는 `{ error: { code, message } }`다. FE의 `ApiError`가 서버 코드·메시지·HTTP 상태를 보존한다. 네트워크 실패와 구분하고 목 데이터로 대체하지 않는다.
- 고정 사용자 단계에서 인증 헤더가 없다는 계약과 BE 구현이 일치한다.

## 확인이 필요한 차이 — 임의 변경하지 않음

ETC 공통 계약은 기간을 문자열 그대로 비교한다고 설명한다. BE `Period.startsAfter()`는 두 값 중 짧은 쪽 길이까지만 비교한다. BE의 `src/test/java/com/woowangthon/backend/ExperienceApiTest.java`에도 `2025-03 → 2025`를 허용하는 테스트가 있다.

현재 FE 검증은 ETC 설명대로 전체 문자열을 비교하므로 이 입력을 막는다. 서로 다른 정밀도의 날짜 순서 규칙을 ETC와 BE가 맞춰야 한다. 이 작업에서는 어느 한쪽으로 임의 결정하지 않고 기존 검증을 유지했다. 또한 연도 `0000`은 BE에서 허용하지만 FE는 거부하며, 계약에는 허용 연도 범위가 명시되어 있지 않다.

## 실제 화면 연결 상태

기존 `src/lib/api/experience.ts`의 GET/PATCH 클라이언트를 재사용한다. API 기본 주소가 있으면 4개 API 모두 실제 HTTP 요청을 보낸다. 주소가 없을 때만 기존 목 조회를 사용하며 목 저장은 실패한다.

타임라인·상세는 GET 결과로 채우고, 저장 후에는 PATCH 응답으로 목록·상세·경험·근거 시트를 갱신한다. 실패 시 입력과 편집 상태를 유지한다. 자료 넣기·AI 분석은 BE #5 연동 전까지 별도의 목 기능이며, 실제 활동 목록에 목 분석 결과를 섞지 않는다.

## 로컬 BE 실행 및 FE 주소

[BE README](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_BE/blob/6359a3df16de58a39afafaaf2941716a5e21763e/README.md)의 준비물은 JDK 25와 실행 중인 Docker다. BE를 준비한 별도 터미널에서 다음 명령을 실행한다. BE 파일 수정은 필요 없다.

```powershell
docker compose -f compose-local.yaml up -d
$env:SEED_SAMPLE = 'true'
.\gradlew.bat bootRun
```

`seed/SampleSeeder.java`에 따르면 시드는 기본 꺼짐이며, 고정 사용자에게 활동이 하나도 없을 때만 예시 활동 2개와 경험·근거를 넣는다. AI 분석 결과가 아닌 예시 데이터다. ID는 DB가 생성하므로 특정 숫자를 가정하지 않는다.

FE 저장소의 다른 터미널에서 다음처럼 설정한다. 서버 origin은 `http://localhost:8080`이며, 기존 FE 변수는 `/api`까지 포함한다. `.env.local`이나 민감 파일을 만들 필요가 없다.

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8080/api'
npm.cmd run dev
```

FE는 `http://localhost:3000`에서 연다. BE CORS 기본 허용 origin도 이 주소다. 다른 FE 주소·포트를 사용한다면 BE 실행 환경의 `CORS_ALLOWED_ORIGINS` 확인이 필요하다. 변수 변경 후 FE를 재시작하며 운영 번들은 다시 빌드해야 한다. 목 모드로 돌아가려면 이 변수를 제거한 후 재시작한다.

BE가 준비되면 목록 GET에서 실제 ID를 확인하고 상세를 연다. 활동 이름·기간과 경험 내용·관점·주체를 수정한 뒤 새로고침·재선택하여 유지 여부를 확인한다. 관점을 지웠을 때 null, 출처 상태, 기존 근거도 함께 확인한다. 이 절차는 아래 환경 사유로 이번 세션에서는 수행하지 못했다.

## 검증 결과와 한계

- 자동 테스트는 브라우저 요청을 테스트 응답으로 처리하며 실제 BE·DB 검증과 구분한다. 기존 편집·취소·입력 검증·nullable 관점·중복 제출·저장 오류 테스트에 상세 404와 재시도, 서버 응답 우선 반영, 실제 API 모드에서의 목 분석 분리를 추가했다.
- 목 모드 테스트는 기존 타임라인·목 저장 오류·자료 넣기·분석 완료·빈 화면·조회 오류를 확인한다.
- 로컬 사전 확인: PATH에서 Java를 찾지 못했고 Docker 엔진 접근은 permission denied였다. `localhost:8080`의 TCP 연결은 실패했고 실제 GET `/api/activities`도 `ECONNREFUSED`였다.
- FE를 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api`로 실제 실행하고 요청 가로채기 없이 Edge에서 확인했다. 브라우저가 해당 주소의 GET을 시도하고, 연결 오류·다시 시도를 표시하며 목 활동을 보여 주지 않는 검증은 통과했다. 이는 연결 실패 처리 검증이며 BE 정상 응답 검증이 아니다.
- 이번 자동 테스트 결과: API·데스크톱·모바일 편집 및 실제 모드 목 분석 분리 24개 통과, 기존 목 모드 회귀 4개 통과.
- 최종 `npm.cmd run check`의 lint·타입 검사·운영 빌드가 모두 통과했다. 첫 빌드는 OneDrive의 읽기 전용 재분석 지점이 된 기존 `.next/static`을 지우지 못해 EPERM으로 실패했다. 기존 생성 폴더만 Git에서 제외되는 경로로 분리하고 새로 생성한 뒤 전체 check를 재실행해 통과했다. 애플리케이션 코드나 빌드 설정을 우회 변경하지 않았다.
- 실제 BE GET/PATCH 성공, DB 저장, 새로고침 뒤 영속성, 브라우저 CORS·Cloudflare Access는 미검증이다. BE·DB·배포·Vercel 설정은 변경하지 않았다.
- 자료 등록·분석·재시도 실제 연동은 BE #5, 서버 배포·외부 접근은 BE #9에 의존한다. 기간 규칙 불일치 확인도 남아 있다.
