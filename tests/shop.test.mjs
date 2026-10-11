import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { LOCATIONS } from '../src/core/locations.mjs';
import { SHOP_PRODUCT, createShopModel, productForScene, shopHref } from '../src/core/shop-product.mjs';
const model = createShopModel(SHOP_PRODUCT);

test('shop quotes packages in integer cents and counts people separately', () => {
  const quote = model.quote({ variantId: 'duo', sessionId: 'afternoon', quantity: 3 });
  assert.equal(quote.people, 6);
  assert.equal(quote.totalCents, 56400);
  assert.equal(model.money(quote.totalCents), '564.00');
  assert.equal(model.quote({ variantId: 'solo', sessionId: 'morning', quantity: 1 }).totalCents, 9900);
});
test('shop rejects incomplete, fractional, excessive and unknown selections', () => {
  for (const quantity of [0, -1, 1.5, 5, NaN, Infinity, '2']) {
    assert.throws(() => model.quote({ variantId: 'solo', sessionId: 'morning', quantity }));
  }
  assert.throws(() => model.quote({ variantId: 'unknown', sessionId: 'morning', quantity: 1 }));
  assert.throws(() => model.quote({ variantId: 'solo', sessionId: 'unknown', quantity: 1 }));
});
test('shop link parameters cannot set price, arbitrary return URLs or order data', () => {
  assert.deepEqual(model.source('?scene=https://bad.test/&price=1&order=paid'), { scene: 'scene-02', validProduct: true });
  assert.equal(model.source('?product=unknown').validProduct, false);
  assert.deepEqual(model.source('?product=forest-walk-demo&scene=scene-08'), { scene: 'scene-08', validProduct: true });
  const href = new URL(shopHref('scene-06'), 'https://example.test');
  assert.equal(href.searchParams.get('product'), SHOP_PRODUCT.id);
  assert.equal(href.searchParams.get('scene'), 'scene-06');
  assert.equal(productForScene('scene-02'), SHOP_PRODUCT);
  assert.equal(productForScene('grand-canyon'), null);
});
test('all destination links round-trip through the standalone shop without becoming new products', () => {
  // The generator serializes the config and embeds the factory in a standalone HTML.
  // Exercise that boundary without imports or closures from the main application.
  const standalone = vm.runInNewContext(`(${createShopModel.toString()})`, { URLSearchParams })(JSON.parse(JSON.stringify(SHOP_PRODUCT)));
  assert.deepEqual(SHOP_PRODUCT.returnScenes.map(scene => scene.id).sort(), LOCATIONS.map(place => place.id).sort());
  for (const place of LOCATIONS) {
    const href = new URL(shopHref(place.id), 'https://example.test');
    assert.equal(href.pathname, '/shop-demo.html');
    assert.equal(href.searchParams.get('product'), 'forest-walk-demo');
    assert.equal(standalone.source(href.search).scene, place.id);
    assert.equal(standalone.source(href.search).validProduct, true);
    assert.equal(SHOP_PRODUCT.returnScenes.find(scene => scene.id === place.id).name, place.name);
    if (!SHOP_PRODUCT.sceneIds.includes(place.id)) assert.equal(productForScene(place.id), null);
  }
  for (const scene of ['', 'scene-21', 'constructor', '__proto__', '//bad.test', 'fuji&price=1']) {
    assert.equal(standalone.source('?' + new URLSearchParams({ scene })).scene, SHOP_PRODUCT.defaultScene);
    assert.equal(new URL(shopHref(scene), 'https://example.test').searchParams.get('scene'), SHOP_PRODUCT.defaultScene);
  }
});
