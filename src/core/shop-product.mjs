import { LOCATIONS } from './locations.mjs';
import { WECHAT_GROUP } from './community.mjs';

// One demonstration product. Replace this record when the real product is supplied.
export const SHOP_PRODUCT = Object.freeze({
  id: 'forest-walk-demo',
  name: '把周末，交给森林。',
  headline: ['把周末，', '交给森林。'],
  activity: '森林慢行 · 半日自然体验',
  shortName: '森林慢行',
  tags: '半日体验 / 自然观察 / 可邀朋友同行',
  detailTitle: '给自己半天，走进自然。',
  checkoutCaption: '周末，留给一片森林。',
  itineraryNote: '上方为上午场的示例安排，下午场按相同时长顺延。实际行程待真实商品确认。',
  subtitle: '走慢一点，听见树叶、风，和身边的人。',
  image: '/shop/forest.png',
  imageAlt: '阳光穿过茂密森林的主题示意图',
  sceneIds: ['scene-02', 'scene-06', 'scene-08'],
  // Return context is separate from product association: every scene may try the demo.
  returnScenes: Object.freeze(LOCATIONS.map(({ id, name }) => Object.freeze({ id, name }))),
  defaultScene: 'scene-02',
  merchant: '在野旅行店 · 演示店铺',
  city: '城市与集合点待真实商品确认',
  duration: '约 3 小时',
  intensity: '轻量步行 · 新手友好',
  social: '安静同行，也可以聊聊天',
  wechatGroup: WECHAT_GROUP,
  sessions: [
    { id: 'morning', label: '周末上午场', detail: '09:00–12:00 · 示例场次，非可预约日期' },
    { id: 'afternoon', label: '周末下午场', detail: '14:00–17:00 · 示例场次，非可预约日期' },
  ],
  variants: [
    { id: 'solo', label: '单人体验', people: 1, priceCents: 9900 },
    { id: 'duo', label: '双人同行', people: 2, priceCents: 18800 },
  ],
  maxQuantity: 4,
  itinerary: [
    ['09:00', '在林间碰面', '放下日常节奏，认识这段路与同行的人。'],
    ['09:30', '沿着树影慢慢走', '停下来听风、观察植物，为喜欢的风景多留一会儿。'],
    ['11:30', '带一点自然回去', '坐下来歇歇，把这段时间留给自己和身边的人。'],
  ],
  included: ['示例：半日带队慢行', '示例：自然观察与休息时间'],
  excluded: ['交通与餐饮', '其他实际服务以未来真实商品为准'],
});

export function productForScene(sceneId) {
  return SHOP_PRODUCT.sceneIds.includes(sceneId) ? SHOP_PRODUCT : null;
}

export function shopHref(sceneId) {
  const source = SHOP_PRODUCT.returnScenes.some(scene => scene.id === sceneId) ? sceneId : SHOP_PRODUCT.defaultScene;
  return `/shop-demo.html?product=${SHOP_PRODUCT.id}&scene=${source}`;
}

// This pure factory also runs inside the generated standalone HTML.
export function createShopModel(product) {
  return {
    quote({ variantId, sessionId, quantity }) {
      const variant = product.variants.find(item => item.id === variantId);
      const session = product.sessions.find(item => item.id === sessionId);
      if (!variant || !session || !Number.isInteger(quantity) || quantity < 1 || quantity > product.maxQuantity) {
        throw new Error('请选择有效的规格、场次和数量。');
      }
      return { variant, session, quantity, people: variant.people * quantity, totalCents: variant.priceCents * quantity };
    },
    source(search) {
      const params = new URLSearchParams(search);
      const scene = params.get('scene');
      return {
        scene: product.returnScenes.some(item => item.id === scene) ? scene : product.defaultScene,
        validProduct: !params.has('product') || params.get('product') === product.id,
      };
    },
    money(cents) { return (cents / 100).toFixed(2); },
  };
}
