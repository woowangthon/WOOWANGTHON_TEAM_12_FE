# FE #106 실제 로컬 연동 검증

실행 중인 FE `http://localhost:3000`, BE `http://localhost:8080/api`, AI `8000`, DB `5432`를 사용합니다. 설치된 Chrome과 FE의 Playwright 의존성이 필요합니다. 서버 시작·종료, 키·환경 파일 변경은 하지 않습니다.

일반 `npm test`의 HTTP 목 테스트와 구분하는 **명시적 opt-in 스크립트**입니다. 응답 가로채기·대체·고정 작업 상태를 사용하지 않습니다. `localhost`/루프백 주소만 허용합니다.

```powershell
$env:FE106_REAL_E2E = '1'
$env:PW_CHANNEL = 'chrome'
node scripts/e2e/global-work-real.mjs
```

매 실행마다 빈 전용 테스트 계정을 새로 가입합니다. 비밀번호는 메모리에서만 생성·사용하고 출력·저장하지 않습니다. 기존 사용자 프로필이나 쿠키 DB를 읽지 않으며, 이 전용 계정에서만 자료·지원서·초안·근거 점검·차곡이 작업을 생성하고 소식을 읽습니다. 테스트 데이터는 삭제하지 않고 식별자와 결과를 남깁니다. 세션은 종료 때 로그아웃합니다. trace/HAR/storageState는 만들지 않습니다.

전체 실행은 실제 AI 작업을 **최대 5건** 요청합니다: 자료 분석, 문항 추천, 초안, 근거 점검, 차곡이 각 1건. 이는 BE 작업 요청 수이며, SDK 재시도·모델 폴백·차곡이 도구 루프의 개별 외부 모델 HTTP 호출 수와 다릅니다. 관측할 수 없는 모델 호출 수를 0으로 간주하지 않습니다. 선행 작업이 실패하면 의존하는 검증은 미검증으로 기록합니다. 실제 FAILED가 생기지 않으면 실패 소식도 미검증으로 남깁니다.

새로고침 검증은 **새로고침 시작 이후 전송된 실제 `/api/work` 응답**을 기다리고 화면의 작업 개수까지 대조합니다. 자료 분석만 재검증하려면 아래처럼 실행합니다. 추가 AI 요청은 최대 1건입니다.

```powershell
$env:FE106_SOURCE_ONLY = '1'
node scripts/e2e/global-work-real.mjs
Remove-Item Env:FE106_SOURCE_ONLY
```

복원한 확인 버튼의 화면 내 노출만 실제로 재검증하려면 `FE106_CONFIRM_ONLY=1`로 실행합니다. 전용 계정에 지원서 문항을 하나 생성하고 차곡이 확인 카드를 요청하므로 추가 AI 작업은 최대 2건입니다. 문항 Feed 로딩이 끝난 뒤 승인 버튼의 `toBeInViewport`까지 검사하며 승인 버튼은 누르지 않습니다.

## 실제 탭 숨김

일반 Playwright 연결은 focus emulation 때문에 탭을 바꿔도 `document.hidden`이 false일 수 있습니다. 별도 스크립트는 새 임시 프로필의 자체 Chrome에 `connectOverCDP({ noDefaults: true })`로 연결합니다. 같은 창의 실제 탭을 전환하여 `visible → hidden → visible`을 확인하며 DOM 속성을 덮어쓰지 않습니다. 숨김 상태 32초 동안 작업 요청이 0건이고 복귀 직후 요청이 있는지 검증합니다.

```powershell
$env:FE106_REAL_E2E = '1'
# 선택: 전체 실행의 결과 폴더에 함께 저장
$env:FE106_OUTPUT_DIR = 'artifacts/fe-106-real/<전체 실행 태그>'
node scripts/e2e/global-work-visibility-real.mjs
```

이 검증은 전용 계정 1개를 추가 가입하지만 AI는 호출하지 않습니다. 사용자 브라우저와 기존 서버를 종료하지 않습니다. 자기 Chrome만 닫고, 생성한 임시 프로필은 절대 경로의 부모·이름을 확인한 뒤 정리합니다. Windows/OneDrive의 읽기 전용 속성 때문에 Node 정리가 실패하면 동일 경로 검사를 수행하는 PowerShell로 재시도합니다.

결과는 `artifacts/fe-106-real/<태그>/results.json`, `visibility-results.json`, 실제 화면 PNG에 기록합니다. 결과의 PASS/FAIL/UNVERIFIED와 데이터 출처를 함께 읽어야 합니다. 가입과 LLM 요청이 허용된 로컬 개발 환경에서만 opt-in을 켜세요.
