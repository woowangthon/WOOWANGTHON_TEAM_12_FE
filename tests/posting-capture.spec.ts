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

  await page.getByLabel("캡처 파일").setInputFiles([await drawCapture(page, "문항 1", 600), await drawCapture(page, "문항 2", 3000)]);
  const thumbs = page.getByRole("list", { name: "넣은 캡처" });
  await expect(thumbs.getByRole("img")).toHaveCount(2);
  // 한 장 빼고 다시 넣을 수 있다
  await page.getByRole("button", { name: "캡처 2 빼기" }).click();
  await expect(thumbs.getByRole("img")).toHaveCount(1);
  await page.getByLabel("캡처 파일").setInputFiles([await drawCapture(page, "문항 2", 3000)]);
  await expect(thumbs.getByRole("img")).toHaveCount(2);

  await page.getByRole("button", { name: "캡처 2장 읽기" }).click();
  // 글 끝 「(500자)」는 목표 글자 수 칸으로 뗀다(FE#508)
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0].replace(/\s*\(500자\)$/, ""));
  await expect(page.getByLabel("문항 1 목표 글자 수", { exact: true })).toHaveValue("500");
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
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(PARSED.questions[1].replace(/\s*\(700자\)$/, ""));
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
  await page.getByLabel("캡처 파일").setInputFiles([await drawCapture(page, "흐린 화면", 400)]);
  await page.getByRole("button", { name: "캡처 1장 읽기" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "캡처에서 글자를 읽지 못했어요" });
  await expect(alert).toContainText("글자가 작거나 흐릴 수 있어요");
  // 정해진 결과로 칸을 채우지 않는다
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await alert.getByRole("button", { name: "글로 붙여 넣기" }).click();
  await expect(page.getByRole("list", { name: "넣은 캡처" })).toHaveCount(0);
  await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toBeFocused();
});

// FE#508 — 지원서 추가 두 단계: 넣기(칸 하나 · 「읽기」 하나) → 확인(원문 접힘 · 주 버튼 하나). 같은 문항은 하나로, 글 끝 「(N자)」는 목표 글자 수로
test("adding an application is two steps: one box and one button, then a review that merges the same question and keeps the panel closed", async ({ page }) => {
  await new FakeQuestionApi().install(page);
  const common = "다양한 IT 동아리 중에서 우리 동아리를 선택하고 지원하시게 된 이유를 작성해 주세요.";
  let parsed: unknown = {
    organization: "OO 연합 동아리", organizationType: "CLUB", jobRole: null, postingLines: [], readFrom: "TEXT",
    questions: [`${common} (1000자)`, "팀 프로젝트에서 맡은 역할과 협업 방식을 적어 주세요. (공백 포함 700자 이내)"],
  };
  await page.route("**/api/entrance/parse-application", r => r.fulfill({ json: parsed }));
  const widths = test.info().project.name === "desktop" ? [1440, 1024, 390] : [page.viewportSize()!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 1024 ? 844 : 1000 });
    await page.goto("/questions?new=1");
    const input = page.getByLabel("공고 · 문항 글이나 공고 링크");
    await expect(input).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    // 넣는 동안 차곡이 패널은 열리지 않고 위 「+ 지원 넣기」는 숨는다
    await expect(page.locator("#chagok-panel")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button", { name: "새 지원서", exact: true })).toHaveCount(0);
    await page.screenshot({ path: `artifacts/fe-508/input-${width}.png`, fullPage: true });

    // 넣었던 · 자주 나오는 문항 고르기는 확인 단계로 바로 간다
    await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
    const picker = page.getByRole("region", { name: "문항 고르기" });
    await expect(picker.getByRole("group", { name: "내가 넣었던 문항" })).toBeVisible();
    await page.screenshot({ path: `docs/fe-542/pick-${width}.png`, fullPage: true });
    await picker.getByRole("checkbox", { name: new RegExp(`^${common.slice(0, 20)}`) }).check();
    await picker.getByRole("button", { name: "고른 문항 1개 넣기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(common);
    await expect(page.getByLabel("문항 1 목표 글자 수", { exact: true })).toHaveValue("500");
    await expect(input).toHaveCount(0);

    // 채우기는 첫 화면과 하나 — 첫 화면에서 「직접 쓰기」로 오면 쓰던 칸이 그대로다(FE#542 · FE#565)
    await page.getByLabel("지원처 이름", { exact: true }).fill("직접 쓴 지원처");
    await page.getByRole("button", { name: "돌아가기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "어디에 지원하나요?" })).toBeVisible();
    await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(common);
    await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("직접 쓴 지원처");
    await page.getByLabel("지원처 이름", { exact: true }).fill("");

    // 같은 문항이 든 글을 읽으면 하나로 합치고 목표는 새로 읽은 쪽
    await page.getByRole("button", { name: "돌아가기", exact: true }).click();
    await input.fill("[OO 연합 동아리 12기]\n1. 지원 동기 (1000자)\n2. 팀 프로젝트 (공백 포함 700자 이내)");
    await page.getByRole("button", { name: "읽기", exact: true }).click();
    await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("팀 프로젝트에서 맡은 역할과 협업 방식을 적어 주세요.");
    await expect(page.getByLabel("문항 3", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("문항 1 목표 글자 수", { exact: true })).toHaveValue("1000");
    await expect(page.getByLabel("문항 2 목표 글자 수", { exact: true })).toHaveValue("700");
    await expect(input).toHaveCount(0);
    await expect(page.getByRole("region", { name: "공고 요건" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /나누기|^읽기$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // 버튼 옆 「분석 N회」 글자는 없다 — ✦ 마우스 올림으로만(S-15 · FE#542)
    await expect(page.getByText("분석 2회", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `docs/fe-542/review-${width}.png`, fullPage: true });

    // 캡처 확인 — 같은 칸에 고르면 캡처로 읽고, 확인 단계에서 캡처와 칸을 나란히
    parsed = PARSED;
    await page.goto("/questions?new=1");
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.getByLabel("캡처 파일").setInputFiles([await drawCapture(page, "문항 1", 600), await drawCapture(page, "문항 2", 1200)]);
    await page.getByRole("button", { name: "캡처 2장 읽기", exact: true }).click();
    await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("팀에서 갈등을 풀어 본 경험을 적어 주세요.");
    await page.screenshot({ path: `artifacts/fe-508/capture-${width}.png`, fullPage: true });
    parsed = { ...(PARSED as object), organization: "OO 연합 동아리", organizationType: "CLUB", readFrom: "TEXT",
      questions: [`${common} (1000자)`, "팀 프로젝트에서 맡은 역할과 협업 방식을 적어 주세요. (공백 포함 700자 이내)"] };
  }
});

// FE#564 — 넣기 첫 화면의 안내는 치면 사라지는 플레이스홀더가 아니라 제목 아래 설명 줄에 둔다. 칸에는 짧은 예시 한 줄만
test("the first step explains what to put in under the title, and the box only holds a short example", async ({ page }) => {
  await new FakeQuestionApi({ empty: true }).install(page);
  await page.goto("/questions");
  await expect(page.getByRole("heading", { name: "어디에 지원하나요?" })).toBeVisible();
  await expect(page.getByText(/^공고나 지원서 문항을 글로 붙여 넣거나, 공고 링크 · 화면 캡처를 넣어 주세요\./)).toBeVisible();
  const box = page.getByLabel("공고 · 문항 글이나 공고 링크");
  const placeholder = await box.getAttribute("placeholder");
  expect(placeholder).toMatch(/^예: \[OO 부트캠프 백엔드\]/);
  expect(placeholder).not.toContain("\n");
  expect(placeholder).not.toContain("Ctrl");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `docs/fe-564/intro-${page.viewportSize()!.width}.png`, fullPage: true });
});
