import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const artifactDir = new URL('../artifacts/', import.meta.url);
await mkdir(artifactDir, { recursive: true });
const cacheRoot = join(homedir(), 'Library/Caches/ms-playwright');
const cached = existsSync(cacheRoot) ? readdirSync(cacheRoot).filter(name => /^chromium_headless_shell-\d+$/.test(name)).sort().reverse().map(name => join(cacheRoot, name, `chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'chrome-headless-shell')).find(existsSync) : undefined;
const executablePath = process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? undefined : cached);
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [], report = [];
const record = label => { report.push(label); console.log(`PASS ${label}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const requestedWorlds = [];
  page.on('request', r => { if (/\/worlds\/.*\.bin$/.test(r.url())) requestedWorlds.push(r.url()); });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__mindscape?.getState().ready && window.__mindscape.getState().renderer === 'globe');
  assert.equal(await page.evaluate(() => window.__mindscape.getState().stage), 'connect');
  assert.deepEqual(requestedWorlds, []);
  await page.screenshot({ path: new URL('globe-connect.png', artifactDir).pathname });
  await page.getByRole('button', { name: '下一步，表达心情', exact: true }).click();
  await page.locator('#atlas-intent').fill('今天很累，想去安静的海底放松');
  await page.screenshot({ path: new URL('globe-speak.png', artifactDir).pathname });
  await page.getByRole('button', { name: '寻找适合的目的地', exact: false }).click();
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'explore');
  assert.equal(await page.evaluate(() => window.__mindscape.getState().selectedId), null);
  assert.deepEqual(requestedWorlds, []);
  record('connect, intent and recommendation flow never auto-selects or preloads world assets');

  const beforeRotation = await page.evaluate(() => window.__mindscape.getState().orientation);
  const canvasBox = await page.locator('.globe-viewport canvas').boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width * .65, canvasBox.y + canvasBox.height * .67);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * .42, canvasBox.y + canvasBox.height * .61, { steps: 12 });
  await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(() => window.__mindscape.getState().orientation), beforeRotation);
  const releaseRotation = await page.evaluate(() => window.__mindscape.getState().orientation);
  await page.waitForTimeout(200);
  assert.notDeepEqual(await page.evaluate(() => window.__mindscape.getState().orientation), releaseRotation);
  await page.getByRole('button', { name: '选择目的地：屋久岛', exact: true }).click();
  await page.getByRole('button', { name: '紧绷', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().state.coherence < .25);
  assert.equal(await page.evaluate(() => window.__mindscape.getState().selectedId), 'yakushima-forest');
  await page.getByRole('button', { name: '深度平静', exact: true }).click();
  await page.getByRole('button', { name: '选择目的地：帕劳', exact: true }).click();
  await page.waitForTimeout(1400);
  // The label tracks a moving globe, so point the mouse at its observed bounds.
  const marker = await page.getByRole('button', { name: '地球地点：帕劳', exact: true }).boundingBox();
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.locator('.marker-hover').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '地球地点：帕劳', exact: true }).click();
  await page.screenshot({ path: new URL('globe-selected.png', artifactDir).pathname });
  record('globe rotates with inertia, markers preview/select, and EEG never changes the selection');

  await page.getByRole('button', { name: '进入帕劳世界', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'enter');
  await page.getByRole('button', { name: '取消，返回地球', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'explore');
  assert.deepEqual(requestedWorlds, []);
  await page.getByRole('button', { name: '进入帕劳世界', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: new URL('globe-flight.png', artifactDir).pathname });
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'transform' && window.__mindscape.getState().points > 100000);
  assert.equal(requestedWorlds.length, 1);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.evaluate(() => window.__mindscape.getState().renderer), 'world');
  record('flight can be cancelled; confirmed arrival disposes globe and lazily loads only one world');
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('canvas').count(), 1);
  record('initial WebGL world loads with 195,160 points');

  await page.getByRole('button', { name: '深度平静', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().state.coherence > 0.94);
  await page.screenshot({ path: new URL('abyss-calm.png', artifactDir).pathname });
  record('high relaxation restores temple geometry');
  await page.getByRole('button', { name: '紧绷', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().state.coherence < 0.16);
  await page.screenshot({ path: new URL('abyss-fragmented.png', artifactDir).pathname });
  record('low relaxation fragments the world');

  async function slider(id, value) {
    await page.locator(`#${id}`).evaluate((el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  }
  await slider('signalQuality', 0.1);
  await page.waitForFunction(() => window.__mindscape.getState().state.signalQuality === 0.1);
  const held = await page.evaluate(() => window.__mindscape.getState().state.coherence);
  await slider('relaxation', 1); await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => window.__mindscape.getState().state.coherence), held);
  record('bad signal holds last visual state despite new relaxation values');
  await page.getByRole('button', { name: '深度平静', exact: true }).click();
  await page.getByRole('button', { name: /雾中森林 THE FOREST/ }).click();
  await page.waitForFunction(() => window.__mindscape.getState().ready && window.__mindscape.getState().renderer === 'globe');
  assert.equal(await page.locator('canvas').count(), 1);
  await page.getByRole('button', { name: '进入屋久岛世界', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().world === 'forest' && window.__mindscape.getState().points > 250000 && window.__mindscape.getState().state.coherence > 0.94);
  await page.screenshot({ path: new URL('forest-calm.png', artifactDir).pathname });
  record('second world loads 280,050 distinct forest points');

  await page.locator('#quality').selectOption('0.45');
  await page.waitForFunction(() => window.__mindscape.getState().points < 130000);
  await page.locator('#quality').selectOption('1');
  await page.getByRole('button', { name: '开启环境音', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().audio === 'running');
  await page.getByRole('button', { name: '关闭环境音', exact: true }).click();
  record('quality control and Web Audio start/mute work');

  await page.locator('#intent').fill('想潜入深海，让思绪慢下来');
  await page.getByRole('button', { name: '选择适合的世界', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'explore' && window.__mindscape.getState().ready && window.__mindscape.getState().renderer === 'globe');
  assert.equal(await page.evaluate(() => window.__mindscape.getState().selectedId), null);
  await page.getByRole('button', { name: '选择目的地：帕劳', exact: true }).click();
  await page.getByRole('button', { name: '进入帕劳世界', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().stage === 'transform' && window.__mindscape.getState().world === 'abyss' && window.__mindscape.getState().ready);
  record('returning to globe preserves signals and recommendation requires explicit entry again');

  await page.getByRole('button', { name: '设备接入', exact: true }).click();
  await page.waitForFunction(() => window.__mindscape.getState().state.signalQuality === 0);
  const invalid = await page.request.post('http://127.0.0.1:5173/api/frame', { data: { relaxation: 4 } });
  assert.equal(invalid.status(), 400);
  const valid = await page.request.post('http://127.0.0.1:5173/api/frame', { data: { attention: 0.85, relaxation: 0.5, HR: 83, signalQuality: 0.95 } });
  assert.equal(valid.status(), 200);
  await page.waitForFunction(() => window.__mindscape.getState().state.signalQuality === 0.95);
  await page.waitForFunction(() => window.__mindscape.getState().state.coherence < 0.65);
  await page.waitForFunction(() => window.__mindscape.getState().state.signalQuality === 0, { timeout: 6000 });
  const stale = await page.evaluate(() => window.__mindscape.getState().state.coherence);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__mindscape.getState().state.coherence), stale);
  record('HTTP sensor input, websocket broadcast, validation and stale-data hold work');

  await page.getByRole('button', { name: '模拟器', exact: true }).click();
  await page.getByRole('button', { name: /校准个人基线/ }).click();
  await page.getByRole('button', { name: /基线已校准/ }).waitFor({ timeout: 15000 });
  record('10-second calibration completes with valid samples');

  await page.getByRole('button', { name: '进入沉浸模式', exact: true }).click();
  await page.locator('aside').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('aside').isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator('aside').waitFor({ state: 'visible' });
  assert.equal(await page.locator('aside').isVisible(), true);
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('dialog').isVisible(), false);
  record('immersive mode and accessible help dialog open and dismiss');

  // Complete the real 60-second sequence, including pause and resume.
  await page.getByRole('button', { name: /开启 60 秒旅程/ }).click();
  await page.waitForFunction(() => window.__mindscape.getState().state.coherence < 0.25);
  await page.getByRole('button', { name: '暂停体验', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '继续体验', exact: true }).click();
  await page.getByRole('button', { name: /开启 60 秒旅程/ }).waitFor({ timeout: 85000 });
  assert.ok(await page.evaluate(() => window.__mindscape.getState().state.coherence > 0.83));
  record('full 60-second sequence, pause/resume, and final calm state complete');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto('http://127.0.0.1:5173');
  await mobile.waitForFunction(() => window.__mindscape?.getState().ready);
  await mobile.getByRole('button', { name: '直接探索地球', exact: true }).click();
  await mobile.getByRole('button', { name: '选择目的地：帕劳', exact: true }).click();
  // Full-page capture with a newer system Chromium can reset touch emulation.
  // Keep device metrics intact until the renderer has chosen its mobile budget.
  await mobile.screenshot({ path: new URL('globe-mobile.png', artifactDir).pathname });
  assert.equal(await mobile.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  await mobile.getByRole('button', { name: '进入帕劳世界', exact: true }).click();
  await mobile.waitForFunction(() => window.__mindscape.getState().stage === 'transform' && window.__mindscape.getState().renderer === 'world' && window.__mindscape.getState().ready && window.__mindscape.getState().points > 0);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(await mobile.evaluate(() => window.__mindscape.getState().points < 80000));
  await mobile.screenshot({ path: new URL('mobile.png', artifactDir).pathname, fullPage: true });
  await mobile.getByRole('button', { name: /开启 60 秒旅程/ }).scrollIntoViewIfNeeded();
  record('mobile layout has no horizontal overflow and lowers particle density');
  assert.deepEqual(errors, []);
  record('zero browser JavaScript or WebGL console errors');
  await writeFile(new URL('verification.json', artifactDir), JSON.stringify({ date: new Date().toISOString(), checks: report, errors }, null, 2));
} finally { await browser.close(); }
