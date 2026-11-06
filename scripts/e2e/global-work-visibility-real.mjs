// Native Chromium tab visibility, with real authentication/BE/DB and zero AI requests.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

if (process.env.FE106_REAL_E2E !== '1') throw new Error('Opt in with FE106_REAL_E2E=1; creates one isolated test account.');
const fe = process.env.FE106_FE_URL || 'http://localhost:3000';
const be = process.env.FE106_BE_URL || 'http://localhost:8080/api';
for (const url of [fe, be]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Only loopback services are allowed.');
const cache = path.resolve('.cache');
fs.mkdirSync(cache, { recursive: true });
const artifactRoot = path.resolve('artifacts/fe-106-real');
const output = path.resolve(process.env.FE106_OUTPUT_DIR || path.join(artifactRoot, 'visibility-' + Date.now()));
if (!output.startsWith(artifactRoot + path.sep)) throw new Error('Unexpected output directory');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(cache, 'fe106-visibility-owned-'));
const result = { result: 'UNVERIFIED', fe, be, mockedRequests: 0, llmJobs: 0, method: 'Native same-window tab activation; connectOverCDP noDefaults=true', startedAt: new Date().toISOString() };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ensure = (value, message) => { if (!value) throw new Error(message); };
async function until(read, condition, timeout) {
  const end = Date.now() + timeout;
  do { const value = await read(); if (condition(value)) return value; await pause(100); } while (Date.now() < end);
  throw new Error('Timed out awaiting native visibility/network state');
}
let processHandle, browser, cdp, context, authenticated = false;
async function api(route, method = 'GET', data) {
  let response;
  try { response = await context.request.fetch(be + route, { method, data, timeout: 10000, headers: { Origin: fe } }); }
  catch { throw new Error('Real authentication/network request unavailable'); }
  ensure(response.ok(), 'Real API returned HTTP ' + response.status());
  return response.status() === 204 ? null : response.json();
}
try {
  processHandle = spawn(process.env.FE106_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(async () => fs.existsSync(portFile), Boolean, 15000);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  ensure(Number.isInteger(port) && port > 0, 'Invalid private debugging port');
  // Default overrides must be disabled on the actual default context. A second CDP session cannot undo Playwright's own focus override.
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { noDefaults: true });
  context = browser.contexts()[0];
  const page = context.pages()[0];
  await page.setViewportSize({ width: 1440, height: 1000 });
  const loginId = 'fe106v_' + new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '_' + crypto.randomBytes(2).toString('hex');
  const password = crypto.randomBytes(24).toString('base64url');
  const me = await api('/auth/signup', 'POST', { loginId, password });
  authenticated = true; result.testAccount = { userId: me.id, loginId };
  const snapshot = await api('/work');
  ensure(!snapshot.inProgress.length && !snapshot.recent.length, 'Dedicated account was not empty');
  const requests = [], responses = [];
  page.on('request', request => { if (request.url() === be + '/work' && request.method() === 'GET') requests.push(Date.now()); });
  page.on('response', response => { if (response.url() === be + '/work' && response.request().method() === 'GET') responses.push(response.status()); });
  await page.goto(fe + '/experience', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /^진행 중인 일 / }).first().waitFor({ timeout: 30000 });
  await until(async () => responses.includes(200), Boolean, 10000);
  const pageCdp = await context.newCDPSession(page);
  cdp = await browser.newBrowserCDPSession();
  const { targetInfo } = await pageCdp.send('Target.getTargetInfo');
  await cdp.send('Target.activateTarget', { targetId: targetInfo.targetId });
  await until(() => page.evaluate(() => document.visibilityState), state => state === 'visible', 5000);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false, background: false });
  await cdp.send('Target.activateTarget', { targetId });
  await until(() => page.evaluate(() => document.visibilityState), state => state === 'hidden', 5000);
  await pause(500);
  const count = requests.length;
  await pause(32000);
  const hiddenPolls = requests.length - count;
  ensure(hiddenPolls === 0, 'GET /api/work continued while actually hidden');
  const restoredAt = Date.now();
  await cdp.send('Target.activateTarget', { targetId: targetInfo.targetId });
  await until(() => page.evaluate(() => document.visibilityState), state => state === 'visible', 5000);
  await until(async () => requests.length > count, Boolean, 5000);
  const resumedWithinMs = requests[count] - restoredAt;
  ensure(resumedWithinMs < 2000, 'Foreground work refresh was not immediate');
  result.result = 'PASS'; result.evidence = { before: 'visible', background: 'hidden', after: 'visible', hiddenSeconds: 32, hiddenPolls, resumedWithinMs, actualWorkHttp200: responses.includes(200), defaultFocusEmulationDisabled: true, documentVisibilityNotOverridden: true };
} catch (error) {
  result.result = authenticated ? 'FAIL' : 'UNVERIFIED';
  result.reason = error.message.includes('/devtools/') ? 'Native browser connection failed' : error.message;
} finally {
  if (authenticated) await api('/auth/logout', 'POST').catch(() => {});
  await cdp?.send('Browser.close').catch(() => {});
  await browser?.close().catch(() => {});
  await pause(2000);
  if (processHandle?.exitCode === null) processHandle.kill(); // Only the browser spawned by this script.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) !== cache || !path.basename(resolved).startsWith('fe106-visibility-owned-')) throw new Error('Refusing unexpected cleanup target');
  try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); result.temporaryProfileRemoved = true; }
  catch {
    // OneDrive/Windows can retain read-only attributes after Chromium exits. Recheck the absolute parent in the same shell that removes this owned profile.
    const cleanup = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$root=[System.IO.Path]::GetFullPath($env:FE106_OWNED_CACHE); $target=(Resolve-Path -LiteralPath $env:FE106_OWNED_PROFILE).Path; if ([System.IO.Path]::GetDirectoryName($target) -ne $root -or [System.IO.Path]::GetFileName($target) -notlike "fe106-visibility-owned-*") { exit 3 }; Remove-Item -LiteralPath $target -Recurse -Force; if (Test-Path -LiteralPath $target) { exit 1 }'], { windowsHide: true, stdio: 'ignore', timeout: 30000, env: { ...process.env, FE106_OWNED_CACHE: cache, FE106_OWNED_PROFILE: resolved } });
    result.temporaryProfileRemoved = cleanup.status === 0 && !fs.existsSync(resolved);
  }
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'visibility-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  process.exitCode = result.result === 'FAIL' ? 1 : result.result === 'PASS' ? 0 : 2;
}
