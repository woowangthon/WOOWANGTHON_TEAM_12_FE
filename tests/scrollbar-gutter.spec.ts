// FE#585 — 접기 · 펴기로 페이지가 스크롤될 만큼 길어졌다 짧아져도 본문 폭이 변하지 않는다(스크롤바 자리를 비워 둔다)
// 헤드리스 크롬은 스크롤바를 숨겨 폭이 변하지 않는다 — 이 파일만 실제 스크롤바가 보이게 띄운다
import { test, expect } from "./signed-in";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("스크롤바가 생기고 사라져도 본문 폭이 그대로다", async ({ page }) => {
  await page.goto("/no-such-page"); // 짧은 화면(찾을 수 없음)이라 창 높이로 스크롤 여부가 갈린다
  await page.waitForLoadState("domcontentloaded");
  // 본문 폭으로 본다 — 크롬은 스크롤바가 없을 때 비워 둔 자리까지 documentElement.clientWidth 에 넣는다
  const width = () => page.evaluate(() => document.body.getBoundingClientRect().width);
  const scrollable = () => page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
  // 창 높이로 화면이 길어졌다 짧아지는 걸 만든다 — 접기 · 펴기로 내용 길이가 바뀌는 것과 같은 일이다
  const w = page.viewportSize()!.width;
  await page.setViewportSize({ width: w, height: 1000 });
  await expect.poll(scrollable).toBe(false);
  const without = await width();
  await page.setViewportSize({ width: w, height: 150 });
  await expect.poll(scrollable).toBe(true);
  expect(await width()).toBe(without);
});
