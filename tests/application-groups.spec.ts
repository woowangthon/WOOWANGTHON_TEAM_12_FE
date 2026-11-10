// 내 지원서 묶어 보기(FE#347) — 시기 · 종류 묶음과 순서. 브라우저 없이
import { test, expect } from "@playwright/test";
import { groupApplications } from "../src/lib/application-groups";

const apps = [
  { id: 1, applicationStatus: "SUBMITTED", submittedMonth: "2026-10", organizationType: "INTERN" },
  { id: 2, applicationStatus: "WRITING", submittedMonth: null, organizationType: null },
  { id: 3, applicationStatus: "PASSED", submittedMonth: "2026-11", organizationType: "BOOTCAMP" },
  { id: 4, applicationStatus: "UNKNOWN", submittedMonth: null, organizationType: "INTERN" },
  { id: 5, applicationStatus: "SUBMITTED", submittedMonth: "2026-10", organizationType: "CLUB" },
] as const;
const shape = (by: "period" | "type") => groupApplications([...apps], by).map((g) => [g.label, g.applications.map((a) => a.id)]);

test("시기별: 작성 중 → 낸 달 최근 먼저 → 낸 달 모름, 묶음 안은 받은 순서", () => {
  expect(shape("period")).toEqual([
    ["작성 중", [2]],
    ["2026년 11월", [3]],
    ["2026년 10월", [1, 5]],
    ["낸 달 모름", [4]],
  ]);
});

test("종류별: 고르는 목록 순서 → 종류 없음은 맨 뒤", () => {
  expect(shape("type")).toEqual([
    ["동아리 · 학회", [5]],
    ["부트캠프 · 교육 과정", [3]],
    ["인턴", [1, 4]],
    ["종류 없음", [2]],
  ]);
});

test("빈 목록은 묶음도 없다", () => {
  expect(groupApplications([], "period")).toEqual([]);
});
