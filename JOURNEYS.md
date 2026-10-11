# 目的地行程页

2026-10-11 从用户提供的 `mindscape-demo-team-2026-10-11.zip` 合入目的地页面、行程数据与照片。原包包含另一版完整项目；仅提取此模块，保留当前 EEG、五题推荐、十六湖固定推荐、模型直达、30 秒行动卡、视频和声音功能。

## 访问路径

线上目录：[全部行程](https://mindscape-demo.aspirincap.workers.dev/journeys.html)；示例：[十六湖行程](https://mindscape-demo.aspirincap.workers.dev/activities/scene-04.html)。

- 场景行动卡 → 「查看行程与价格」→ `/activities/<scene-id>.html`，全 22 个场景一一对应。
- 目录：`/journeys.html`；详情页的返回入口回到 `/?scene=<scene-id>`。
- 行动卡继续保留群二维码和分享，新标签页打开行程以保留原场景状态。
- `/shop-demo.html` 保留旧链接兼容，已不属于主行动卡流程。

详情保持附件完整内容：22 个独立 SKU、合计 95 天每日活动、住宿、交通、费用范围、季节、出行条件及原售价。售价来自用户提供的商品表，未自行调整。底部只有一个「立即下单」，展开“在线支付暂未接入”；本次未新增订单、库存、表单或付款服务。

## 唯一数据与生成入口

- `src/core/journeys.json`：与附件 `docs/travel_products_v2.json` 的 22 个对象完整一致。
- `src/core/journey-images.json`：附件照片、作者、来源和许可记录。
- `src/core/travel.mjs`：场景与行程查找、详情 / 返回链接及封面选择；非法地点不回退到另一商品。
- `src/core/product.mjs`：天数、价格和体验次数显示。
- `src/core/community.mjs`：同行群配置，同时供行动卡和兼容商店使用。
- `src/journeys.jsx` / `src/journeys.css`：详情和目录模板。复用 `Brand`，保持墨绿背景、薄荷绿品牌与奶白按钮。
- `scripts/generate-journeys.mjs`：服务端静态渲染，输出 `public/activities/*.html` 与 `public/journeys.html`，无客户端 React 运行依赖。不要手改生成后的 HTML。

修改后执行 `npm run journeys:build`；`npm run dev`、`npm run build` 和 `npm run build:cloudflare` 已加入自动生成前置步骤。正在运行的预览服务中修改模板 / 数据后，也需手动重新生成。页面、照片随 public 目录进入 dist；Node 和 Cloudflare 均通过同源静态路径访问。

## 图片

附件的 19 张照片原样保存在 `public/journey-photos/`（约 59 MB），无重新下载或改写。大图仍为附件原文件，目录缩略图使用懒加载；单张最大约 13.8 MB。所有署名、来源与许可证保留在对应详情页，完整记录见 [JOURNEY-PHOTO-CREDITS.md](docs/JOURNEY-PHOTO-CREDITS.md)。

瓦杜岛（scene-09）、特罗姆瑟（scene-19）、多洛米蒂（scene-20）的照片在原包中缺失，使用当前项目的 `public/shop/destinations/` 主题封面，并明确标明“主题意象图 · 非目的地实拍”。附件的分类插画保存在 `public/journey-art/`，供后续备用。

## 验证

`tests/travel.test.mjs` 检查 22 个映射、95 天完整数据、价格、逐日活动与住宿交通、独立 HTML、返回链接、图片 / 署名、缺图标识及无实际支付入口。提交前运行 `npm test` 与 `npm run build:cloudflare`。

本地接入验证记录在忽略目录 `artifacts/destination-pages-import/`。附件历史浏览器验证报告仅作为来源资料；本次验证结果以本项目的新记录为准。
