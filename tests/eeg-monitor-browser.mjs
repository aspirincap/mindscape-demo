import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
const cache=join(homedir(),'Library/Caches/ms-playwright');const fallback=readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n=>join(cache,n,`chrome-headless-shell-mac-${process.arch==='arm64'?'arm64':'x64'}`,'chrome-headless-shell')).find(existsSync);
const browser=await chromium.launch({headless:true,executablePath:existsSync(chromium.executablePath())?undefined:fallback});
try {
 const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 const before=await(await fetch('http://127.0.0.1:8765/api/eeg/status')).json();assert.equal(before.state,'disconnected','This test requires the user to close the serial port first');
 const s=await(await fetch('http://127.0.0.1:5186/api/session')).json();
 const c={protocol:EEG_PROTOCOL,http:'http://127.0.0.1:5186/api/frame',websocket:'ws://127.0.0.1:5186/ws?role=device',authorization:`Bearer ${s.token}`,expiresAt:s.expiresAt};
 await page.goto('http://127.0.0.1:8765');await page.getByRole('textbox',{name:'粘贴会话配置'}).fill(JSON.stringify(c));await page.getByRole('button',{name:'开始联动',exact:true}).click();
 await page.getByText('桥接已连接，按新设备读数发送',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'粘贴会话配置'}).inputValue(),'');
 await page.waitForTimeout(2500);let state=await(await page.request.get('http://127.0.0.1:8765/api/eeg/status')).json();assert.equal(state.bridge.sent,before.bridge.sent);assert.equal(state.state,'disconnected');
 await page.getByRole('button',{name:'停止联动（保留串口）',exact:true}).click();await page.getByText('联动已停止，串口监视继续',{exact:true}).waitFor();state=await(await page.request.get('http://127.0.0.1:8765/api/eeg/status')).json();assert.equal(state.bridge.state,'stopped');assert.equal(state.state,'disconnected');
 assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/eeg/monitor-forwarder.png'});console.log('PASS monitor UI pairing while serial closed, no stale forwarding, config input cleared, stop keeps serial closed');
} finally {await fetch('http://127.0.0.1:8765/api/eeg/forward',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop'})});await browser.close();}
