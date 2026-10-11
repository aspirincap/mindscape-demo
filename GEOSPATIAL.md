# 真实地理场景

富士山与大峡谷使用真实地理数据，入口通过 `GeoRenderer` 加载 `public/terrain`。V.10 其余 20 个世界使用用户提供的图像重建点云，见 [SCENE-CATALOG.md](SCENE-CATALOG.md)。旧 `public/worlds` 的程序化资产已移出部署，本机备份在 `artifacts/legacy-worlds-v09/`。

| 场景 | 经纬度选区（西、南、东、北） | 投影后范围 | 最细层显示点数 |
| --- | --- | --- | --- |
| 富士山 | 138.56, 35.25, 138.89, 35.57 | 30.8 × 36.2 km | 5,115,778 |
| 大峡谷 | -112.24, 35.99, -111.98, 36.22 | 23.7 × 25.8 km | 4,194,304 |

旧场景为无地理单位的主题模型，因此不能把这次的真实覆盖范围换算为严谨的“旧范围十倍”。这次直接以公里定义可探索范围。投影矩形包住经纬度选区四角，边界外有少量余量。

## 数据与授权

- **富士山山顶**直接使用 [VIRTUAL SHIZUOKA 2021 官方测绘点云](https://www.geospatial.jp/ckan/dataset/shizuoka-2021-pointcloud)，CC BY 4.0。9 个 LAS 分块为 08ME3541 / 3542 / 3543 / 3551 / 3552 / 3553 / 3561 / 3562 / 3563，覆盖约 1.2 × 0.9 km 火山口区域，105,106,003 个原始点。按 1.5 m 三维体素选取实际测量点，保留原生 RGB，得到 925,539 个点；不通过卫星图重建或重新上色。原坐标 JGD2011 平面直角第 VIII 系（EPSG:6676），转换为 UTM 54N（EPSG:32654）。
- **富士山外围**使用 [国土地理院 GSI DEM](https://maps.gsi.go.jp/development/ichiran.html) 约 10 m 高程；在页面和清单中标注 GSI 及加工署名。外围颜色来自 2026-02-15 的 Sentinel-2 S2B_54STE，10 m 真彩色影像。山顶测绘与外围冬季影像日期不同，会有明显季节色差，保留原始颜色使两类数据可区分。
- **大峡谷**使用 [USGS 3DEP](https://www.usgs.gov/3d-elevation-program) 公共领域高程。Grand Canyon NP 2019 等 1 m 源覆盖选区约 69.4%，剩余由 USGS 约 10 m 高程补齐。高程基准 NAVD88，平面坐标 EPSG:32612。颜色为 2025-10-28 同日四张 Sentinel-2 影像拼接。
- **卫星影像**来自 [Element 84 Earth Search / Sentinel-2 COG](https://registry.opendata.aws/sentinel-2-l2a-cogs/)。署名：Contains modified Copernicus Sentinel data. Processed by Element 84 / Mindscape. 精确影像 ID、日期与源 URL 见各场景 `manifest.json`。

场景采用 1:1 米制，没有夸张高度。外围地形为 2048 × 2048 采样网格；显示采样间距富士山约 15 × 18 m、大峡谷约 12 × 13 m，**不等于源高程精度**。高度场不包含倒悬、洞穴或建筑立面。仅富士山火山口为直接测量的三维点云；不能称整个富士山选区都是 LiDAR。页面探索地图可查看完整来源、范围和限制。

## 渲染与交互

Three.js + [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS)，标准 3D Tiles 1.0 PNTS。区域地形为四叉树；山顶测量点云单独分层，移除对应外围高度场点，避免重叠表面。按屏幕误差、视锥、桌面/触屏缓存上限加载和释放。

V.09 进入两处真实场景默认使用“清晰”完整光影并自动启动空中导览：富士山 5 分钟、大峡谷 4 分钟，循环经过清晰 / 流光 / 梦境。鼠标、滚轮或单手动作会接管镜头；设置面板提供暂停、继续、重新起飞以及光影随行开关。“原始点云 / 粒子流动 / 完整光影”可在同一视角切换。加工层采用米制流场、柔边粒子与按高程调色；即使聚散为零也有连续微动。原始测量位置、颜色和 R2 数据不变，原始档可随时对照。

稀疏亮点从当前可见分块中以稳定坐标哈希抽取约 0.58%，独立进入余辉缓冲，地形主体不写入余辉。移动、缩放、跳转、分块替换、暂停与卸载会清理或关闭历史，避免旧地形拖影。分块卸载时同步回收新增亮点几何与材质。视觉参数仍由共用调节面板控制，减少动态效果偏好停止流动和余辉。

默认拖动或单手手掌/拳头移动为平移；右键、Shift 拖动或“环绕”按钮旋转视角。滚轮与单手捏住上下移连续调整视距；松开、追踪中断、窗口失焦会停止。WASD / 方向键在画布焦点下平移。地图点击与地标列表可跳转；相机根据高程保持地表上方。

## 重建数据

需要 Python 3.12、约 10 GB 工作空间与公网访问；完整下载 LAS 是数 GB。原始文件及 R2 pack 不提交 Git。

```sh
python3.12 -m venv artifacts/geo-venv
artifacts/geo-venv/bin/pip install -r scripts/geospatial/requirements.txt
artifacts/geo-venv/bin/python scripts/geospatial/acquire.py lidar
artifacts/geo-venv/bin/python scripts/geospatial/acquire.py fuji-dem
artifacts/geo-venv/bin/python scripts/geospatial/acquire.py fuji-satellite
artifacts/geo-venv/bin/python scripts/geospatial/acquire.py canyon-dem
artifacts/geo-venv/bin/python scripts/geospatial/acquire.py canyon-satellite
artifacts/geo-venv/bin/python scripts/geospatial/build.py fuji
artifacts/geo-venv/bin/python scripts/geospatial/build.py grand-canyon
```

已核验的官方源索引固定在 `scripts/geospatial/sources/`。请求失败可重跑，下载和 Canyon DEM 处理带本地缓存。源服务若下线，需要更新索引；不会静默替换为程序化数据。构建输出源清单、选区图、卫星定位图、导航高度网格、标准 tileset，以及 `artifacts/geospatial/published/{world}/{version}.pack`。版本为输入内容哈希。

## 部署

R2 桶 `mindscape-terrain`，Worker 绑定 `TERRAIN`。先上传与新 manifest 同版本的两份 pack，再发布 Worker / 静态资源。

```sh
npx wrangler r2 object put mindscape-terrain/fuji/b2d8b0a3349b.pack --file=artifacts/geospatial/published/fuji/b2d8b0a3349b.pack --remote --content-type application/octet-stream
npx wrangler r2 object put mindscape-terrain/grand-canyon/085c01c0469a.pack --file=artifacts/geospatial/published/grand-canyon/085c01c0469a.pack --remote --content-type application/octet-stream
npm run deploy
```

`/terrain-data/{world}/{version}/{offset}-{length}.pnts` 从 R2 指定范围返回一份完整 PNTS，带不可变 CDN 缓存。浏览器不直接读取源 GIS 服务，也不需要 R2 公共桶。清单及导航静态文件重新验证缓存。新 pack 发布成功前保留旧版本，避免旧页面断流。旧 pack 回收应晚于缓存期限。

本地 `npm run dev` 使用相同路径从本地 pack 读取。也可以下载远端现有 pack 进行开发，无需重复原始测绘处理。

## 验证

`npm test` 覆盖导航、连续缩放停止条件、R2 分段路径和边界、清单、PNTS 头和对齐。`PORT=5174 npm run dev` 后 `npm run test:geo` 验证两个真实场景的实际 WebGL 渲染、平移、模拟手势连续缩放、地图对话框。浏览器测试截图和日志在 `artifacts/geospatial/verification/`，不包含摄像头录像；模拟输入测试不替代真人手势识别测试。

`npm run test:geo:visual` 对两处真实场景渲染三档对照和三个预设，并检查零聚散下的持续流动、暂停、余辉清除、数据不变与分块资源回收。截图和结果位于 `artifacts/geospatial/visual/`。

## V.09 航线与边缘

`src/core/geo-tour.mjs` 将米制控制点采样成闭合平滑曲线，再按累计弧长推进。依据现有 513×513 导航高程构建提前爬升的高度包络，转弯侧倾最多约 4.9°。路线完整循环在 30 Hz 下验证，最低网格离地高度富士山约 685 m、大峡谷约 772 m；这是当前数字地形内的展示约束，不是实际飞行安全保证。无时间跳转的暂停、隐藏、卡顿与手动接管由 `TourPlayback` 管理；返航过渡使用四元数插值避免相反朝向抵消。

地理着色器使用世界坐标四次超椭圆遮罩：中心保留，归一化半径 .70–.99 平滑渐隐。主体、稀疏亮点和余辉共享遮罩，同时衰减颜色能量与 alpha，避免重叠粒子再次堆出硬边。边缘开关不改资产，也不影响高度采样或路线；想看完整测量矩形时关闭即可。

`tests/geo-tour.test.mjs` 验证完整路线、闭环、净空、暂停和光影连续性。`/tests/geo-tour-lab.html` 为开发专用可操作验收页，有四个航程停靠点、全景 / 边缘 / 原始档对照、模拟手势和合成脑电锁定按钮；生产构建不包含测试页。旧地理与 EEG GPU 验收页明确关闭导览，用于隔离其原有测试范围。
