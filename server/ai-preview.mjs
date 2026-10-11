import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Official REST transport for Node previews; production uses the AI binding.
// Reuse Wrangler's login in memory, never expose credentials to the browser.
export async function createPreviewAI(root) {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  let credential;
  async function auth() {
    if (!credential || Date.now() - credential.at > 300000) {
      try {
        const { stdout } = await promisify(execFile)(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'auth', 'token', '--json'], { cwd: root, timeout: 10000, maxBuffer: 32768 });
        const token = JSON.parse(stdout).token;
        if (typeof token !== 'string' || !token) throw new Error();
        credential = { token, at: Date.now() };
      } catch { throw new Error('Wrangler 登录未就绪，请重新登录'); }
    }
    return credential.token;
  }
  await auth();
  const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;
  const AI = { async run(model, parameters, options) {
    if (model !== config.vars.AI_MODEL || options.gateway.id !== config.vars.AI_GATEWAY_ID) throw new Error('预览仅使用当前项目模型和网关');
    const token = await auth();
    const body = JSON.stringify({ model, ...parameters });
    return new Promise((resolve, reject) => {
      const req = request(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/ai/v1/chat/completions`, {
        method: 'POST', agent, signal: options.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
          'cf-aig-gateway-id': config.vars.AI_GATEWAY_ID, 'cf-aig-collect-log': 'false', 'cf-aig-skip-cache': 'true' },
      }, res => {
        let size = 0; const parts = [];
        res.on('data', chunk => { size += chunk.length; if (size > 131072) req.destroy(new Error('AI reply too large')); else parts.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) { if (res.statusCode === 401) credential = null; reject(new Error(`Gateway HTTP ${res.statusCode}`)); return; }
          try {
            const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
            if (value.success === false) throw new Error('Gateway rejected request');
            AI.aiGatewayLogId = res.headers['cf-aig-log-id'];
            resolve(value.result ?? value);
          } catch { reject(new Error('Gateway response invalid')); }
        });
      });
      req.on('error', reject); req.end(body);
    });
  } };
  return { env: { AI, AI_MODEL: config.vars.AI_MODEL, AI_GATEWAY_ID: config.vars.AI_GATEWAY_ID }, dispose() { credential = null; agent?.destroy(); } };
}

// Opt-in local inference. The Cloudflare Worker keeps its persistent AiBudget.
// This loopback-only preview has a smaller in-memory budget, reset on restart.
export function previewBudget() {
  let day = '', count = 0, attempts = [];
  return (now = Date.now()) => {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) { day = today; count = 0; }
    attempts = attempts.filter(at => now - at < 60000);
    if (count >= 50 || attempts.length >= 6) return false;
    count++; attempts.push(now); return true;
  };
}
