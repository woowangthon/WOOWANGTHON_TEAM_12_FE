// FE#495 — 공고 · 문항 캡처(S-92): 이미지를 넣으면 브라우저에서 줄여 base64 로 보내고, 확인 단계에서 캡처와 칸을 나란히 보인다
// parse-application 응답은 목 서버로 흉내만 낸다(실제 AI 가 캡처를 읽은 게 아니다)
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";

// 구글폼 문항 화면을 찍은 것처럼 — 문항만 차고 지원처 · 종류 · 직무 · 공고 줄은 빈다(계약 응답 모양 그대로)
const PARSED = {
  organization: null, organizationType: null, jobRole: null, postingLines: [], readFrom: "IMAGE",
  questions: ["우리 동아리에 지원한 동기를 적어 주세요. (500자)", "팀에서 갈등을 풀어 본 경험을 적어 주세요. (700자)"],
};

/** 시험용 캡처 — 브라우저 캔버스로 글자를 그린 png(지어낸 화면이다). 한 장은 긴 변 2000px 를 넘게 그려 줄이는지 본다 */
async function drawCapture(page: Page, label: string, height: number) {
  const base64 = await page.evaluate(([text, h]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = h;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff"; c.fillRect(0, 0, 800, h);
    c.fillStyle = "#222"; c.font = "32px sans-serif"; c.fillText(text, 40, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  }, [label, height] as const);
  return { name: `${label}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("two captures are shrunk, read, and shown beside the fields with a check-me tag", async ({ page }) => {
  await new FakeQuestionApi({ empty: true }).install(page);
  let sent: { images?: { mediaType: string; data: string }[] } | null = null;
  await page.route("**/api/entrance/parse-application", async r => { sent = r.request().postDataJSON(); await r.fulfill({ json: PARSED }); });
  await page.goto("/questions");
  // S-16 — 캡처도 외부 AI 로 간다는 한 줄이 나누기 전에 보인다
  await expect(page.getByText(/캡처는 분석을 위해 외부 AI 제공사\(OpenAI\)로 보내져요/)).toBeVisible();

  await page.getByLabel("캡처 고르기").setInputFiles([await drawCapture(page, "문항 1", 600), await drawCapture(page, "문항 2", 3000)]);
  const thumbs = page.getByRole("list", { name: "넣은 캡처" });
  await expect(thumbs.getByRole("img")).toHaveCount(2);
  // 한 장 빼고 다시 넣을 수 있다
  await page.getByRole("button", { name: "캡처 2 빼기" }).click();
  await expect(thumbs.getByRole("img")).toHaveCount(1);
  await page.getByLabel("캡처 고르기").setInputFiles([await drawCapture(page, "문항 2", 3000)]);
  await expect(thumbs.getByRole("img")).toHaveCount(2);

  await page.getByRole("button", { name: "캡처 2장 AI 로 나누기" }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  // 보낸 것 — images 만, base64(머리 없이), 긴 변 2000px 이하로 줄였다
  expect(sent).not.toBeNull();
  expect(Object.keys(sent!)).toEqual(["images"]);
  expect(sent!.images!.map(i => i.mediaType)).toEqual(["image/png", "image/png"]);
  expect(sent!.images![0].data.startsWith("data:")).toBe(false);
  const sizes = await page.evaluate(async images => Promise.all(images.map(async i => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${i.mediaType};base64,${i.data}`)).blob());
    return [bitmap.width, bitmap.height];
  })), sent!.images!);
  expect(sizes).toEqual([[800, 600], [533, 2000]]);

  // 문항만 찬다 — 지원처는 빈 채로 사용자가 칩으로
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(PARSED.questions[1]);
  await expect(page.getByLabel("지원처 이름")).toHaveValue("");
  await expect(page.getByText("캡처에서 읽음 — 확인해 주세요")).toHaveCount(2);
  await expect(thumbs).toHaveCount(0);

  // 캡처 나란히 — PC 는 왼쪽 열, 좁은 폭은 접힌 한 줄을 펼친다
  const pane = page.getByRole("region", { name: "읽은 캡처" });
  if (page.viewportSize()!.width < 1024) {
    await expect(pane.getByRole("img")).toHaveCount(0);
    await pane.getByRole("button", { name: "캡처 2장 보기" }).click();
  } else {
    const [paneBox, questionBox] = [await pane.boundingBox(), await page.getByLabel("문항 1", { exact: true }).boundingBox()];
    expect(paneBox!.x + paneBox!.width).toBeLessThanOrEqual(questionBox!.x);
  }
  await expect(pane.getByRole("img")).toHaveCount(2);
  await page.screenshot({ path: `artifacts/posting-capture-${page.viewportSize()!.width}.png`, fullPage: true });
});

test("a capture the AI cannot read shows why and goes back to pasting text", async ({ page }) => {
  await new FakeQuestionApi({ empty: true }).install(page);
  await page.route("**/api/entrance/parse-application", r => r.fulfill({ status: 422, json: { error: { code: "IMAGE_UNREADABLE", message: "캡처에서 글자를 거의 찾지 못했어요 — 글자가 작거나 흐릴 수 있어요" } } }));
  await page.goto("/questions");
  await page.getByLabel("캡처 고르기").setInputFiles([await drawCapture(page, "흐린 화면", 400)]);
  await page.getByRole("button", { name: "캡처 1장 AI 로 나누기" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "캡처에서 글자를 읽지 못했어요" });
  await expect(alert).toContainText("글자가 작거나 흐릴 수 있어요");
  // 정해진 결과로 칸을 채우지 않는다
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await alert.getByRole("button", { name: "글로 붙여 넣기" }).click();
  await expect(page.getByRole("list", { name: "넣은 캡처" })).toHaveCount(0);
  await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toBeFocused();
});
