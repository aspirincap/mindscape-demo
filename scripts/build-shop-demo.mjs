import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SHOP_PRODUCT, createShopModel } from '../src/core/shop-product.mjs';

const root = new URL('../', import.meta.url);
const template = await readFile(new URL('src/shop/demo.template.html', root), 'utf8');
const photo = await readFile(new URL(`public${SHOP_PRODUCT.image}`, root));
const product = { ...SHOP_PRODUCT, image: `data:image/png;base64,${photo.toString('base64')}` };
const html = template
  .replace('__SHOP_PRODUCT_JSON__', JSON.stringify(product).replaceAll('<', '\\u003c'))
  .replace('__SHOP_MODEL_FACTORY__', createShopModel.toString());
const target = new URL('public/shop-demo.html', root);
await writeFile(target, html);
console.log(`Standalone shop demo → ${fileURLToPath(target)} (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);
