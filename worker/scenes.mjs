import { sceneAssetForPath } from '../src/core/scene-assets.mjs';

export async function sceneResponse(request, bucket) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const asset = sceneAssetForPath(new URL(request.url).pathname);
  if (!asset) return new Response('Not found', { status: 404 });
  if (!bucket) return new Response('Scene storage unavailable', { status: 503 });
  const object = request.method === 'HEAD' ? await bucket.head(asset.key) : await bucket.get(asset.key);
  if (!object) return new Response('Not found', { status: 404 });
  if (object.size !== asset.bytes) { await object.body?.cancel(); return new Response('Scene asset incomplete', { status: 502 }); }
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': String(asset.bytes),
    'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${asset.sha256}"`, 'X-Content-Type-Options': 'nosniff' };
  if (request.headers.get('If-None-Match') === headers.ETag) {
    await object.body?.cancel(); delete headers['Content-Length']; return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}
