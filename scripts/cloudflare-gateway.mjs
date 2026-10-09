import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Credentials stay in memory and are never printed or bundled into the website.
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const token = process.env.CLOUDFLARE_API_TOKEN || (process.env.CLOUDFLARE_TOKEN_FILE
  ? (await readFile(process.env.CLOUDFLARE_TOKEN_FILE, 'utf8')).trim()
  : JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'auth', 'token', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).token);
const base = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/ai-gateway/gateways`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const id = config.vars.AI_GATEWAY_ID;
const check = await fetch(`${base}/${id}`, { headers });
const existing = await check.json();
if (check.status === 401 || check.status === 403) throw new Error('当前凭据缺少 AI Gateway 管理权限。使用 CLOUDFLARE_TOKEN_FILE 指向包含 AI Gateway Edit 权限的本机 Token 文件。');
if (existing.success) {
  console.log(JSON.stringify({ gateway: id, status: 'exists', authentication: existing.result.authentication, collectLogs: existing.result.collect_logs }));
} else {
  if (check.status !== 404 && !existing.errors?.some(e => /not found|does not exist/i.test(e.message))) throw new Error(`Gateway check failed (${check.status})`);
  const created = await fetch(base, { method: 'POST', headers, body: JSON.stringify({
    id, authentication: true, cache_invalidate_on_update: true, cache_ttl: 0, collect_logs: false,
    rate_limiting_interval: 60, rate_limiting_limit: 20, rate_limiting_technique: 'sliding',
  }) });
  const data = await created.json();
  if (!created.ok || !data.success) throw new Error(`Gateway creation failed (${created.status}): ${data.errors?.map(e => e.message).join('; ')}`);
  console.log(JSON.stringify({ gateway: id, status: 'created', authentication: data.result.authentication }));
}
