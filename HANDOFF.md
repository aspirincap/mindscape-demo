# Mindscape 交接记录

更新：2026-10-11（Asia/Shanghai）。当前 V.10.0 保留富士山 / 大峡谷，并以 20 个精选模型替换旧场景，加入微光短导览，见第 15 节。V.09.1 首页四图轮播见第 14 节。V.09.0 两处真实地形的空中导览、清晰入场、平滑光影与边缘渐隐见第 13 节。V.08 Riverine 前端重构见第 12 节。第 9 / 11 节分别保留 V.06.1 / V.07.0 的历史验证。

## 1. 接手先看

| 项目 | 当前状态 |
| --- | --- |
| 本地目录 | `/Users/mvgz0331/Documents/ChatGPT/td-dive` |
| 线上 Demo | https://mindscape-demo.aspirincap.workers.dev/ |
| 公开仓库 | https://github.com/aspirincap/mindscape-demo |
| UI 版本 | `V.10.0`；`package.json` 仍为 `1.0.0` |
| 最近成功部署的 Worker 版本 | `fbdab2e0-7397-4bdb-ac34-782941ed8825` |
| 本轮代码提交 | 使用 `git log -1 -- src/core/scene-tour.mjs` 查看，避免文档自引用提交哈希 |
| 本轮范围 | 22 个场景目录、20 个 R2 模型、全球灵感地点、48–72 秒微光导览 |
| 提交状态 | 本轮源码、设计规范与交接记录一起提交至 `main`；V.10 验证与发布见第 15 节。EEG v2 历史代码提交为 `1c8e2e2`。 |

当前有 22 个世界：富士山、大峡谷使用真实地理数据；20 个新场景为用户精选素材的图像重建。地球位置为主题策划的“灵感坐标”，不能声称是采集坐标。两类场景共用视觉调节、单手控制与 EEG 氛围，所有入口默认清晰。

原独立 EEG 监视器现在已经纳入本次接入范围，作为唯一串口采集进程。继续工作前先检查 `git status`；独立 `sharp-gui/` 项目仍不属于此仓库。生产构建通过正式 Vite mode 排除监视器入口，见第 8 节。

## 2. 用户已经确定的需求与边界

- 先做富士山和大峡谷，卫星选区由开发方决定。富士山允许直接使用现成实测点云，无须拘泥于卫星重建。
- 场景必须支持更大空间探索；原模型没有米制尺度，因此不声称严格等于原面积的十倍。现在直接提供约 31 × 36 km、24 × 26 km 的真实区域。
- 保留单手操作：手掌或拳头移动镜头；捏住后上下移动控制持续缩放速度，松开停止。没有双手操作要求。
- 进入场景 →「视觉调节」：三个预设「清晰 / 流光 / 梦境」；三档对照「原始点云 / 粒子流动 / 完整光影」；可调聚散、粒子尺寸、亮度、光晕、余辉等。
- 上述视觉增强已经实现并部署。V.10 两处地理场景保持 **清晰 + 完整光影 + 空中导览**，20 个新场景改为清晰入场与微光短导览；见第 13 / 15 节。
- 加工发生在渲染层，保留原始坐标与 RGB，用户可随时回到原始档对照。

历史参考文件：`/Users/mvgz0331/Downloads/DESIGN (3).md`、`/Users/mvgz0331/Desktop/未命名.mov`。录像是用户私人测试素材，不应提交或上传。该设计为历史参考；V.08 改为 Riverine 的墨蓝 / 青绿 / 奶白界面。真实场景的加工色彩继续由原视觉预设决定。

## 3. 系统路径与代码入口

```text
React 入口 / 地球选点 / 意图与状态
  ├─ Fuji、Grand Canyon → GeoRenderer → manifest + height grid + tileset
  │                                      ↓
  │                       /terrain-data/... PNTS → Worker → 私有 R2 pack 范围读取
  └─ 其余 20 个世界 → WorldRenderer → /scene-data/... → Worker → R2 scenes/<id>/<hash>.bin

两个渲染器共用视觉参数、视觉面板、光晕与余辉模块
MediaPipe 单手识别 → 手势命令 → 当前渲染器镜头
意图文本 → Worker / Workers AI / AI Gateway → 场景推荐
传感器配对与状态 → SensorSession Durable Object → 浏览器
```

技术栈：React 19.1.0、Vite 6.4.3、Three.js 0.180.0、3d-tiles-renderer 0.5.3、MediaPipe tasks-vision 1.1.0、Cloudflare Workers / Durable Objects / R2 / Workers AI。

| 文件 | 作用与维护重点 |
| --- | --- |
| `src/main.jsx` | 根据 `GEO_WORLDS` 动态选择渲染器，切换世界时释放旧实例；页脚版本在此 |
| `src/geo-renderer.js` | 地理点云流式加载、LOD、相机、分块亮点、视觉 uniform、生命周期 |
| `src/geo-point-shaders.js` | 米制流场、柔边粒子、调色、稀疏亮点、边界柔化 |
| `src/world-effects.js` | 两类世界共用的 RenderPass、AccentTrailPass、UnrealBloomPass、OutputPass |
| `src/VisualControls.jsx`、`src/core/visual-style.mjs` | 共用 UI、预设、参数范围与平滑、聚散状态映射 |
| `src/GeoControls.jsx`、`src/geo-controls.css` | 小地图、地图弹层、地标跳转、平移/环绕、来源展示 |
| `src/core/geo-navigation.mjs` | 世界白名单、米制移动、双线性高程采样、连续缩放与停止条件 |
| `src/core/gestures.mjs`、`src/core/gesture-zoom.mjs` | 手势判定、单手连续缩放逻辑 |
| `src/core/locations.mjs`、`src/GlobeExperience.jsx` | 地点目录和地球入口；两处真实场景的范围标识 |
| `src/renderer.js`、`src/point-shaders.js` | 20 个图像重建场景、小幅镜头、短导览和连续调色 |
| `worker/terrain.mjs`、`src/core/terrain-format.mjs` | R2 范围读取、路径/版本/长度校验、PNTS 响应 |
| `worker/index.mjs` | Worker 路由；terrain 路由在静态资源之前 |
| `server/index.mjs` | 本地 HTTP/WebSocket 服务；相同 terrain 路径读取本地 pack |
| `scripts/geospatial/` | 官方数据采集、固定源索引、投影/采样/PNTS 打包 |
| `public/terrain/{world}/` | 已生成的清单、tileset、导航高度网格、卫星图和框选图 |

`locations.mjs` 的点数来自 `point-counts.mjs`：真实场景对应 manifest 的最细层总点数；20 个新模型对应 `scene-assets.mjs` 的原文件点数。运行时可能因 LOD / 画质减少实际绘制点数。

## 4. 两处真实数据：范围、来源、版本

| 项目 | 富士山 `fuji` | 大峡谷 `grand-canyon` |
| --- | --- | --- |
| bbox：西、南、东、北 | `[138.56, 35.25, 138.89, 35.57]` | `[-112.24, 35.99, -111.98, 36.22]` |
| 平面投影 | EPSG:32654 / UTM 54N | EPSG:32612 / UTM 12N |
| 探索范围 | 30.8 × 36.2 km | 23.7 × 25.8 km |
| 最细层显示点数 | 5,115,778 | 4,194,304 |
| 分块总数 | 426 | 341 |
| 当前 pack 版本 | `b2d8b0a3349b` | `085c01c0469a` |
| pack 字节数 | 102,305,768 | 83,842,352 |
| 卫星影像日期 | 2026-02-15 | 2025-10-28 |
| 外围显示采样间距 | 约 15 × 18 m | 约 12 × 13 m |

这些是整个数据集的最细层总点数；运行时按 LOD 和视锥只绘制其中一部分。

### 富士山

- 火山口使用 [VIRTUAL SHIZUOKA 2021 官方点云](https://www.geospatial.jp/ckan/dataset/shizuoka-2021-pointcloud)，按 CC BY 4.0 署名使用。目录提供授权说明，网页偶有 403，元数据接口曾正常可读。
- 正确的 9 个 LAS 分块：`08ME3541 / 3542 / 3543 / 3551 / 3552 / 3553 / 3561 / 3562 / 3563`。旧调查中有 `345x` 网格误写，勿沿用。
- 105,106,003 个原始点覆盖约 **1.2 × 0.9 km 火山口**，1.5 m 三维体素抽样后保留 925,539 个实测点。保留原生 RGB，16 位颜色转换为 8 位 PNTS 颜色。
- 源坐标为 EPSG:6676（JGD2011 平面直角第 VIII 系）；LAS 头未给完整 CRS，依据官方目录确定后转换。
- 外围使用 GSI 约 10 m DEM，340 张 z14 `dem_png` 瓦片。卫星色彩采用完整覆盖且少云的 `S2B_54STE_20260215_1_L2A`。
- 同日 S2A 候选覆盖不完整，2025 年 10 月候选云量不理想，因此未采用。原始档中测绘山顶与外围冬季影像有季节色差；加工配色可柔化，未改写源色。
- **只有火山口是直接实测三维点云，不是整个富士山区域都是 LiDAR。**

### 大峡谷

- 高程来源 [USGS 3DEP](https://www.usgs.gov/3d-elevation-program)，公共领域；Grand Canyon NP 2019 等 1 m 源覆盖选区约 **69.437%**，其余使用约 10 m 区域高程补齐。
- 高程基准 NAVD88；高度约 707–2,579 m。最终显示网格为 2048²，不能宣称整幅以 1 m 间距渲染。
- 颜色来自同日 Sentinel-2 四个分区 `12SUE / 12SVE / 12SUF / 12SVF`。两地卫星来源均为 [Element 84 / Sentinel-2 COG](https://registry.opendata.aws/sentinel-2-l2a-cogs/)，保留 Copernicus / Element 84 加工署名。
- 数据采集读取实际源 COG；USGS ImageServer export 大范围拼接曾超时，不必重走该路径。索引查询使用 JSON envelope。

两地外围均是高度场，无法表示洞穴、倒悬、建筑立面。采用米制与真实高程，未夸张高度。精确 URL、日期、授权署名在 [GEOSPATIAL.md](GEOSPATIAL.md) 和两份 [富士山清单](public/terrain/fuji/manifest.json)、[大峡谷清单](public/terrain/grand-canyon/manifest.json) 中。

## 5. 视觉效果实现与不能丢失的修复

预设 ID 是 `lucid / luminous / dream`；对照档 ID 是 `original / particles / cinematic`。原始档禁用加工输入；粒子档保留流动、关闭光晕与余辉；完整档启用全部效果。

1. **聚散为零仍要流动。** Shader 中基础连续流场独立于聚散，所有偏移都从原始位置计算，不累积改写 BufferGeometry。测绘区与外围的 motionScale 分别为 4 m、55 m，控制流动尺度。
2. **尺寸调节必须在基础尺寸 clamp 后生效。** 否则近景粒子全被 clamp，滑块看起来无效。
3. 主体是柔边点精灵，带高程调色、深度柔化与 RGB 的 sRGB→linear 转换；不是 Gaussian Splatting / 3DGS。加工档的小幅静态扰动缓解规则网格，边缘渐隐缓解矩形裁切。
4. 每个可见分块以稳定坐标哈希 `% 173 === 0` 选择约 **0.58%** 稀疏亮点。只有亮点进入余辉历史，地形主体不进入，避免整座山拖影。
5. 亮点与原分块共用变换，随 tile 可见性更新；分块卸载时释放额外 geometry/material。禁止只添加亮点而不处理流式卸载。
6. 镜头平移与旋转均用于判断运动。移动、缩放、地标/地图跳转、LOD 可见性改变、暂停/恢复、隐藏与卸载时清理或关闭历史。不要再传恒定 `moving: true`，否则余辉始终无法建立。
7. 余辉半分辨率绘制需要临时修正 `uPixelRatio`。现实现遍历材质，并按 **uniform 对象去重** 后减半、恢复，避免共享 uniform 被重复缩放。
8. 最后一次性能调整：原始画布 pixel ratio 上限桌面 1.15、触屏 1；加工 compositor 的 `effectPixelRatio` 桌面最多 **0.85**、触屏最多 **0.7**。加工时 shader 使用相同值，原始档用画布值。不要把测试错误改回强制等于原始画布 DPR。
9. 遵守 `prefers-reduced-motion`，停止时间流动与余辉；暂停时效果时钟停止。原始档跳过后处理。

此前真实场景看起来静止的原因包括：默认原始档、没有独立亮点、一直标记镜头移动、流动被零聚散乘掉。以上均已修复。

地理加载参数：下载并发 4、解析并发 2；桌面缓存 90–140 MiB / 48–160 tiles，触屏 40–65 MiB / 24–72 tiles。运行时屏幕误差基值桌面 4、触屏 8，并按 FPS 自适应放宽；「流畅」档进一步降低细节。相机 FOV 49°、near 1、far 180000；导航采样 513² 高度网格，相机维持至少约 150 m 地形净空。

## 6. 交互、AI 与传感器的实际边界

- 地理坐标：x 向东、y 为高程、z 向南，单位米。平移限制在范围内；视距为对数缩放，最小 120 m、最大约两倍区域最大边长。
- 单手识别使用官方 MediaPipe Gesture Recognizer float16 v1，`numHands: 1`。浏览器 worker / OffscreenCanvas，GPU 失败回退 CPU；摄像头画面本地处理，模型资源自托管。
- 手掌/拳头移动在真实场景默认是平移；右键、Shift 拖动或「环绕」可旋转。旧主题场景继续沿用原镜头映射。
- 拇指与食指捏住后，上下偏离本次捏合的中性位置，输出有符号的持续缩放速度；偏离越远越快，回中暂停，松开停止，再捏重新设定中性位置。
- 鼠标接管后，手需离开并重新进入以重新接管。追踪过期、失焦、页面隐藏、暂停、单帧间隔超过 0.25 s 都会停止连续缩放。
- Gateway ID：`mindscape-demo`；Workers AI 模型：**`@cf/zai-org/glm-5.3-flash`**；每日预算配置 `AI_DAILY_LIMIT=200`。AI 只处理用户主动提交的意图文本，用于场景推荐；实时 EEG 与心率不进入推荐请求，失败时明确回退本地规则。
- 语音识别使用浏览器 `SpeechRecognition` 能力，**没有接入 Gateway 语音转文字模型**。摄像头、原始 EEG/HR 不发送给该场景推荐模型。
- 云端 `SESSIONS` 绑定 `SensorSession`，`AI_BUDGET` 绑定 `AiBudget`；配对 token 有效期 24 h，传感器帧经 HTTP/WebSocket 传递，协议见 [CLOUDFLARE.md](CLOUDFLARE.md)。
- **V.07 设备模式使用共享 EEGFeedback 控制对象。** 冥想控制辅助亮点与温和光晕，专注控制限幅亮度；真实地形主体锁定测量坐标。脑电不改变镜头、点数、LOD 或分辨率。coherence 仅为旧内部视觉变量，不在界面称为脑电相干性。HR 缺失为 null，不伪造 72 BPM；无 HR 时主题场景和地球停止心率脉动。

## 7. 本地运行与数据重建

```sh
cd /Users/mvgz0331/Documents/ChatGPT/td-dive
npm ci
PORT=5174 npm run dev
```

交接前 5174 已有本项目开发服务；另曾存在 5173 服务。先检查端口和进程，避免重复启动或误杀其他任务。浏览器 geo 测试默认访问 5174。

本地 `/terrain-data/...` 从 `artifacts/geospatial/published/{world}/{version}.pack` 读取。`artifacts/` 被 Git 忽略，**新 clone 不会带这些 pack、原始 GIS 数据或 Python 环境**。可从已授权的现有 R2 桶下载对应 pack 到上述目录，或按下面的流水线重建；`wrangler dev` 的本地 R2 也不会自动包含远端对象。

仅调整 shader / UI 无需重新采集地理数据。需要改模型时，使用 Python 3.12 虚拟环境，预留约 10 GB：

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

依赖已固定在 `requirements.txt`；本机现有环境是 `artifacts/geo-venv`。不要用缺少 rasterio 的系统 Python 3.14 替代。源索引在 `scripts/geospatial/sources/`，缓存下载可重复利用。

流水线生成标准 3D Tiles 1.0 PNTS（8 字节对齐，XYZ float32 + RGB uint8），区域四叉树深度 4、每节点 128² 采样、最细地形 2048²。山顶实测区单独分层，移除其覆盖的外围 DEM 点，避免表面重复。pack 只是多个完整 PNTS 的存储拼接，不是自定义浏览器解码格式。

曾修复山顶叶节点过度抽稀：叶节点 ≤ 24,000 点时 stride=1；最细叶节点总数必须与清单一致，已有单测。不要回退到较旧 Fuji pack `fccc324e07f0`。

`npm run assets` 只生成旧程序化资产，不会重建真实地理数据。旧 `public/worlds/fuji.*`、`grand-canyon.*` 保留用于兼容、旧测试和对照。

## 8. 部署与构建入口

Worker 名称 `mindscape-demo`，私有 R2 桶 `mindscape-terrain`。`npm run build` 包含正式体验及本地 `eeg.html`；`npm run build:cloudflare` 仅包含 `index.html`。`npm run deploy` 已改为调用后者，不再需要 artifacts 下的临时 Vite 配置。

```sh
npm test
npm run test:eeg
npm run test:eeg:integration
npm run test:cloudflare
npx wrangler whoami
npm run deploy
```

本机外网需要代理时，在命令前加 `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897`；需保证代理正在运行。部署前验证登录。Three 分包超过 500 kB 的警告不代表构建失败。

EEG v2 是一次整体协议切换：先停止发送，Worker/前端同一版本发布，本地桥接也更新后重新配对。回滚须整体恢复匹配版本；回到 V.06.1 时关闭脑电联动，保留原监视器和场景。

若更新几何，先核对新 manifest、PNTS 和叶节点点数，再上传 **对应版本** 的 pack，最后构建发布清单。当前两份对象上传命令：

```sh
npx wrangler r2 object put mindscape-terrain/fuji/b2d8b0a3349b.pack --file=artifacts/geospatial/published/fuji/b2d8b0a3349b.pack --remote --content-type application/octet-stream
npx wrangler r2 object put mindscape-terrain/grand-canyon/085c01c0469a.pack --file=artifacts/geospatial/published/grand-canyon/085c01c0469a.pack --remote --content-type application/octet-stream
```

读取路径 `/terrain-data/{world}/{12位版本}/{offset}-{length}.pnts`；最大段长 8 MiB，校验世界、版本与安全整数范围。支持 GET/HEAD，未知资源 404、错误方法 405、越界 416。成功 GET 使用 Worker Cache API，带 ETag 和一年 immutable 缓存；`/terrain/*` 清单等静态资源要求重新验证。

不要覆盖相同 hash key 的内容，也不要在新版本发布时直接删除旧 pack；缓存中的旧页面仍可能访问。此前纯地理版本的 Worker ID 为 `adcf14fb-82a1-4e95-95ea-d6257e4cec10`，V.06.1 视觉增强版本为 `812c9a25-ea06-4990-8684-868064b7aa7c`；当前 EEG 版本见第 1 节。回滚时同时考虑前端引用与 R2 对象是否匹配。

本次集成涉及原 EEG 监视器文件：`eeg.html`、`vite.config.js`、`src/eeg/`、`server/eeg.mjs`、`scripts/eeg_serial.py`、`scripts/thinkgear.py`、`tests/eeg-model.test.mjs`、`tests/test_thinkgear.py`、`EEG-INTEGRATION-PLAN.md`、`EEG-MONITOR.md`，以及 `package.json` 的 EEG scripts、`tailwind.config.js` 的入口、`.gitignore` 中 `__pycache__/` 与 `sharp-gui/`。这些文件已成为本次功能的组成部分；`sharp-gui/` 仍独立且被忽略。

## 9. V.06.1 历史验证记录与复现命令

以下为上一轮执行记录，不表示整理本文时又跑了一遍。

| 检查 | 结果与范围 |
| --- | --- |
| `npm test` | 当前共享树 45 项通过，其中含 4 项独立 EEG 测试 |
| `git diff --check`、JS 语法检查 | 上轮通过 |
| `npm run test:geo:visual` | 两世界各 17 项通过；包含三档、三预设、实际像素变化、零聚散流动、尺寸/亮度、余辉清理、暂停/减少动态、源数据不变、资源回收 |
| 完整视觉套件的时效 | **17 × 2 完整运行发生在最后 0.85/0.7 后处理分辨率优化之前。** 随后已更新 DPR 断言，但没有再完整运行这套 34 项 |
| `npm run test:geo` 的浏览器部分 | 最终分辨率版本通过：两处实际 WebGL、平移、模拟单手持续缩放、过期停止、地图；GL error=0 |
| `npm run test:geo:ui` | 最终线上版本通过：三预设、三档、滑块、恢复默认、手势入口、移动端布局、地图，以及 Fuji→Canyon→旧 Palau 场景切换 |
| `tests/geospatial-live.mjs` | 当前两份 pack 数据通过首/中/尾 PNTS 与本地逐字节核对、HEAD 长度、越界 416、导航网格与缓存检查；视觉修改未改变数据包 |
| 真人摄像头/用户录像 | 本轮未重新测试。模拟命令测试不能替代 MediaPipe 实际识别验证 |

本地服务就绪后：

```sh
npm test
npm run test:geo
npm run test:geo:visual
npm run test:geo:ui
```

线上 UI 与 R2 数据核验（本机需要代理时）：

```sh
GEO_TEST_URL=https://mindscape-demo.aspirincap.workers.dev GEO_TEST_PROXY=http://127.0.0.1:7897 node tests/geospatial-ui.mjs
TEST_HTTPS_PROXY=http://127.0.0.1:7897 node tests/geospatial-live.mjs
```

`geospatial-live.mjs` 可用 `DEPLOY_URL` 替换目标。测试脚本已适配本机缓存中的 Chromium headless shell；当前 Playwright 默认要求的浏览器版本曾缺失，不要绕过脚本直接假定默认 `chromium.launch()` 可用。

证据均在被 Git 忽略的 `artifacts/`：

- `artifacts/geospatial/visual/results.json` 与 `{world}-{original|particles|cinematic|lucid|luminous|dream}.png`：完整视觉套件的结果与对照截图。
- `artifacts/geospatial/verification/browser.json`：最终本地渲染/导航验证；`live.json`：线上数据检查。
- `artifacts/geospatial/verification/fuji-ui.png`、`canyon-ui.png`、`mobile-fuji.png`、`mobile-map.png`、`mobile-visual-panel.png`、`legacy-after-geo.png`：最近 UI 检查截图。

最后一次 headless 概览采样两世界约 14 FPS；Fuji 可见约 81,434 点、Canyon 65,536 点，模拟持续缩放后的视距比约 0.519 / 0.548。该环境不能作为真人硬件帧率基准，**未证明稳定 60 FPS**。`browser.json` 的 `detail` 字段是在 resetCamera 后采样，不应解释为真正近景性能。

`tests/geospatial-lab.html` 是开发测试入口，不在正式构建中；旧 `tests/visual-lab.html` 或 world gallery 的截图不能代替新 GeoRenderer 的验证。浏览器测试期间不要修改源码触发 HMR，也不要并发覆盖同一路径报告。

## 10. 后续接手优先事项

1. 改视觉时复用现有地理 pack。改共享 `world-effects.js` 要同时回归主题与真实场景。
2. 新 clone 需取回 R2 pack 或重建；不要提交原始 GIS、pack、私人录像、配对凭据或整个 artifacts。
3. 脑电工程参数仍需真人佩戴、手势与不同光照下验证。自动回放、headless GPU 和现有设备数据流不能替代主观体验与真人动作验收。
4. V.06.1 的地理完整视觉套件是否补跑，以本次第 11 节明确记录为准；不要把不同版本报告混为一谈。
5. 扩展协议只在 `eeg-protocol.mjs` 中定义；不要恢复旧协议、默认心率、25 Hz 重复广播或按绘制帧计校准。

## 11. EEG v2 本轮交接（V.07.0）

### 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/core/eeg-protocol.mjs` | 唯一 wire schema、云端重新推导有效性、逐字段去重/年龄、时钟往返上界 |
| `server/eeg-observations.mjs` | 订阅已校验 ThinkGear 包，独立 sampleId、单调年龄；串口重开换 UUID |
| `server/eeg-forwarder.mjs` | 目标白名单、内存凭据、WSS、退避、只保留最新、停止/重新配对 |
| `worker/eeg-session.mjs` | Node 与 DO 共用 relay；发送权、短租约、无重放与会话隔离 |
| `src/core/eeg-feedback.mjs` | 三样本稳定、30–60 秒独立样本校准、中位数/MAD、死区、按时间平滑限幅、状态机、共享视觉偏移 |
| `src/useEEG.js`、`src/EEGPanel.jsx` | 同源订阅、客户端时效、来源切换、设备状态、校准/趋势与脑电氛围入口 |
| `src/eeg/ForwardPanel.jsx` | 本地监视器配对与开始/停止发送；成功后清空配置输入框 |
| `tests/eeg-*.mjs`、`scripts/verify-eeg-live.mjs`、`scripts/verify-eeg-history.mjs` | 协议/反馈单测、真实 WS 链路、浏览器、GPU 对照、可选本地真实设备汇总 |

### 运行行为

- `npm run eeg` 仍使用现有 Python 作为唯一串口读取者，默认 9600 / 8N1，不向设备发送重配置命令。
- 复制 Mindscape 的 v2 配对配置，到本地监视器粘贴、开始联动。默认允许正式 workers.dev 和回环 5173/5174/5178/5186/8787，不能向任意粘贴地址发送数据。
- 本地及云端都要求配对；WebSocket viewer 不具有写入设备数据权限。设备 WSS 带 Authorization，URL 仅带 role，不带令牌。
- 凭据有效性由目标服务时钟裁定；发送端不假设本机墙钟与云端一致。租约往返时间 + 浏览器 ping 上界保守计算字段时效；链路慢或未握手时暂停采用读数。
- 仅新相关观测增加 seq，每字段有 sampleId。heartbeats / UI 绘制 / 原值重复广播都不制造样本；相同数值的新设备观测仍算新样本。
- 2.5 秒字段超时冻结对应控制量，接触异常立即阻止更新；10 秒离线标记联动暂停。鼠标与手势始终可用。恢复需要连续有效读数，输出平滑接续。
- 校准至少 30 个活跃秒且 attention/relaxation 各 ≥25 个有效独立读数；最多 60 秒，不足失败。暂停、隐藏不计时，不采无效或重复样本；结束时也要求信号可用。换 stream 清除旧基线，短暂网络重连保留。
- 设备面板显示相对分、独立趋势断点、最近有效读数年龄、四类连接/信号/基线状态。无 HR 显示未接入；默认环境氛围不冒充测量。
- 60 秒引导在设备模式不切换到模拟器。原始点云不叠加脑电视觉偏移，关闭氛围平滑回到手动设置，音量与声音启用由用户控制。
- 真实地形在设备模式锁定主体位置，仅辅助层流动及限幅亮度/光晕参与脑电反馈。主题点云有克制聚散；脑电不接管镜头。
- 原始字节/RAW/频段不上传。AI Gateway 改为只接收主动提交的文字，`/api/route` 拒绝旧 `{text, frame}` 请求。
- DO 使用普通 WebSocket 和有效期计时器而非休眠 API，以在内存维护发送权与去重；不写脑电历史到 storage。长连接会产生常驻运行成本，规模扩大前可再设计仅元数据持久化的休眠方案。

### 本轮验证与发布

2026-10-10 已发布 **V.07.0**，Worker ID `80e83cf3-9fc6-4c20-8eee-8096a545ecc5`。Worker 和静态前端同批部署，R2 点云 pack 未变；Gateway 仍为 `@cf/zai-org/glm-5.3-flash`。

| 检查 | 本轮结果 |
| --- | --- |
| `npm test` | 57 项通过，含协议、独立样本、时效、校准、暂停/隐藏、共享映射与已有场景逻辑 |
| `npm run test:eeg` | 6 项 Python 解析测试及 4 项监视器模型测试通过 |
| `tests/eeg-integration.mjs` | 实际本地 WS、发送模块、会话隔离、独立字段年龄、心跳不造样本、重连不重放、换流、停止清凭据通过 |
| `tests/cloudflare-smoke.mjs` | Miniflare 及 V.07 线上通过；HTTP/WS v2、旧格式拒绝、隔离、过期检测、静态资源与模型校验；线上推荐实际使用 AI Gateway |
| `tests/eeg-browser.mjs` | 本地及 V.07 线上均通过；设备分数/无 HR、独立校准计数、接触异常、来源切换、呼吸引导、三场景及移动端 |
| `tests/eeg-monitor-browser.mjs` | 串口关闭时可配对，输入框清空，不发送旧缓存，停止联动后串口仍关闭 |
| `tests/eeg-render.mjs` | 富士山、大峡谷、深海：源坐标及手动设置不变，EEG 不动镜头，模拟手势缩放可用，地形主体锁定，缺 HR 不脉动，原始档及 GL 无错误 |
| 构建 | 普通双入口与 `--mode cloudflare` 单入口构建通过；发布资产来自 `artifacts/eeg/cloudflare-dist` |
| 静态检查 | `git diff --check`、语法与文档链接检查通过 |

**历史回放（串口关闭后）：** 用户允许使用本地历史记录。读取 Downloads 下 `eeg-2026-10-10T13-17-39-639Z.jsonl`，按 183 个原始接收块重新解析，结果与导出逐包一致。录制跨度 96.457 秒、93 个包，其中 1 个校验错误被丢弃；92 个其余包均为 poorSignal=200、attention/meditation=0。沿真实时间间隔的虚拟时钟回放 v2 聚合 → 会话 relay → EEGFeedback，92 个异常读数均未驱动画面控制量、未计入校准；过期冻结、10 秒离线暂停通过。该历史文件只覆盖接触异常，**不作为正常信号或网络延迟验证**。没有开启串口、访问网络或复制历史原文。

**实时设备验证（用户关闭串口之前）：** 2026-10-10 22:16:45–22:26:45（上海时间），订阅当时已运行监视器 SSE 的新事件，转发至独立本地 5186 会话，没有第二个串口读取者。运行 600.050 秒，收到并发送 563 帧，专注/冥想各 563 个可接受读数，有效比例 100%，重连 0。校准完成时各 28 个独立样本；最大字段年龄 1005 ms，浏览器传输保守上界最大 41 ms，ping 往返最大 75 ms。诊断进程 RSS 从约 45.4 MB 到 20.6 MB，未见持续增长；这不等于全应用内存验证，比例也不代表生理测量准确率。该记录不能冒充现场真人动作验收或线上真实设备测试。

**当前本机状态：** 用户关闭串口后已停止联动并释放串口。8765 新监视器保留运行，状态 `disconnected`，bridge 为 `stopped`。不要为了复测自动打开设备。5174 是升级前已启动的 Node 进程，Vite 能显示新前端但旧后端未热更新；进行本地 v2 联调前需重启该服务。生产页面与新 8765 监视器已是匹配版本。5186 仅为本轮测试实例，验证后已关闭。

**验收边界：** 三场景渲染脚本的耗时只作为 headless 诊断，不能据其 CPU 提交耗时声称真实 GPU 帧率下降小于 5%。本轮没有重新执行全部 34 项地理视觉套件，也没有进行真人佩戴时的单手动作、光照、接触丢失与恢复主观验收；模拟手势命令测试不能替代 MediaPipe 实际识别。线上目前以独立合成会话测试，不上传私人历史录制。

汇总与截图留在被忽略的 `artifacts/eeg/`：`live-summary.json`、`history-summary.json`、`render.json`、`browser.json`、`monitor-forwarder.png` 和场景截图。公开 Git 只提交源码、测试及本交接摘要，原始脑电录制、配对配置、私人录像不提交。

代码提交：`1c8e2e23913cbec207e1a183facc389fc909f1b0`（`Integrate EEG v2 feedback with real terrain scenes`）。本交接文档以紧随其后的独立提交保存；两次提交推送至 `origin/main`。精确文档提交号用 `git log -1 -- HANDOFF.md` 查看，避免文档自引用提交哈希。

相关文档：[EEG-INTEGRATION-PLAN.md](EEG-INTEGRATION-PLAN.md)、[EEG-MONITOR.md](EEG-MONITOR.md)、[GEOSPATIAL.md](GEOSPATIAL.md)、[CLOUDFLARE.md](CLOUDFLARE.md)。早期 `artifacts/geospatial-research/PLAN.md` 仅为调研历史。


## 12. Riverine 前端重构（V.08.0）

设计依据为 2026-10-11 用户粘贴的完整提示词；用户已明确选择“严格采用附件布局、视频和动效，保留现有 Mindscape 功能与产品文案”。[DESIGN.md](DESIGN.md) 完整保留原文，并记录 React 适配边界、字体缺失和原稿未规定坐标的落地数值。不要再按 MotionSites 缩略图自由推测设计，也不要恢复原紫色按钮。

### 实现与边界

- 新增 `src/riverine/`：`RiverineHero.jsx`、`hero.css`、`design.mjs`、`theme.css`。Hero 100dvh，指定 CloudFront 视频仅远程播放，未下载到仓库；静音 / 自动播放 / 循环 / playsInline，三层遮罩、基准标尺、SVG 路径与断点按原提示词。
- 标题与品牌换为 Mindscape 中文；原 href 保留并接到实际旅程、地球、说明、设备面板。后续地球、脑电、视觉、地图和手势面板统一使用墨蓝、青绿与奶白。
- `--u` 采用 1280×960 比例；手机、短横屏、650–1100 平板和竖屏有独立处理，含 safe-area。手机菜单打开聚焦首项，Escape 关闭返焦，外部点击与链接选择关闭；短横屏小于 650px 时为双列。
- 入场用 WAAPI，等待字体与视频 loadeddata，按原时间轴执行；3.5 秒失败兜底直接显示，之后不补播。减少动态效果偏好直接显示，并暂停视频。卸载时移除监听、定时器、动画；完成时无残留内联样式。
- 附件未提供 `rv-display.woff2`、`rv-brand.woff2`、`rv-text.woff2`。保留原 @font-face、font-display:block 和回退栈，未替换字体；因此构建提示未解析、浏览器可能出现三份可选字体的 404，字体走指定回退。获得文件后放到 `public/assets/fonts/` 即可。
- 首页声音按钮按原文只切换 aria-pressed 与波纹透明度，不新增音频文件。最终场景原有 Web Audio 音量和开关独立保留。
- 首页不创建 WebGL 地球；进入旅程才加载地球，离开首页即卸载河流视频。脑电协议、算法、手势识别、点云资产及 Worker 逻辑均未改动。
- 修正文案：心意页面明确 AI 只接收主动输入的文字，去除早期“粗略放松状态”描述。

### 本轮验证

- `npm test`：57 项通过；`npm run build:cloudflare` 构建通过。除已声明的可选字体与既有 Three 大分包提示，无构建失败；`git diff --check` 及相关 JS 语法检查通过。
- 使用内置浏览器验证 1280×960 参考尺寸：stage=1280×960、nav=442×47；视频 readyState=4、静音且播放；入场结束无等待 class、无内联 style 残留。
- 检查 375×812、390×844、650×960、768×1024、844×390、600×360：无横向溢出，标题、操作、滚动提示未越界。650 / 768 平板使用桌面导航，600 短横屏菜单为双列。
- 菜单打开首项聚焦、Escape 返焦、外部关闭、指南选择关闭及关闭说明后返焦正常；声音状态 true→false 时波纹 opacity=.25。
- 首页→心意→推荐→富士山流程通过；原始档禁用效果滑块、恢复默认正常，手势入口保留。设备面板缺失读数为 —、心率未接入，390×844 下对话框未越界；最终场景不存在首页视频元素。
- 本轮未重新开启串口或摄像头。没有把已有 10 分钟 EEG 实测或手势单测称为本轮硬件验收。
- 本地截图在 `artifacts/riverine/desktop.jpg`、`mobile.jpg`、`mobile-eeg.jpg`，仅作验收证据，不提交私人数据。5186 本轮预览已关闭，未改动 5174 或 8765 进程。

### 发布

2026-10-11 已部署 V.08.0，Worker ID `8f7069f7-b307-45c7-b34a-5b9714a5ae70`，线上地址不变。发布资产来自本轮 `npm run build:cloudflare` 生成的 `dist/`；Worker、R2、Gateway 配置未改动。

线上内置浏览器复核：指定视频 readyState=4、静音播放，导航 442×47，无横向溢出；入场结束无等待 class 与内联 style。点击「直接探索 12 个世界」可到达完整目的地目录，页脚为 V.08.0。线上首页截图保存在 `artifacts/riverine/online.jpg`。本轮对浏览器测试脚本做了入口选择器适配，但没有重跑两份完整浏览器脚本；实际 UI 验证由内置浏览器完成，范围见上文。

本轮源码、`DESIGN.md`、README 和本交接记录一起提交并推送至 `origin/main`。精确提交用 `git log -1 -- src/riverine/` 查看。


## 13. 空中导览与真实 BIN 验证（V.09.0）

### 实现

- `src/core/geo-tour.mjs`：富士山「雪峰与湖泊」5 分钟、大峡谷「峡谷逐风」4 分钟闭合路线。米制控制点 → 曲线 → 2048 采样 → 弧长匀速；高程邻域及前后包络提前爬升。开场注视主要地标，再渐变到前向滑翔；适度俯视与最多约 4.9° 侧倾。
- `src/geo-renderer.js`：就绪后默认飞行；减少动态效果偏好默认停在起点。暂停、隐藏与超过 250 ms 的长帧不快进。鼠标、滚轮、方向键、地标跳转或有效单手命令切换自由探索，镜头接管保持位置；重新起飞 / 手动后继续采用 6 秒位置过渡、抬升余量与四元数朝向插值。
- `GeoControls`：导览状态、章节、路程、暂停 / 继续 / 重新起飞。地图、地标、平移 / 环绕、光影随行和边缘开关收在可展开设置中；手机展开设置使用独立底部面板，避免与视觉入口交叠。
- 两处默认清晰；按路线连续混合清晰 → 流光 → 梦境 → 清晰，地形聚散上限 .06。手动调节终止自动光影但飞行继续，参数与调色均平滑接续；光影随行可重新打开。原始档保持中性，禁用自动光影。其余主题世界仍默认流光。
- `geo-point-shaders.js`：世界坐标超椭圆边界，在 .70–.99 归一化半径内平滑降低 alpha 和颜色能量，柔化四角。默认包含原始档，可关闭后看完整矩形。三套调色连续插值，不再用阈值突然切换；原坐标、RGB、PNTS 与 R2 pack 未改。
- `scripts/verify-eeg-binary.mjs`：纯本地解析 `.bin`，以整块、单字节和多种碎片验证增量解析一致性，再经真实 observations → 内存 relay → feedback。BIN 不含时间戳，分别以假定每包 0.5 / 1 / 2 秒做敏感性回放，不把模拟时长称为录制时长。

### 本轮验证

- 用户本轮 BIN 已完成本地回放；校验 / 解码、重复拒绝、有效独立样本校准、异常冻结、输出限幅、过期 / 离线暂停通过。具体统计和校准结果留在 `artifacts/eeg/binary-summary.json`，不提交用户录制或个人读数明细。未打开串口、摄像头或上传历史脑电。
- `npm test` 61 项通过；`npm run test:eeg` 的 6 项 Python 与 4 项监视器测试通过。
- 完整路线在真实导航高程上逐帧检查：富士山最低净空 685.1 m、最大 30 Hz 步距 8.25 m；大峡谷 771.5 m / 3.88 m。闭环连续、有限值、边界范围、转弯限制、暂停 / 隐藏 / 手动状态、减少动态初始状态和连续光影通过。净空仅是数字地形检查，不能替代真实飞行用途。
- 内置浏览器真实 WebGL：富士山清晰开场、全景边缘开 / 关、鼠标接管位置差约 1.8e-12 m；峡谷中段 palette=1.37（连续混合）、无 GL 错误，合成设备模式 geoLocked=1，模拟单手命令可接管。此处模拟命令不等于真人摄像头验收。
- 实际手机 390×844 验证路程暂停保持、手动梦境切换、边缘 / 光影开关与控件入口。测试图留在 `artifacts/tour/`。
- 原浏览器回归脚本的地图展开、默认预设、静态 GPU 验收页和光影稳定时间已适配；本轮未重跑整套旧 Playwright 脚本，实际 UI 验证用内置浏览器完成。不要把历史 EEG / 地理套件结果标成 V.09 全套验收。

### 发布

2026-10-11 生产构建通过（`npm run build:cloudflare`），仍只有已知的可选字体未提供与 Three 大包提示。发布资产核查排除了测试页、EEG 监视器入口、私人 BIN 和本地报告。

已部署 Worker `adb1ef45-6789-464c-acce-554327ec0443`，地址仍为 https://mindscape-demo.aspirincap.workers.dev/ 。线上复核富士山自动进入 5 分钟导览、大峡谷进入 4 分钟导览，清晰画面与暂停按钮正常，页脚 V.09.0；两处切换后未发现线上控制台错误。截图在 `artifacts/tour/online-fuji.jpg`、`online-canyon.jpg`。源数据、后端、Gateway 和 EEG 协议没有更改。

本轮代码与文档一起提交并推送 `origin/main`，精确提交用 `git log -1 -- src/core/scene-tour.mjs` 查看。5186 本轮预览收尾后关闭，未改动原 5174 / 8765 进程。私人 BIN、个人统计与 `artifacts/` 不进入 Git 或部署资产。


## 14. 四张生成图首页轮播（V.09.1）

用户先要求生成候选 Hero 图片，随后选择“四张都要，渐变轮播”。此指令取代历史 Riverine 提示词里“只能使用指定 MP4”的限制；其余布局和应用功能保留。

- 顺序：云海富士 → 流光地貌 → 深蓝海境 → 峡谷晨光 → 云海富士。完整停留 8 秒、渐变 2.4 秒；旧图保持不透明底层，新图在上方逐渐显现，避免双层同时减透明导致闪黑。
- 图片只在 decode 成功后进入轮播；加载失败跳过，首张失败时使用已就绪背景。四张原始生成 PNG 和完整提示词留在 gitignored `artifacts/hero-options/`；正式 WebP 在 `src/assets/hero/`，1672 / 960 两档、质量 84、内容哈希构建。完整四图约 414 KiB，小图约 154 KiB。
- 轻微缓慢推进，最大缩放 1.055；离开标签页暂停计时和缩放，返回后重新完整停留。减少动态效果默认暂停，手动选图无动画；改变系统偏好为减少动态效果时自动暂停。
- 右上角原占位声音图标改成实际轮播播放/暂停。右下名称与四个选图点支持手动选择，选择后保持该图，点击播放恢复。选择控件获得键盘焦点时暂停自动换图。
- 手机使用每张图独立的主体裁切位置，背景控制位于左下，探索入口仍在右下。保留全部导航与开始 / 直接探索入口；首页不加载点云。
- 代码入口：`src/riverine/slideshow.jsx` 管理图片、解码、轮播与清理，`RiverineHero.jsx` 渲染叠层和控件，`hero.css` 定义过渡、缩放与裁切，`design.mjs` 改为首图 / 字体就绪入场。

验证：`npm test` 61 / 61 通过，`npm run build:cloudflare` 通过；内置浏览器实际检查 1280×720 桌面与 390×844 手机、四图加载、暂停/恢复、手动选图、自动轮播和峡谷回到富士的渐变叠层，无横向溢出。浏览器控制台未见本次新增错误。减少动态效果通过实现检查，未切换用户系统偏好做实际验证。本次没有重跑旧 EEG / 地形全套浏览器回归。

发布：已部署 Worker `ba6f9dfb-a3b2-4f28-8c3b-d7bcd8eadce5`。线上四张哈希 WebP 全部解码成功，无旧 MP4 请求、无横向溢出，暂停和选图可用，未见控制台错误。线上截图 `artifacts/hero-carousel/online-desktop.png`，手机截图 `artifacts/hero-carousel/mobile-ocean.png`。本轮源代码、压缩背景与文档一起提交并推送 `origin/main`；原始 PNG 不参与部署。


## 15. V.10.0 — 20 个精选模型与微光导览

用户指定 ZIP 里的全部 20 个模型已用于替换旧程序化场景，仅保留富士山与大峡谷，合计 22 个世界。地点映射、时长、点数、格式、复现和部署路径详见 [SCENE-CATALOG.md](SCENE-CATALOG.md)。

### 实现要点

- 以 ZIP 内清单和 SHA-256 为准，244,248,064 字节的模型保持原样，20 个新对象放在已有 R2，按需加载；Worker 只允许内容哈希清单中的路径。源文件 / 源记录元数据不公开，不进入 Git。
- 新模型为图像重建；地球、详情及导览说明明确“灵感坐标 / 非实地扫描”。在 SCENE_PLACES 修改地点，在 SCENE_ASSETS 查看对应模型。
- WorldRenderer 默认清晰，采用原推荐相机与素材安全 yaw。48–72 秒循环，四章、连续 paletteMix、克制聚散与光晕。镜头幅度很小，不追求地形飞行。
- SceneTourControls 提供暂停 / 继续 / 重新导览和光影随行开关。手势 / 鼠标接管后 3 秒加入路线；手机使用紧凑面板。保留原单手连续速率缩放和 EEG v2。
- 原有 12 份程序化 BIN / PLY 移到本机 artifacts/legacy-worlds-v09/，退出 Git 与生产部署；真实地形 public/terrain 和 R2 pack 未修改。旧生成脚本是历史资料，npm run assets 现调用 import-scenes.py。

### 验证与发布

- npm test：66 / 66，通过所有导览、格式、推荐、单手与 EEG 单测。
- npm run test:eeg:integration：通过 Node WS 实际链路、隔离、独立字段时效、断线和停止回归，无需串口。
- npm run test:cloudflare：本地 Worker 会话 / EEG v2 / 推荐与限流回归通过。
- 20 / 20 正式渲染器 GPU 验收通过，原点数一致，清晰 / 中段 / 镜头边界有有效像素，图形错误 0；结果在 artifacts/scene-verification/gpu.json。
- 正式构建成功；线上 Worker 版本 `fbdab2e0-7397-4bdb-ac34-782941ed8825`。原 Gateway / 模型与 Durable Object 绑定保持不变。
- 线上 smoke 全部通过：20 个模型 HEAD 大小 / ETag、一份完整二进制 SHA-256、两个地形 manifest、22 个 API 地点、旧资产 404、手势资源与 WSS / EEG 会话隔离；真实 AI Gateway 将雨林推荐为 scene-02，将特罗姆瑟推荐为 scene-19。
- 手机 390×844 iframe 实际操作通过：进入极光、暂停、手动光影、恢复自动光影、重新导览、场景说明。截图 artifacts/scene-verification/mobile.png。
- 本轮未打开串口或真人摄像头；没有重新进行完整 EEG 设备 UI / 真人手势录屏验收。原协议、手势核心测试和中继链路回归已通过。
- 新素材上的视觉管线回归：23 项检查通过（三档有可测画面差异、聚散展开 / 恢复、余辉清除、减少动态偏好、普通颜色缓冲降级、资源释放）。为双层平滑留出 15 秒模拟收敛时间；日志 artifacts/scene-verification/visual.txt。
- 正式站点实际进入怀托摩并加载微光导览，页面错误日志为空；截图 artifacts/scene-verification/live-waitomo.png。开发版手机视口另外确认富士山 5 分钟、大峡谷 4 分钟原导览正常出现，截图 geo-retained.png。
- 最终视觉复核又收敛了导览中段：调色按源像素亮度归一，保留洞穴 / 树林的暗部；自动导览粒子尺寸 ≤1.02、亮度 ≤1.17、光晕 ≤0.45、柔化 ≤0.13、余辉 ≤0.4。手动视觉参数范围保留。此改动后再次通过 66 单测、20/20 GPU 和 23 项视觉管线回归。全部场景清晰 / 中段对照图为 artifacts/scene-verification/clear-and-tour.png。
