import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LOCATIONS } from '../src/core/locations.mjs';
import { JOURNEYS, journeyForWorld, journeyHref, resonanceHref, journeyImage, journeyCover } from '../src/core/travel.mjs';
import { productPrice, moneyRange, durationLabel } from '../src/core/product.mjs';
import { WECHAT_GROUP } from '../src/core/community.mjs';
import { SHOP_PRODUCT } from '../src/core/shop-product.mjs';

const documentFor = world => readFileSync(new URL(`../public${journeyHref(world)}`, import.meta.url), 'utf8');

test('all 22 scene destinations map to distinct supplied products with 95 complete itinerary days', () => {
  assert.deepEqual(JOURNEYS.map(j => j.scene_id).sort(), LOCATIONS.map(l => l.worldId).sort());
  assert.equal(new Set(JOURNEYS.map(j => j.sku)).size, 22);
  assert.equal(new Set(JOURNEYS.map(j => j.title)).size, 22);
  assert.equal(JOURNEYS.reduce((sum, j) => sum + j.duration_days, 0), 95);
  for (const j of JOURNEYS) {
    assert.equal(j.days.length, j.duration_days);
    assert.equal(j.nights, j.duration_days - 1);
    assert.ok(productPrice(j));
    for (const [index, day] of j.days.entries()) {
      assert.equal(day.day, index + 1);
      assert.ok(day.title && day.activities.length && day.accommodation && day.transport);
    }
    for (const key of ['intro', 'meeting_point', 'season_note', 'safety_note', 'cost_note', 'planning_note']) assert.ok(j[key], `${j.scene_id}: ${key}`);
  }
});

test('each standalone page keeps the full product, one non-payment order entry, and correct scene return links', () => {
  for (const place of LOCATIONS) {
    const j = journeyForWorld(place.worldId), document = documentFor(place.worldId);
    for (const text of [j.title, j.intro, j.sku, j.name, j.cost_note, j.safety_note, durationLabel(j), moneyRange(productPrice(j))]) assert.ok(document.includes(text), `${j.scene_id}: ${text}`);
    for (const day of j.days) {
      for (const text of [day.title, ...day.activities, day.accommodation, day.transport]) assert.ok(document.includes(text), `${j.scene_id}: ${text}`);
    }
    assert.ok(document.includes(`data-scene="${place.worldId}"`));
    assert.ok(document.includes(`href="${resonanceHref(place.worldId)}"`));
    assert.ok(document.includes('在线支付暂未接入'));
    assert.equal((document.match(/class="booking-action"/g) || []).length, 1);
    assert.ok(document.indexOf('class="journey-order"') > document.indexOf('id="safety-title"'));
    assert.doesNotMatch(document, /<script|<form|<input|<textarea|shop-demo\.html|#travel-card/);
    if (j.availability_caveat) assert.ok(document.includes(j.availability_caveat));
  }
});

test('all local page assets exist, photo attribution stays attached, and the three missing photos use labelled thematic art', () => {
  let photos = 0, themes = 0;
  for (const place of LOCATIONS) {
    const image = journeyImage(place.worldId), document = documentFor(place.worldId), cover = journeyCover(place.worldId);
    assert.ok(existsSync(new URL(`../public${cover}`, import.meta.url)), cover);
    assert.ok(document.includes(`src="${cover}"`));
    if (image?.src) {
      photos++;
      for (const value of [image.author, image.license]) assert.ok(document.includes(value));
      for (const url of [image.source_url, image.license_url]) assert.equal(new URL(url).protocol, 'https:');
    } else {
      themes++;
      assert.ok(document.includes('主题意象图 · 非目的地实拍'));
      assert.ok(cover.startsWith('/shop/destinations/'));
    }
  }
  assert.equal(photos, 19); assert.equal(themes, 3);
  const directory = readFileSync(new URL('../public/journeys.html', import.meta.url), 'utf8');
  for (const place of LOCATIONS) assert.ok(directory.includes(`href="${journeyHref(place.worldId)}"`));
});

test('unknown or hostile scene values never route to another product or external return URL', () => {
  for (const world of ['unknown', '__proto__', 'constructor', '../../index', '//bad.test', 'fuji?price=1', 'scene-21', '']) {
    assert.equal(journeyForWorld(world), undefined);
    assert.equal(journeyHref(world), null);
    assert.equal(journeyImage(world), undefined);
    assert.equal(journeyCover(world), null);
    assert.equal(resonanceHref(world), '/');
  }
  assert.equal(SHOP_PRODUCT.wechatGroup, WECHAT_GROUP);
  assert.equal(WECHAT_GROUP.description, '扫码进群，与真实的TA一起同游');
});
