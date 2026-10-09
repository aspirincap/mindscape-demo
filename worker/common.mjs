export const COOKIE = 'mindscape_session';
export const SESSION_MS = 24 * 60 * 60 * 1000;

export function validToken(token, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const created = Number(token.split('.')[0]);
  return created <= now && now - created < SESSION_MS;
}

export function sessionToken(request) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const cookie = request.headers.get('Cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const token = bearer || cookie;
  return validToken(token) ? token : null;
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

export function json(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

export async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('请使用 application/json');
  if (Number(request.headers.get('Content-Length')) > 16384) throw new Error('请求内容过大');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('请求内容为空');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); throw new Error('请求内容过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('无效 JSON'); }
}
