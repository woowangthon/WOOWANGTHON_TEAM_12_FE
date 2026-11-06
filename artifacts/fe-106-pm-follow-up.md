# FE #106 PM 추가 조건

2026-11-06 확인. [QUEUED 인수 댓글](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_FE/issues/106#issuecomment-6678261040), [배치 안내 댓글](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_FE/issues/106#issuecomment-6678689341), [FE #147](https://github.com/woowangthon/WOOWANGTHON_TEAM_12_FE/issues/147)을 읽고 비교했습니다.

QUEUED 타입·집계·목록 처리는 이미 있었습니다. 표시 문구만 `대기 중`에서 PM이 지정한 `기다림`으로 변경했습니다. 자료 분석 상세에도 같은 문구를 적용했습니다.

기존 Sheet 본문은 `min-h-0 flex-1 overflow-y-auto`, 목록·링크는 `minmax(0,1fr)`와 긴 제목 줄바꿈을 사용합니다. 10개 표시를 위해 제품 레이아웃을 중복 수정하지 않았습니다. 자동화 검사에 10개 자료(기다림 8·분석 중 2)를 추가하여 1440·1024·390px에서 아래를 확인합니다.

- 10개 링크와 상태별 개수, 가로 넘침 없음
- 실제 컨테이너 스크롤로 마지막 작업 도달
- 키보드 Tab으로 마지막 작업과 뒤쪽 소식 도달 및 viewport 진입
- 마지막 작업 Enter로 해당 자료 분석 상세 이동

이번 추가 검사는 **테스트 API 응답 기반**입니다. 기존 실제 E2E의 13 통과·0 실패·1 미검증은 원본 증거와 함께 유지하며, 실제 10개 동시 AI 호출을 추가로 실행한 것으로 보고하지 않습니다.

## #147과 통합 지점

#147은 열려 있습니다. GitHub의 #147 관련 PR 검색, 열린 PR 검색 및 원격 전체 브랜치 목록(`git ls-remote --heads origin`)에서 해당 작업 브랜치·PR은 확인되지 않았습니다. 따라서 구체적인 상대 diff와 병합 충돌은 아직 판정할 수 없습니다.

#106의 `app-header.tsx` 변경은 `WorkButton` import와 사이드바 하단 버튼 삽입 두 곳입니다. #147이 이 파일의 상단 바·사이드바를 개편하므로 이 구간은 통합 시 충돌 가능성이 있습니다. `sidebar-layout.tsx`는 #106에서 변경하지 않았습니다.

알림 조회·Sheet·읽음 처리는 `src/components/work/`에 분리되어 있고 `WorkButton`은 export되어 있습니다. #147은 로그인 공통 레이아웃의 기존 `WorkProvider` 아래에서 `<WorkButton />`을 PC 상단 바 오른쪽에 배치하면 됩니다. 버튼 이동을 위해 별도 provider나 폴링을 추가할 필요가 없습니다. 그때 임시 사이드바 버튼과 별도 상태 바의 중복 버튼을 정리하고, 진행 요약의 위치를 조정하면 됩니다. #106에서 상단 바·사이드바 전체 개편이나 검색 버튼을 구현하지 않았습니다.

이번 추가 변경: `src/lib/api/work.ts`, `src/components/work/source-work-detail.tsx`, `tests/global-work.spec.ts` 및 이 보고서·PR 초안의 검증 기록.

## 최종 검사

`npm run check` 통과. 설치된 Chrome으로 실행한 #106 Playwright 회귀 검사 66개(22개 × 1440·1024·390px) 모두 통과했습니다. 새 10개 작업 검사도 세 폭 모두 통과했습니다. 첫 실행은 기본 Chromium 실행 파일이 없어 시작하지 못했으며 `PW_CHANNEL=chrome` 지정 후 재실행했습니다. 원시 집계 JSON·로그는 로컬 산출물로만 보관하고 커밋에서 제외합니다.

이번 추가 조건을 반영한 #106 PR은 생성 가능한 상태입니다. 기존 실제 FAILED 미검증과 [초기 전체 회귀의 main 재현 실패 기록](fe-106-real-e2e-report.md)은 그대로 공개해야 합니다. #147 작업이 시작되면 위 통합 지점을 다시 확인합니다.
