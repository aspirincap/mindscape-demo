import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
import { sample } from './eeg-fixture.mjs';
const base = process.env.EEG_TEST_URL || 'http://127.0.0.1:5186';
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const fallback = existsSync(cache) ? readdirSync(cache).filter(n => /^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n => join(cache, n, `chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'chrome-headless-shell')).find(existsSync) : undefined;
const browser = await chromium.launch({ headless: true, executablePath: existsSync(chromium.executablePath()) ? undefined : fallback, proxy: process.env.EEG_TEST_PROXY ? { server: process.env.EEG_TEST_PROXY } : undefined });
let ws, ping, dataTimer, lease, seq = 0; const errors = [], checks = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.getByRole('button', { name: '调节共鸣', exact: true }).click(); await page.getByRole('button', { name: '设备接入', exact: true }).click();
  await page.getByText('未接入', { exact: true }).waitFor(); assert.equal(await page.getByTestId('eeg-attention').innerText(), '—');
  // Let the page establish its cookie before the test obtains the same session.
  // Otherwise two concurrent bootstrap requests create different cloud sessions.
  await page.getByText('会话已连接', { exact: true }).waitFor({ timeout: 20000 });
  const s = await (await page.request.get(base + '/api/session')).json();
  ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws?role=device', { headers: { Authorization: `Bearer ${s.token}` }, agent: process.env.EEG_TEST_PROXY ? new HttpsProxyAgent(process.env.EEG_TEST_PROXY) : undefined });
  ws.on('message', raw => { const d = JSON.parse(raw); if (d.lease) lease = d.lease; });
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const heartbeat = () => { if (ws.readyState === 1) { ws.send(JSON.stringify({ type: 'ping', protocol: EEG_PROTOCOL, id: performance.now() })); if (lease) ws.send(JSON.stringify({ type: 'bridge-status', protocol: EEG_PROTOCOL, serial: 'connected' })); } };
  heartbeat(); ping = setInterval(heartbeat, 800); await pause(1200);
  const send = (poor = 0) => { const d = sample(++seq); d.frame.poorSignal = poor; ws.send(JSON.stringify({ ...d, lease })); };
  dataTimer = setInterval(() => send(), 1050);
  await page.getByText('信号稳定 · 未校准', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByTestId('eeg-attention').innerText(), '70'); assert.equal(await page.getByTestId('eeg-relaxation').innerText(), '23');
  await page.getByRole('button', { name: '开始脑电氛围', exact: true }).click(); await page.getByRole('button', { name: '校准个人基线', exact: true }).click();
  await page.getByText(/校准 .*专注 [1-9] \/ 25/).waitFor(); clearInterval(dataTimer); dataTimer = null; checks.push('real WS → UI scores, no fabricated HR, independent calibration count');
  send(200); await pause(600); assert.equal(await page.getByTestId('eeg-attention').innerText(), '—'); checks.push('contact loss immediately clears usable score');
  await page.getByRole('button', { name: '模拟器', exact: true }).click(); await page.getByRole('button', { name: '设备接入', exact: true }).click(); assert.equal(await page.getByTestId('eeg-attention').innerText(), '—');
  dataTimer = setInterval(() => send(), 1050); await pause(4200); await page.getByRole('button', { name: '开始脑电氛围', exact: true }).click();
  await page.getByRole('button', { name: '关闭共鸣面板', exact: true }).click();
  await page.getByRole('button', { name: '直接探索 12 个世界', exact: true }).click();
  for (const name of ['富士山', '大峡谷', '帕劳']) {
    await page.getByRole('button', { name: `选择目的地：${name}`, exact: true }).click(); await page.getByRole('button', { name: `进入${name}`, exact: true }).click();
    await page.getByRole('button', { name: /开启手势/ }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: '调节共鸣', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '设备接入', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '开启 60 秒旅程', exact: true }).click();
    await page.getByRole('button', { name: '调节共鸣', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '设备接入', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '关闭共鸣面板', exact: true }).click();
    await page.getByRole('button', { name: /视觉调节/ }).click(); await page.getByRole('button', { name: '原始点云', exact: true }).click(); await page.getByRole('button', { name: '完整光影', exact: true }).click(); await page.getByRole('button', { name: '关闭视觉调节', exact: true }).click();
    await mkdir('artifacts/eeg', { recursive: true }); await page.screenshot({ path: `artifacts/eeg/${name}.png` });
    checks.push(`${name}: device source retained in breath guide, visual comparisons and gesture entry available`);
    await page.getByRole('button', { name: '返回地球', exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '调节共鸣', exact: true }).click();
  const panel = await page.getByRole('dialog', { name: '实时状态与模拟器' }).boundingBox(); assert.ok(panel.x >= 0 && panel.x + panel.width <= 391);
  await page.screenshot({ path: 'artifacts/eeg/mobile-panel.png' }); checks.push('mobile EEG controls fit viewport');
  assert.deepEqual(errors, []); await writeFile('artifacts/eeg/browser.json', JSON.stringify({ base, checks, errors }, null, 2)); console.log(checks.join('\n'));
} catch (error) { for (const context of browser.contexts()) for (const page of context.pages()) console.error((await page.locator('.eeg-feedback').innerText().catch(() => '')).slice(0,2500)); throw error; } finally { clearInterval(ping); clearInterval(dataTimer); ws?.terminate(); await browser.close(); }
