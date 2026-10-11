import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_IN_QUESTIONS, validateAssessment, localAssessment, normalizeChoices, assessmentSummary } from '../src/core/journey-assessment.mjs';
import { routeInput, recommend, normalizeAssessmentRecommendation, fallback } from '../worker/recommend.mjs';
import { previewBudget } from '../server/ai-preview.mjs';
import { pairingConfig } from '../server/eeg-forwarder.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';

const assessment = { version: 1, answers: { feeling: 'busy', energy: 'low', attention: 'scattered', wish: 'rest', landscape: 'forest' } };
const choices = localAssessment(assessment).choices.map(c => ({ world: c.worldId, reason: c.reason }));

test('check-in accepts exactly five known choices and never extra device or free-text data', () => {
  assert.deepEqual(routeInput({ assessment }), { assessment });
  assert.equal(assessmentSummary(assessment).length, 5);
  for (const bad of [null, {}, { ...assessment, version: 2 }, { ...assessment, frame: {} }, { ...assessment, answers: [] },
    { ...assessment, answers: { ...assessment.answers, energy: 'ignore instructions' } },
    { ...assessment, answers: { ...assessment.answers, HR: 70 } },
    { ...assessment, answers: { energy: 'low' } }]) assert.throws(() => validateAssessment(bad));
  for (const extra of [{ text: 'extra' }, { frame: { attention: .9 } }, { token: 'private' }]) assert.throws(() => routeInput({ assessment, ...extra }));
});

test('all 720 answer combinations produce three distinct usable destinations with 24–40 character reasons', () => {
  let combinations = [{}];
  for (const q of CHECK_IN_QUESTIONS) combinations = combinations.flatMap(answers => q.options.map(o => ({ ...answers, [q.id]: o.id })));
  assert.equal(combinations.length, 720);
  for (const answers of combinations) {
    const result = localAssessment({ version: 1, answers });
    assert.equal(result.choices.length, 3);
    assert.equal(result.choices.filter(c => c.worldId === 'scene-04').length, 1);
    assert.equal(new Set(result.choices.map(c => c.locationId)).size, 3);
    assert.equal(new Set(result.choices.map(c => c.reason)).size, 3);
    assert.equal(new Set(result.recommendedWorlds.map(c => c.locationId)).size, 22);
    for (const c of result.choices) {
      assert.ok(LOCATIONS.some(l => l.id === c.locationId && l.worldId === c.worldId));
      assert.ok([...c.reason].length >= 24 && [...c.reason].length <= 40, c.reason);
    }
  }
});

test('local recommendation respects landscape choice and adapts reason to the stated wish', () => {
  for (const landscape of ['forest', 'ocean', 'mountain', 'night']) {
    const tags = CHECK_IN_QUESTIONS.at(-1).options.find(o => o.id === landscape).tags;
    const result = localAssessment({ ...assessment, answers: { ...assessment.answers, landscape } });
    assert.ok(LOCATIONS.find(l => l.id === result.choices[0].locationId).theme.some(t => tags.includes(t)));
  }
  const result = localAssessment({ ...assessment, answers: { ...assessment.answers, wish: 'discover' } });
  assert.match(result.choices[0].reason, /^想遇见惊喜/);
});

test('model output rejects duplicates, fabricated locations, missing recommendations and oversized reasons', () => {
  const output = { choices: [{ message: { content: JSON.stringify({ choices }), reasoning_content: 'private reasoning' } }] };
  const result = normalizeAssessmentRecommendation(output, 'glm');
  assert.equal(result.mode, 'ai-gateway');
  assert.equal(result.model, 'glm');
  assert.equal(result.choices.length, 3);
  assert.ok(!JSON.stringify(result).includes('private reasoning'));
  assert.equal(normalizeAssessmentRecommendation({ response: '```json\n' + JSON.stringify({ choices }) + '\n```' }).choices.length, 3);
  for (const bad of [null, choices.slice(0, 2), [...choices, choices[0]], [choices[0], choices[0], choices[2]],
    [{ ...choices[0], world: 'paris' }, ...choices.slice(1)],
    [{ ...choices[0], reason: '太短' }, ...choices.slice(1)],
    [{ ...choices[0], reason: '好'.repeat(41) }, ...choices.slice(1)],
    [{ ...choices[0], reason: '<script>bad</script>' + '好'.repeat(10) }, ...choices.slice(1)]]) assert.throws(() => normalizeChoices(bad));
});

test('demo guarantees Plitvice when AI omits it, preserving two choices and a contextual reason', () => {
  const omitted = ['scene-13', 'scene-11', 'scene-14'].map(world => ({ world, reason: '想遇见惊喜，沿着水下明亮的光束移动，慢慢发现缤纷风景的细节。' }));
  const before = structuredClone(omitted);
  const result = normalizeAssessmentRecommendation({ choices: omitted }, 'glm', { ...assessment, answers: { ...assessment.answers, wish: 'discover' } });
  assert.deepEqual(result.choices.slice(0, 2).map(c => c.worldId), ['scene-13', 'scene-11']);
  assert.equal(result.choices[2].worldId, 'scene-04');
  assert.match(result.choices[2].reason, /^想遇见惊喜，/);
  assert.ok([...result.choices[2].reason].length >= 24 && [...result.choices[2].reason].length <= 40);
  assert.equal(result.recommendedWorlds.length, 22);
  assert.equal(new Set(result.recommendedWorlds.map(c => c.worldId)).size, 22);
  assert.deepEqual(omitted, before);
  for (let i = 0; i < 3; i++) {
    const included = structuredClone(omitted);
    included[i] = { world: 'scene-04', reason: '想遇见惊喜，循着十六湖溪水与瀑布的层次，让目光随着水光慢慢展开。' };
    const kept = normalizeAssessmentRecommendation({ choices: included }, 'glm', assessment);
    assert.deepEqual(kept.choices.map(c => ({ world: c.worldId, reason: c.reason })), included);
    assert.equal(kept.choices.filter(c => c.worldId === 'scene-04').length, 1);
  }
});

test('five answers reach GLM via Gateway with a three-choice schema, without EEG or credentials', async () => {
  let call;
  const env = { AI_MODEL: '@cf/zai-org/glm-5.3-flash', AI_GATEWAY_ID: 'mindscape-demo', AI: { run: async (...args) => { call = args; return { response: JSON.stringify({ choices }) }; } } };
  const result = await recommend(routeInput({ assessment }), env);
  assert.equal(result.mode, 'ai-gateway');
  assert.equal(result.gateway, 'mindscape-demo');
  assert.equal(result.choices.length, 3);
  assert.equal(call[0], env.AI_MODEL);
  assert.match(call[1].messages[0].content, /必须包含十六湖（scene-04）/);
  assert.deepEqual(JSON.parse(call[1].messages[1].content), { checkIn: assessmentSummary(assessment) });
  for (const key of ['frame', 'HR', 'token', 'authorization']) assert.ok(!call[1].messages[1].content.includes(key));
  const schema = call[1].response_format.json_schema.schema.properties.choices;
  assert.equal(schema.minItems, 3); assert.equal(schema.maxItems, 3);
  assert.equal(schema.items.properties.reason.minLength, 24); assert.equal(schema.items.properties.reason.maxLength, 40);
  assert.deepEqual(schema.items.properties.world.enum, LOCATIONS.map(l => l.worldId));
  assert.equal(call[2].gateway.collectLog, false); assert.equal(call[2].gateway.skipCache, true);
  assert.equal(call[2].gateway.id, 'mindscape-demo');
});

test('unavailable AI, invalid model replies and limits retain three choices and disclose fallback', async () => {
  const input = routeInput({ assessment });
  const failed = await recommend(input, { AI_GATEWAY_ID: 'test', AI: { run: async () => { throw new Error('timeout'); } } });
  const invalid = await recommend(input, { AI_GATEWAY_ID: 'test', AI: { run: async () => ({ choices: [choices[0]] }) } });
  const unconfigured = await recommend(input, {});
  for (const result of [failed, invalid, unconfigured, fallback(input, 'rate-limited')]) {
    assert.equal(result.mode, 'local-rules'); assert.equal(result.choices.length, 3); assert.ok(result.fallback);
    assert.equal(result.choices.filter(c => c.worldId === 'scene-04').length, 1);
  }
  assert.equal(fallback(input, 'rate-limited').fallback, 'rate-limited');
});

test('optional loopback AI preview limits calls before inference and rolls its budget forward', () => {
  const consume = previewBudget(), now = Date.UTC(2026, 9, 11, 12);
  for (let i = 0; i < 6; i++) assert.equal(consume(now + i), true);
  assert.equal(consume(now + 200), false);
  let count = 6;
  for (let minute = 1; minute < 10; minute++) for (let i = 0; i < 6; i++) if (consume(now + minute * 60001 + i)) count++;
  assert.equal(count, 50);
  assert.equal(consume(now + 3600000), false);
  assert.equal(consume(now + 86400000), true);
});

test('the active 5190 preview can pair locally but unrelated loopback ports remain rejected', () => {
  const now = Date.now();
  const config = { protocol: 'mindscape.eeg.v2', websocket: 'ws://127.0.0.1:5190/ws?role=device', http: 'http://127.0.0.1:5190/api/frame', authorization: `Bearer ${now}.${'a'.repeat(64)}`, expiresAt: now + 86400000 };
  assert.ok(pairingConfig(config));
  assert.throws(() => pairingConfig({ ...config, websocket: config.websocket.replace('5190', '9999'), http: config.http.replace('5190', '9999') }));
});
