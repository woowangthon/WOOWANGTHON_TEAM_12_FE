// 쪽 · 슬라이드 구간 → text · sections 줄 번호 (계약 experience-api.md 「줄 세기」, FE#79) — 브라우저 없이
import { test, expect } from "@playwright/test";
import { emptyNotice, joinSections, sectionLabel } from "../src/lib/source-file/sections";

const lineOf = (text: string, n: number) => text.split("\n")[n - 1];

test("계약 예시 — 빈 쪽은 빼고, 쪽 사이 빈 줄은 어느 구간에도 들지 않는다", () => {
  const joined = joinSections("PAGE", [
    { number: 1, text: "김차곡 — 백엔드 개발자\n2025 캡스톤 「바꿔요」 백엔드" },
    { number: 2, text: "  \n " },
    { number: 3, text: "2024-09 ~ 알고리즘 스터디\n문제 선정을 맡는다" },
  ]);
  expect(joined.text).toBe("김차곡 — 백엔드 개발자\n2025 캡스톤 「바꿔요」 백엔드\n\n2024-09 ~ 알고리즘 스터디\n문제 선정을 맡는다");
  expect(joined.sections).toEqual([
    { kind: "PAGE", number: 1, startLine: 1, endLine: 2 },
    { kind: "PAGE", number: 3, startLine: 4, endLine: 5 },
  ]);
  expect(joined.emptyNumbers).toEqual([2]);
});

test("\\r\\n · \\r 을 \\n 으로 바꾼 뒤에 줄을 센다 — 보낸 text 를 \\n 으로 나눈 줄과 맞는다", () => {
  const joined = joinSections("SLIDE", [
    { number: 1, text: "\r\n제목 \r\n\r\n\r\n\r\n본문\r끝  \n" },
    { number: 2, text: "한 줄" },
  ]);
  expect(joined.text).not.toMatch(/\r/);
  expect(joined.text).toBe("제목\n\n본문\n끝\n\n한 줄");
  expect(joined.sections).toEqual([
    { kind: "SLIDE", number: 1, startLine: 1, endLine: 4 },
    { kind: "SLIDE", number: 2, startLine: 6, endLine: 6 },
  ]);
  for (const s of joined.sections) {
    expect(lineOf(joined.text, s.startLine).trim()).not.toBe("");
    expect(lineOf(joined.text, s.endLine).trim()).not.toBe("");
  }
  expect(joined.text.split("\n").length).toBe(joined.sections.at(-1)!.endLine);
});

test("글자가 하나도 없으면 sections 가 비고, 못 읽은 쪽 안내 · 근거 쪽 표시", () => {
  expect(joinSections("PAGE", [{ number: 1, text: "" }, { number: 2, text: " \n" }]).sections).toEqual([]);
  expect(emptyNotice("PAGE", { emptyNumbers: [], total: 3 })).toBeNull();
  expect(emptyNotice("PAGE", { emptyNumbers: [2, 5], total: 6 })).toContain("6쪽 중 2쪽(2 · 5쪽)");
  expect(emptyNotice("SLIDE", { emptyNumbers: [3], total: 4 })).toContain("4장 중 1장(슬라이드 3)");
  expect(sectionLabel({ kind: "PAGE", from: 2, to: 2 })).toBe("2쪽");
  expect(sectionLabel({ kind: "PAGE", from: 2, to: 3 })).toBe("2–3쪽");
  expect(sectionLabel({ kind: "SLIDE", from: 4, to: 4 })).toBe("슬라이드 4");
});
