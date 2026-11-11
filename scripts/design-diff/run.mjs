// 시안과 앱을 같은 폭에서 찍어 나란한 이미지와 계산된 스타일 차이 표를 낸다(FE#185).
// 쓰는 법은 README 「시안과 비교하기」. 화면별 선택자 짝은 screens/<화면>.json 하나씩.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "app-url": { type: "string" }, // 이미 띄운 목 모드 앱을 쓴다(이 폴더에서 next dev 가 돌고 있을 때)
    etc: { type: "string", default: "../WOOWANGTHON_TEAM_12_ETC" },
    widths: { type: "string", default: "1440,1024" },
  },
});

const available = readdirSync(path.join(HERE, "screens")).map(file => path.basename(file, ".json"));
const name = positionals[0];
if (!available.includes(name)) {
  console.error(`화면을 고르세요: npm run design:diff -- <화면>\n있는 화면: ${available.join(" · ")}`);
  process.exit(1);
}
const screen = JSON.parse(readFileSync(path.join(HERE, "screens", `${name}.json`), "utf8"));
const widths = options.widths.split(",").map(Number);
const designDir = path.resolve(ROOT, options.etc, "docs/design/chagok");
if (!existsSync(designDir)) {
  console.error(`시안이 없어요: ${designDir}\nETC 레포를 옆에 클론하거나 --etc <경로> 로 알려 주세요.`);
  process.exit(1);
}

const freePort = () => new Promise(resolve => {
  const probe = createNetServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

// 시안은 정적 파일이다 — 앱과 같은 http 로 연다
function serveDesign() {
  const server = createServer((request, response) => {
    const file = path.join(designDir, decodeURIComponent(new URL(request.url, "http://x").pathname));
    if (!file.startsWith(designDir) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, () => resolve({ url: `http://localhost:${server.address().port}`, close: () => server.close() })));
}

// API 주소를 비운 목 모드로 띄운다 — 실제 서버에 닿지 않는다.
// 화면에 "api": "fake-question" 이 있으면 API 주소를 앱 자신(/api)으로 두고, 브라우저에서 시험용 가짜 BE(tests/fake-question-api.ts)가 받는다(FE#532)
async function startApp() {
  if (options["app-url"]) return { url: options["app-url"].replace(/\/+$/, ""), close() {} };
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], {
    cwd: ROOT, stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: screen.api ? `${url}/api` : "" },
  });
  const close = () => {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill();
  };
  for (let tries = 0; tries < 240; tries += 1) {
    if (child.exitCode !== null) throw new Error("next dev 가 멈췄어요. 이 폴더에서 이미 돌고 있다면 --app-url http://localhost:3000 을 쓰세요(목 모드여야 해요).");
    if (await fetch(url).then(() => true, () => false)) return { url, close };
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  close();
  throw new Error("next dev 가 2분 안에 뜨지 않았어요.");
}

// 브라우저가 계산한 최종 값 — 코드를 읽지 않는다. 표의 항목 이름이 screens 의 intent 키다
function readStyle(element, { pseudo, extra }) {
  const style = getComputedStyle(element, pseudo);
  const rect = element.getBoundingClientRect();
  const px = value => (value === "normal" ? "0px" : value);
  const size = value => `${Math.round(value * 10) / 10}px`;
  // 50% · 30px · Tailwind 의 rounded-full 은 끝이 둥근 같은 모양이다 — 값이 달라도 차이로 세지 않는다
  const shortSide = Math.min(rect.width, rect.height);
  const corner = value => {
    const radius = value.endsWith("%") ? parseFloat(value) * shortSide / 100 : parseFloat(value);
    return shortSide > 0 && radius >= shortSide / 2 ? "둥근끝" : value;
  };
  // 글자를 직접 가진 요소만 글자 값을 잰다 — 감싸는 상자의 값은 화면에 나타나지 않는다
  const hasText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const text = value => (!pseudo && hasText ? value : null);
  return {
    "글자 크기": text(style.fontSize),
    굵기: text(style.fontWeight),
    "줄 높이": text(style.lineHeight),
    "글자 간격": text(px(style.letterSpacing)),
    "안쪽 여백": [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(" "),
    "바깥 여백": [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].join(" "),
    높이: pseudo ? style.height : size(rect.height),
    너비: pseudo ? style.width : size(rect.width),
    간격: `${px(style.rowGap)} ${px(style.columnGap)}`,
    모서리: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(corner).join(" "),
    ...Object.fromEntries((extra ?? []).map(property => [property, style[property]])),
  };
}

async function measure(page, pair, selector) {
  const element = page.locator(selector).first();
  if (!await element.count()) return null;
  return element.evaluate(readStyle, { pseudo: pair.pseudo, extra: pair.extra });
}

async function open(page, url, steps = []) {
  await page.goto(url, { timeout: 120000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const step of steps) await page.locator(step.click).first().click({ timeout: 10000 });
  await page.waitForTimeout(400); // 열림 애니메이션이 끝난 뒤의 값을 잰다
}

const numbers = value => value.split(" ").map(part => (/^-?[\d.]+(px)?$/.test(part) ? parseFloat(part) : NaN));

// 둘 다 숫자면 0.5px 안쪽 차이는 같다고 본다(반올림 · 소수 너비)
function same(a, b) {
  if (a === b) return true;
  const [left, right] = [numbers(a), numbers(b)];
  return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) < 0.5);
}

function gap(a, b) {
  const [left, right] = [numbers(a), numbers(b)];
  if (left.length !== 1 || right.length !== 1 || left.some(Number.isNaN) || right.some(Number.isNaN)) return "";
  const delta = Math.round((right[0] - left[0]) * 10) / 10;
  return `${delta > 0 ? "+" : ""}${delta}`;
}

const cell = value => String(value).replaceAll("|", "\\|");

function compare(pair, design, app) {
  if (!design || !app) {
    return { rows: [`| ${pair.name} | 요소 | ${design ? "있음" : "**못 찾음**"} | ${app ? "있음" : "**못 찾음**"} |  | 선택자 확인 |`], matched: 0 };
  }
  const rows = [];
  let matched = 0;
  for (const [label, value] of Object.entries(design)) {
    if (value === null || app[label] === null) continue; // 한쪽이라도 글자가 없으면 견줄 값이 없다
    if (same(value, app[label])) { matched += 1; continue; }
    const why = pair.intent?.[label];
    rows.push(`| ${pair.name} | ${label} | ${cell(value)} | ${cell(app[label])} | ${gap(value, app[label])} | ${why ? `의도 — ${cell(why)}` : ""} |`);
  }
  return { rows, matched };
}

// 이미지 도구를 더하지 않는다 — 브라우저로 두 장을 나란히 놓고 한 장으로 찍는다
async function sideBySide(page, design, app, width, file) {
  const shot = buffer => `data:image/png;base64,${buffer.toString("base64")}`;
  const figure = (label, source) => `<figure style="margin:0"><figcaption style="padding:8px 0;font:600 16px sans-serif">${label}</figcaption><img src="${source}" width="${width}" style="display:block;border:1px solid #bbb" /></figure>`;
  await page.setViewportSize({ width: width * 2 + 72, height: 600 });
  await page.setContent(`<div style="display:flex;gap:24px;padding:12px;background:#fff">${figure("시안", shot(design))}${figure("앱", shot(app))}</div>`, { waitUntil: "load" });
  await page.screenshot({ path: file, fullPage: true });
}

// 시험과 같은 가짜 BE · 로그인 응답(tests/signed-in.ts) — 계약 예시 지원서 하나를 연다. TS 라 jiti 로 읽는다
async function installFakeQuestionApi(context, page) {
  const { createJiti } = await import("jiti");
  const { FakeQuestionApi } = await createJiti(import.meta.url).import("../../tests/fake-question-api.ts");
  await context.route("**/api/auth/me", route => route.fulfill({ json: { id: 1, loginId: "test", dailyAnalysis: { used: 3, limit: 200 } } }));
  await context.route("**/api/work", route => route.fulfill({ json: { seenAt: null, inProgress: [], recent: [] } }));
  await new FakeQuestionApi({ sameApplication: true }).install(page);
}

async function compareWidth(browser, urls, width, outDir) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  // 앱은 1280 미만에서 레일이다 — 시안도 접어서 같은 작업 면을 본다
  if (width < 1280) await context.addInitScript(() => { try { localStorage.setItem("drawer", "collapsed"); } catch { /* 저장소가 없어도 시안은 뜬다 */ } });
  const designPage = await context.newPage();
  const appPage = await context.newPage();
  if (screen.api === "fake-question") await installFakeQuestionApi(context, appPage);
  await open(designPage, `${urls.design}/${screen.design}`, screen.open?.design);
  await open(appPage, `${urls.app}${screen.app}`, screen.open?.app);

  const rows = [];
  let matched = 0;
  for (const pair of screen.pairs) {
    const result = compare(pair, await measure(designPage, pair, pair.design), await measure(appPage, pair, pair.app));
    rows.push(...result.rows);
    matched += result.matched;
  }
  const [designShot, appShot] = [await designPage.screenshot(), await appPage.screenshot()];
  await sideBySide(appPage, designShot, appShot, width, path.join(outDir, `${width}.png`));
  await context.close();

  const summary = `같음 ${matched}칸 · 다름 ${rows.length}칸 (의도 ${rows.filter(row => row.includes("| 의도 — ")).length})`;
  const table = rows.length ? ["| 요소 | 항목 | 시안 | 앱 | 차이 | 비고 |", "| --- | --- | --- | --- | --- | --- |", ...rows] : ["차이 없음."];
  return [`## ${width}px — ${summary}`, "", `![${width}px 시안과 앱](${width}.png)`, "", ...table, ""].join("\n");
}

const outDir = path.join(ROOT, "artifacts/design-diff", name);
mkdirSync(outDir, { recursive: true });
const design = await serveDesign();
const app = await startApp();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
try {
  const sections = [];
  for (const width of widths) sections.push(await compareWidth(browser, { design: design.url, app: app.url }, width, outDir));
  const report = [`# 시안 비교 — ${name}`, "", "브라우저가 계산한 값의 차이만 적는다. 값은 시안 → 앱, 차이는 앱 − 시안(px).", "", ...sections].join("\n");
  writeFileSync(path.join(outDir, "report.md"), report);
  console.log(report);
  console.log(`\n이미지 · 표: ${path.relative(ROOT, outDir)}`);
} finally {
  await browser.close();
  design.close();
  app.close();
}
