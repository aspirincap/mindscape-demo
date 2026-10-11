import { LOCATIONS } from '../src/core/locations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validToken, sessionToken, sameOrigin, readJson } from '../worker/common.mjs';
import { normalizeRecommendation, recommend, routeInput } from '../worker/recommend.mjs';

test('cloud session credentials expire and do not accept malformed or future tokens', () => {
  const now = Date.now(), token = `${now}.${'a'.repeat(64)}`;
  assert.equal(validToken(token, now), true);
  assert.equal(validToken(token, now + 86400000), false);
  assert.equal(validToken(token, now - 1), false);
  assert.equal(validToken('known-room'), false);
  assert.equal(sessionToken(new Request('https://demo/api/frame', { headers: { Authorization: `Bearer ${token}` } })), token);
  assert.equal(sameOrigin(new Request('https://demo/ws', { headers: { Origin: 'https://attacker' } })), false);
});

test('API body reader bounds actual streamed bytes', async () => {
  const request = value => new Request('https://demo/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: value });
  assert.deepEqual(await readJson(request('{"text":"森林"}')), { text: '森林' });
  await assert.rejects(readJson(request('a'.repeat(16385))), /过大/);
  await assert.rejects(readJson(request('not JSON')), /JSON/);
  assert.throws(() => routeInput({ text: 'a'.repeat(1001) }));
  assert.throws(() => routeInput({ text: '森林', frame: { relaxation: 3 } }));
});

test('model output only permits the 22 available worlds and bounded values', () => {
  const result = normalizeRecommendation({ response: '{"world":"scene-02","score":92,"reason":"沿着林间微光慢慢放松。"}' }, 'test-model');
  assert.equal(result.mode, 'ai-gateway');
  assert.equal(result.recommendedWorlds.length, 22);
  assert.equal(result.recommendedWorlds[0].worldId, 'scene-02');
  for (const l of LOCATIONS) { const r=normalizeRecommendation({world:l.worldId,score:94,reason:'出发吧。'});assert.equal(r.recommendedWorlds[0].locationId,l.id);assert.equal(new Set(r.recommendedWorlds.map(x=>x.worldId)).size,22); }
  const glm = normalizeRecommendation({ choices: [{ message: { content: '{"world":"scene-01","score":90,"reason":"在水下的静谧中慢慢放松。"}', reasoning_content: 'This internal reasoning must never become the recommendation.' }, finish_reason: 'stop' }] }, '@cf/zai-org/glm-5.3-flash');
  assert.equal(glm.world, 'scene-01');
  assert.equal(glm.reason, '在水下的静谧中慢慢放松。');
  assert.equal(glm.model, '@cf/zai-org/glm-5.3-flash');
  for (const invalid of [{ world: 'paris', score: 90, reason: 'hi' }, { world: 'scene-02', score: 999, reason: 'hi' }, { world: 'scene-02', score: 90, reason: '' }]) assert.throws(() => normalizeRecommendation(invalid));
});

test('AI request uses the gateway, omits raw sensor data, and labels fallback honestly', async () => {
  const input = routeInput({ text: '想去森林' });
  let called;
  const env = { AI_GATEWAY_ID: 'mindscape-demo', AI_MODEL: '@cf/zai-org/glm-5.3-flash', AI: { run: async (...args) => {
    called = args; return { choices: [{ message: { content: '{"world":"scene-02","score":91,"reason":"林间微光陪你慢慢安定。"}' } }] };
  } } };
  assert.equal((await recommend(input, env)).mode, 'ai-gateway');
  assert.equal(called[0], env.AI_MODEL);
  assert.equal(called[2].gateway.id, 'mindscape-demo');
  assert.equal(called[2].gateway.collectLog, false);
  assert.equal(called[1].messages[1].content.includes('HR'), false);
  assert.equal(called[1].reasoning_effort, 'low');
  assert.equal(called[1].response_format.type, 'json_schema');
  assert.deepEqual(called[1].response_format.json_schema.schema.properties.world.enum, LOCATIONS.map(l=>l.worldId));
  env.AI.run = async () => { throw new Error('Service failure'); };
  const offline = await recommend(input, env);
  assert.equal(offline.mode, 'local-rules'); assert.equal(offline.fallback, 'ai-unavailable');
});
