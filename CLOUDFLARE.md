# Cloudflare 部署

站点：<https://mindscape-demo.aspirincap.workers.dev>

已部署 `mindscape-demo` Worker，静态资源、两套世界、实时 API、两类 SQLite Durable Objects 和 Workers AI 绑定均在同一账号。AI Gateway `mindscape-demo` 已于 2026-10-08 在 Cloudflare 控制台创建，线上完整链路已通过 `REQUIRE_AI=1` 验收：返回 `mode: "ai-gateway"`、网关 ID 和真实网关请求 ID。Chrome 页面也已验证显示「AI 推荐」，根据海底意愿将帕劳排在首位。

本次线上检查同时通过访客会话隔离、HTTP/WSS 设备输入、错误帧拒绝、2.5 秒断流检测及双世界资源加载。结果保存在 `artifacts/cloudflare-live.json`；Chrome 实测记录为 `artifacts/cloudflare-browser-ai.json`，截图为 `artifacts/cloudflare-ai-live.png`。网关验收请求 ID：`01M4DEQNTDW56ESQR025HKCZ46`。

2026-10-08 模型已切换为 `@cf/zai-org/glm-5.3-flash`，部署版本 `abc36599-db47-4d36-b5d3-327250d96caa`。森林与海底请求均通过线上真实 AI 验收，响应的 `model` 与配置一致；海底请求经网关返回耗时约 3.67 秒，网关请求 ID 为 `01M4DK2CBYF2KSWVB5Z08WDERJ`。切换记录为 `artifacts/cloudflare-glm-check.json`。

## 组成

- **Workers Static Assets**：React 页面、地球、字体及双世界点云，静态资源从边缘分发。
- **Worker API**：`/api/session`、`/api/health`、`/api/locations`、`/api/route`、`/api/frame` 和 `/ws`。
- **SensorSession Durable Object**：每个 256 位随机会话独立；WebSocket 使用休眠 API，按设备输入实时转发。无固定轮询计时器，不持久化心率、脑电或传感器历史。浏览器在 2.5 秒断流后保持上一次有效画面。
- **Workers AI → AI Gateway**：`@cf/zai-org/glm-5.3-flash`，只在用户主动提交心意时调用。发送文字和粗粒度放松状态，不发送心率、原始 EEG、IP 或配对凭据。使用 `reasoning_effort: low`、`max_completion_tokens: 1024` 和严格 JSON Schema，验证目的地白名单和数值范围；超时/格式异常时回退规则。
- **AiBudget Durable Object**：同一 IP 每分钟 6 次、全站每分钟 20 次、每天 200 次推理尝试。每日额度在 UTC 00:00 重置；超额继续使用本地推荐。额度只计数，不记录用户文本。按分钟保存 IP 摘要；次分钟请求时重置。

`mode: "ai-gateway"` 表示真实模型结果；`mode: "local-rules"` 和 `fallback` 表示降级。健康检查中的 `router/gateway/model` 是配置，不代表模型推理成功。AI Gateway 请求关闭缓存和内容日志，Worker 持久日志默认关闭。

## 网关与部署

本账号已创建 `mindscape-demo`，开启身份验证、关闭缓存和内容日志，并设置滑动窗口 20 次/60 秒限制，Workers AI 使用 Standard billing。Worker 的 AI binding 自带账号身份，不需要把 Cloudflare API Token 放进前端或 Worker Secret。重新部署到其他账号时，可在 **AI → AI Gateway** 中创建同名网关并复用上述设置。

也可以使用带 **AI Gateway Edit** 权限的 Token 文件创建（文件只包含 Token，放在项目之外，权限 `600`）：

```sh
CLOUDFLARE_TOKEN_FILE=/absolute/path/to/token npm run deploy:gateway
```

脚本不会打印凭据，也不会覆盖同名网关；已有网关的设置需在控制台确认。若 Wrangler OAuth 调用网关管理接口返回 403，可通过已登录控制台管理网关，或使用具备 AI Gateway Edit 权限的 Token。Worker binding 的运行身份与命令行管理权限独立；管理接口权限不足不影响已验证的线上推理。

```sh
npm ci
npx wrangler whoami
npm test
npm run test:cloudflare
npm run deploy
```

`wrangler.jsonc` 已绑定当前账号。部署到另一账号时需同时修改 `account_id`，并创建自己的网关。AI 推理采用该账号的 Workers AI 计费/配额；这里未升级套餐、购买预付费积分或绑定外部模型供应商。

## 设备配对

浏览器进入「设备接入」，点击「复制设备接入配置」。配置包含 HTTP/WSS 地址及 `Authorization: Bearer …`，有效期 24 小时；只交给自己的采集程序。

浏览器通过同源 HttpOnly、SameSite=Strict、Secure Cookie 自动关联会话。外部设备向 `/api/frame` 或 `/ws` 请求时携带复制的 Authorization 请求头。凭据不放在 URL，避免被访问日志记录。HTTP 正文直接发送 frame：

```json
{"attention":0.58,"relaxation":0.76,"HR":72,"signalQuality":0.98}
```

WebSocket 消息：

```json
{"type":"sensor","frame":{"attention":0.58,"relaxation":0.76,"HR":72,"signalQuality":0.98}}
```

建议 25Hz 持续输入，WebSocket 每连接最多接收 50 帧/秒。每会话最多 6 个连接。过期后重新复制配对配置；刷新配对凭据不会复用过期会话。未配对请求为 401，跨域请求为 403。默认模拟器完全在浏览器内运行，不上传逐帧数据。

本地 `npm run dev` 仍保留原有无需配对的回环地址桥接，不能将该 Node 进程直接暴露到公网。

## 验收

```sh
# Cloudflare 本地运行时：会话隔离、WSS 协议、HTTP 帧、断流、校验、AI 限额
npm run test:cloudflare

# 真实线上验收；强制要求真实 AI 成功，不接受回退
DEPLOY_URL=https://mindscape-demo.aspirincap.workers.dev REQUIRE_AI=1 EXPECTED_AI_MODEL=@cf/zai-org/glm-5.3-flash npm run test:cloudflare

# Chromium 验证真实地球、双世界、推荐、设备连接和手机布局
DEPLOY_URL=https://mindscape-demo.aspirincap.workers.dev REQUIRE_AI=1 node tests/deployed-browser.mjs
```

命令行访问需使用系统代理时，给线上 API 验收添加 `TEST_HTTPS_PROXY=http://127.0.0.1:7897`（按本机代理地址调整）；浏览器测试沿用系统浏览器网络设置。

报告和截图保存到 `artifacts/cloudflare-*`，不包含会话凭据。去掉 `REQUIRE_AI=1` 可验证网关维护时的回退体验。默认预算也适用于测试请求；避免一分钟内重复发起大量线上验收。

Cloudflare 本地完整页面调试：`npm run dev:cloudflare`。Wrangler 的 AI binding 可能调用远端服务；纯离线测试使用 `npm run test:cloudflare`（没有模型绑定）。

参考：[Workers AI 网关绑定](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)、[绑定请求自带认证](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)、[网关创建 API](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/)。

## 2026-10-09 海洋蓝与手势版本

前端采用海洋蓝配色；最终双世界新增可选 MediaPipe 手势控制。静态资源增加 `public/mediapipe/`：固定 SDK 1.1.0、SIMD/非 SIMD WASM、官方 Gesture Recognizer float16 v1、独立识别 Worker。最大单文件约 12 MB，模型约 8 MB。模型和 SDK 按版本长期缓存，识别 Worker 每次校验更新。摄像头和手部数据在浏览器处理，后端/API/Gateway 无新增视频接收接口。

模型 SHA-256：`97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`。部署前确认 `npm run build` 的 dist 包含上述资源。开发测试页面位于 tests/，不会复制到 dist。

已部署版本：`3b2e212e-d083-4fa3-986d-36e26ed1b691`。21 项单元测试、公开图片真实 MediaPipe 推理、两世界手势渲染、摄像头替身生命周期和移动端布局检查通过。线上 7 项验收全部通过，含 GLM-5.3-Flash 真实网关调用、WSS 会话隔离、模型 SHA-256、WASM MIME 和识别 Worker 缓存策略。未进行真人摄像头动作试用；实际光照、遮挡与手感仍需现场验证。截图：`artifacts/cloudflare-ocean-gestures.png`，验收记录：`artifacts/gesture-verification.json`、`artifacts/gesture-lab.txt`、`artifacts/cloudflare-live.json`。

## 2026-10-09 V.04：单手控制、黑底星群与 12 地点

本版取代前一节的海洋蓝和双手交互。按照用户提供的 `DESIGN (3).md` 重构界面：纯黑、Inter 轻字重、紫色主按钮、琥珀标签、多色三角粒子地球；共鸣控制收进原生对话框。原有两世界保留，新增 10 个独立地标模型，详见 [LANDMARKS.md](LANDMARKS.md)。

前端、本地 API、Worker `/api/locations`、`/api/health`、AI schema/prompt 和本地推荐共享 12 地点目录。AI 返回首选后，Worker 补足完整目录；模型仍为 `@cf/zai-org/glm-5.3-flash`，Gateway ID 仍为 `mindscape-demo`。

MediaPipe `numHands: 1`。张掌/握拳移动镜头，拇指食指捏合后开合缩放；四指关键点补充手背张掌识别。移除双手缩放和局部掌心扰动。画面只在浏览器处理，无新增摄像头后端。指针接管后，需要手离开画面再重新进入。

开发验证：25 项单元测试、6 项本地 Worker 集成检查；12/12 模型实际 WebGL 渲染、390/768px 窄视口布局、正式模型单手检测与张掌移动模式、组件的暂停/卸载/拒绝权限分支。公开图片推理约 19–28ms；未进行真人连续手势体验。测试页不打包进生产站点。

V.04 已部署版本：`03d81829-624f-4099-a4d0-748a1172372c`。线上 8 项检查全部通过：安全会话、WSS 隔离、设备 HTTP 输入、信号超时、真实 GLM 推荐、全部 12 个模型及字体、单手模型与 WASM、通过 AI Gateway 选择新增埃菲尔铁塔。验收输出见 `artifacts/cloudflare-live.json`；前端截图见 `artifacts/cloudflare-v4-home.png`；其余本地证据见 `artifacts/v4-verification.json`。

## 2026-10-09 V.04.1：真实录屏回归修复

基于用户提供的 14.6 秒录像，修复两指已经张开时不能直接缩放、握拳类别置信度波动引起的控制间断，并保持摄像头画面原比例。指间距离计算纳入 MediaPipe 估算深度；页面说明同步更新。

29 项单元测试通过。15Hz / 10Hz 重放的稳定手型区间与缩放方向通过；真实组件视频流产生 153 次镜头控制更新，卸载后轨道停止。5Hz 压力测试有两次短暂丢手，0.4s 后恢复，未算作全程通过。详见 [GESTURE-RECORDING-TEST.md](GESTURE-RECORDING-TEST.md)。样本、关键点、测试页和报告均未打包或上传。

最终部署版本：`11e8f2d9-d6e7-432a-8f1c-aff77fd21ef7`。页面标记 `V.04.1`。本次只调整前端交互，后端绑定与 GLM-5.3-Flash / AI Gateway 配置延续 V.04。线上核对记录保存在 `artifacts/recording-test/deployment.json`，包括首页与脚本 SHA-256 比对和 Worker 健康检查；本次未重新调用付费 AI 推理。

## 2026-10-09 V.04.2：捏住后连续缩放

已部署版本 `6e965e3a-df74-46d0-92c6-1c79c1847c6b`，页面标记 `V.04.2`。捏合锁定中点，上下偏移控制持续缩放速度；保持位置持续运动，回中点或松开停止，再次捏合重设中点。张掌/握拳移动镜头保留。预览增加停止带与方向/速度提示；丢手、暂停、页面隐藏和画面冻结都有停止保护。

32 项单元测试通过，10/15/30Hz 速度一致性通过；正式 MediaPipe 组件链路完成放大/缩小各 10 秒、中点、松开、重设起点、暂停恢复、冻结视频和卸载验收。真实录像帧加合成位移的测试边界见 [GESTURE-RATE-ZOOM.md](GESTURE-RATE-ZOOM.md)。

线上首页、主脚本、镜头渲染脚本 SHA-256 均与本地构建一致；后端健康检查返回 12 地点和既有 `@cf/zai-org/glm-5.3-flash` / `mindscape-demo` Gateway 配置。本次未重新调用付费 AI。Chrome 已确认新版本、操作说明及场景入口。私人录屏、关键点、诊断页和验收报告未进入发布包。证据：`artifacts/rate-zoom/deployment.json`、`summary.json`、`live-help.png`。

## 2026-10-10 V.05.0：点云光影与视觉调节

已部署版本 `e33bb986-82c8-40d0-9cb5-b9fdf60970e7`，页面标记 `V.05.0`。新增可逆连续粒子流场、稀疏亮点反馈、Bloom 和视觉调节面板；提供清晰 / 流光 / 梦境预设，以及原始点云 / 粒子流动 / 完整光影对照。当前 12 个模型仍使用程序化点云资产，效果边界与实现见 [VISUAL-STYLE.md](VISUAL-STYLE.md)。

36 项单元测试、12 个地点实际 WebGL 绘制、23 项视觉浏览器检查通过，包括反馈清理、聚散恢复、帧率一致性与普通颜色缓冲降级。正式界面的预设、对照切换和 390px 布局已在本地浏览器验证。生产构建未包含开发测试页面、私人录屏和本机报告。

线上首页、主脚本与渲染脚本 SHA-256 均与最终本地构建一致；健康检查确认 12 个地点、Cloudflare Workers 后端和既有 GLM-5.3-Flash / AI Gateway 配置。本次未重新调用付费 AI。验证记录位于本机 `artifacts/visual-style/deployment.json`、`verification.txt`、`metrics.json` 和 `comparison.png`。
