# Cloudflare 部署与 EEG v2 协议

站点：https://mindscape-demo.aspirincap.workers.dev/ 。当前产品名为「在野 · Go Wild」，UI 为 V.10.0；部署版本与本轮验收状态见 [HANDOFF.md](HANDOFF.md)。以下协议完整替换旧设备输入格式，不提供兼容分支。

## 组成与发布

- Worker `mindscape-demo` 同时提供静态资源、推荐和 EEG 会话 API；`TERRAIN` 绑定私有 R2 桶 `mindscape-terrain`。
- `SensorSession` 按不可猜测 token 隔离会话，仅在内存保存去重序号、时效与连接所有权，不保存 EEG 历史，也不向新浏览器重放旧数据。v2 使用普通 WebSocket 和到期检查定时器，连接存续期间不使用休眠模式；这是显式的资源取舍。
- `AiBudget` 持久化限额计数：每 IP 每分钟 6 次、全站每分钟 20 次、每天 200 次尝试。AI 模型 `@cf/zai-org/glm-5.3-flash`，Gateway `mindscape-demo`。只在用户主动提交 `{text}` 时调用，不传脑电/HR/摄像头或设备凭据；失败明确返回本地规则。
- AI binding 自带账号身份；网关关闭内容日志和缓存，Worker 默认关闭持久日志。`/api/health` 的模型信息是配置，不证明推理成功。

```sh
npm ci
npm test
npm run test:eeg
npm run test:eeg:integration
npm run test:cloudflare
npx wrangler whoami
npm run deploy
```

`deploy` 使用 `vite build --mode cloudflare`，只包含正式 `index.html`；`npm run build` 才包含本地监视器 `eeg.html`。不再依赖 ignored artifacts 内的临时构建配置。数据 pack 未改变时无需上传 R2；更改地形仍须先上传新版本 pack 再发布 manifest。

本地 `npm run dev` 也使用会话配对。Cloudflare 本地页面可用 `npm run dev:cloudflare`；本地 R2 需要另外装入 pack。纯 API 隔离测试使用不绑定真实 AI 的 Miniflare。

## 配对与 WebSocket

1. 在野 → 调节共鸣 → 设备接入 → 复制设备接入配置。
2. `npm run eeg` → 本地 EEG Studio → 连接在野 → 粘贴 → 开始联动。
3. 体验页确认读数后点击“开始脑电氛围”，按需校准。

配置包含 `protocol: mindscape.eeg.v2`、`http`、`websocket`、`authorization`、`expiresAt`。凭据是 24 小时会话令牌，仅保存在本地发送服务内存；不放入 URL、导出、日志或仓库。浏览器使用 HttpOnly / SameSite=Strict Cookie，线上另带 Secure。过期、发送连接被替换或协议不符时停止重试，要求用户重新配对。

设备连接 `/ws?role=device`，握手带 `Authorization: Bearer …`；浏览器连接 `/ws` 为只读 viewer。两端都发送 `{"type":"ping","protocol":"mindscape.eeg.v2","id":1}`。服务回复 `pong` 和 `serverTime`；设备 pong 还包含 `lease`。

设备按真实观测发送完整信封（示例是结构说明，不应循环重放）：

```json
{
  "type": "sensor",
  "protocol": "mindscape.eeg.v2",
  "streamId": "00000000-0000-4000-a000-000000000001",
  "seq": 1,
  "capturedAt": 1791638488926,
  "source": "thinkgear",
  "lease": "本连接最近一次 pong 返回的租约",
  "frame": {
    "attention": 0.70, "relaxation": 0.23, "HR": null, "poorSignal": 0,
    "ageMs": {"attention": 0, "relaxation": 0, "poorSignal": 0},
    "sampleIds": {"attention": 1, "relaxation": 1, "poorSignal": 1}
  },
  "capabilities": {"heartRate": false, "raw": false}
}
```

服务独立计算 `valid` 和 `signalQuality`，不信任发送者标记。接收后仅广播 `eeg-frame`，带标准化信封及服务端 `receivedAt`。不会把心跳变成样本，不按绘制帧率重复广播。串口状态以独立的 `bridge-status` 传递。

- eSense 1–100 归一化为 .01–1；0、缺失、越界视为无效。HR 可 null；有效 HR 需要能力标志、独立年龄与样本号。
- poorSignal 保留 0–255 原值；应用当前仅接受 0 且新鲜的接触状态。signalQuality 是接受门控，不是准确率。
- 同一 stream 的 seq 必须递增，字段 sampleId 不倒退；相同 sampleId 的值不能变、更不能用 age=0 刷新有效期。同值但新 sampleId 是新观测。
- 串口重开生成新 stream UUID；网络重连保留原 UUID。新发送连接通过 ping 接管后关闭旧发送者，旧连接迟到包无权覆盖。
- 约 1 Hz 指标按实际事件发送，不补成高频。断网只保留最新候选，字段超过 2.5 秒不采用；心跳不延长读数时效。重连按 1/2/4/8/15 秒上限加抖动退避。
- 每会话最多 6 个连接，每连接每秒最多 20 条消息；正文最大 16 KiB。跨来源拒绝，Node 本地另检查 Host。

## 时效与时钟

不比较 Mac 与云端的绝对采集时钟。桥接用本地单调时间算字段年龄。服务端给设备发短租约，用“租约发出至数据返回”的时间作为保守链路上界，加到字段年龄；租约超过 2.5 秒即拒绝。浏览器用自己的 ping 发出时刻、到达时刻与服务端 pong 时间建立保守映射，继续累加服务端至浏览器的时间上界。未完成时钟握手、往返过慢或探测超过 5 秒未更新时，不采用设备读数。

该方法宁可提前判为过期，不因两台机器时钟偏差把旧包当新包。暂停/隐藏与时效各自独立；网络恢复不重放缓存，新的有效读数恢复稳定后平滑接续。

## HTTP 排错路径

携带相同 Authorization，以 `POST /api/eeg/lease` 发送 `{"protocol":"mindscape.eeg.v2"}`，取得 `connectionId` 与 `lease`。在 2.5 秒内向 `/api/frame` POST 同样的完整 v2 信封，额外附这两个字段。HTTP claim 会接管发送权并关闭旧 WSS 发送者，适合独立排错，不与正常桥接混用。

未配对 401，跨域 403，格式/协议错误 400，重复/乱序/过期租约/旧连接 409。WS 错误带 `code`；`PROTOCOL_MISMATCH` 提示更新客户端。旧四字段 JSON、缺版本和未知版本均拒绝。

## 验证与回滚

```sh
npm run test:cloudflare
DEPLOY_URL=https://mindscape-demo.aspirincap.workers.dev TEST_HTTPS_PROXY=http://127.0.0.1:7897 npm run test:cloudflare
EEG_TEST_URL=https://mindscape-demo.aspirincap.workers.dev EEG_TEST_PROXY=http://127.0.0.1:7897 npm run test:eeg:browser
```

代理参数按本机情况选用。测试可能消耗推荐次数；只有需要验证模型时再加 `REQUIRE_AI=1 EXPECTED_AI_MODEL=@cf/zai-org/glm-5.3-flash`。不要用下面历史记录中的旧双世界浏览器脚本验收当前设备协议。

发布前停止设备发送；Worker 与前端同一发布，更新本地桥接后刷新页面、重新配对。回滚先停止联动，再一起恢复相匹配的 Worker / 前端 / 本地桥接；V.06.1 没有完整 EEG 接入，回滚后保持脑电氛围关闭。几何 R2 版本见 GEOSPATIAL.md，本轮不变。

## 历史发布记录（非当前协议）

### 2026-10-09 海洋蓝与手势版本

前端采用海洋蓝配色；最终双世界新增可选 MediaPipe 手势控制。静态资源增加 `public/mediapipe/`：固定 SDK 1.1.0、SIMD/非 SIMD WASM、官方 Gesture Recognizer float16 v1、独立识别 Worker。最大单文件约 12 MB，模型约 8 MB。模型和 SDK 按版本长期缓存，识别 Worker 每次校验更新。摄像头和手部数据在浏览器处理，后端/API/Gateway 无新增视频接收接口。

模型 SHA-256：`97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`。部署前确认 `npm run build` 的 dist 包含上述资源。开发测试页面位于 tests/，不会复制到 dist。

已部署版本：`3b2e212e-d083-4fa3-986d-36e26ed1b691`。21 项单元测试、公开图片真实 MediaPipe 推理、两世界手势渲染、摄像头替身生命周期和移动端布局检查通过。线上 7 项验收全部通过，含 GLM-5.3-Flash 真实网关调用、WSS 会话隔离、模型 SHA-256、WASM MIME 和识别 Worker 缓存策略。未进行真人摄像头动作试用；实际光照、遮挡与手感仍需现场验证。截图：`artifacts/cloudflare-ocean-gestures.png`，验收记录：`artifacts/gesture-verification.json`、`artifacts/gesture-lab.txt`、`artifacts/cloudflare-live.json`。

### 2026-10-09 V.04：单手控制、黑底星群与 12 地点

本版取代前一节的海洋蓝和双手交互。按照用户提供的 `DESIGN (3).md` 重构界面：纯黑、Inter 轻字重、紫色主按钮、琥珀标签、多色三角粒子地球；共鸣控制收进原生对话框。原有两世界保留，新增 10 个独立地标模型，详见 [LANDMARKS.md](LANDMARKS.md)。

前端、本地 API、Worker `/api/locations`、`/api/health`、AI schema/prompt 和本地推荐共享 12 地点目录。AI 返回首选后，Worker 补足完整目录；模型仍为 `@cf/zai-org/glm-5.3-flash`，Gateway ID 仍为 `mindscape-demo`。

MediaPipe `numHands: 1`。张掌/握拳移动镜头，拇指食指捏合后开合缩放；四指关键点补充手背张掌识别。移除双手缩放和局部掌心扰动。画面只在浏览器处理，无新增摄像头后端。指针接管后，需要手离开画面再重新进入。

开发验证：25 项单元测试、6 项本地 Worker 集成检查；12/12 模型实际 WebGL 渲染、390/768px 窄视口布局、正式模型单手检测与张掌移动模式、组件的暂停/卸载/拒绝权限分支。公开图片推理约 19–28ms；未进行真人连续手势体验。测试页不打包进生产站点。

V.04 已部署版本：`03d81829-624f-4099-a4d0-748a1172372c`。线上 8 项检查全部通过：安全会话、WSS 隔离、设备 HTTP 输入、信号超时、真实 GLM 推荐、全部 12 个模型及字体、单手模型与 WASM、通过 AI Gateway 选择新增埃菲尔铁塔。验收输出见 `artifacts/cloudflare-live.json`；前端截图见 `artifacts/cloudflare-v4-home.png`；其余本地证据见 `artifacts/v4-verification.json`。

### 2026-10-09 V.04.1：真实录屏回归修复

基于用户提供的 14.6 秒录像，修复两指已经张开时不能直接缩放、握拳类别置信度波动引起的控制间断，并保持摄像头画面原比例。指间距离计算纳入 MediaPipe 估算深度；页面说明同步更新。

29 项单元测试通过。15Hz / 10Hz 重放的稳定手型区间与缩放方向通过；真实组件视频流产生 153 次镜头控制更新，卸载后轨道停止。5Hz 压力测试有两次短暂丢手，0.4s 后恢复，未算作全程通过。详见 [GESTURE-RECORDING-TEST.md](GESTURE-RECORDING-TEST.md)。样本、关键点、测试页和报告均未打包或上传。

最终部署版本：`11e8f2d9-d6e7-432a-8f1c-aff77fd21ef7`。页面标记 `V.04.1`。本次只调整前端交互，后端绑定与 GLM-5.3-Flash / AI Gateway 配置延续 V.04。线上核对记录保存在 `artifacts/recording-test/deployment.json`，包括首页与脚本 SHA-256 比对和 Worker 健康检查；本次未重新调用付费 AI 推理。

### 2026-10-09 V.04.2：捏住后连续缩放

已部署版本 `6e965e3a-df74-46d0-92c6-1c79c1847c6b`，页面标记 `V.04.2`。捏合锁定中点，上下偏移控制持续缩放速度；保持位置持续运动，回中点或松开停止，再次捏合重设中点。张掌/握拳移动镜头保留。预览增加停止带与方向/速度提示；丢手、暂停、页面隐藏和画面冻结都有停止保护。

32 项单元测试通过，10/15/30Hz 速度一致性通过；正式 MediaPipe 组件链路完成放大/缩小各 10 秒、中点、松开、重设起点、暂停恢复、冻结视频和卸载验收。真实录像帧加合成位移的测试边界见 [GESTURE-RATE-ZOOM.md](GESTURE-RATE-ZOOM.md)。

线上首页、主脚本、镜头渲染脚本 SHA-256 均与本地构建一致；后端健康检查返回 12 地点和既有 `@cf/zai-org/glm-5.3-flash` / `mindscape-demo` Gateway 配置。本次未重新调用付费 AI。Chrome 已确认新版本、操作说明及场景入口。私人录屏、关键点、诊断页和验收报告未进入发布包。证据：`artifacts/rate-zoom/deployment.json`、`summary.json`、`live-help.png`。

### 2026-10-10 V.05.0：点云光影与视觉调节

已部署版本 `e33bb986-82c8-40d0-9cb5-b9fdf60970e7`，页面标记 `V.05.0`。新增可逆连续粒子流场、稀疏亮点反馈、Bloom 和视觉调节面板；提供清晰 / 流光 / 梦境预设，以及原始点云 / 粒子流动 / 完整光影对照。当前 12 个模型仍使用程序化点云资产，效果边界与实现见 [VISUAL-STYLE.md](VISUAL-STYLE.md)。

36 项单元测试、12 个地点实际 WebGL 绘制、23 项视觉浏览器检查通过，包括反馈清理、聚散恢复、帧率一致性与普通颜色缓冲降级。正式界面的预设、对照切换和 390px 布局已在本地浏览器验证。生产构建未包含开发测试页面、私人录屏和本机报告。

线上首页、主脚本与渲染脚本 SHA-256 均与最终本地构建一致；健康检查确认 12 个地点、Cloudflare Workers 后端和既有 GLM-5.3-Flash / AI Gateway 配置。本次未重新调用付费 AI。验证记录位于本机 `artifacts/visual-style/deployment.json`、`verification.txt`、`metrics.json` 和 `comparison.png`。


### 2026-10-11 V.10：22 场景目录与 R2 精选模型

Worker 版本 `fbdab2e0-7397-4bdb-ac34-782941ed8825`。保留富士山 / 大峡谷，加入 20 个用户精选图像重建点云与 48–72 秒微光导览。新 `/scene-data/*` 路由复用 TERRAIN 绑定和 mindscape-terrain 桶，R2 对象采用内容哈希不可变命名，按清单限制路径和校验大小。旧程序化世界文件不再部署。导入、上传及地点清单见 [SCENE-CATALOG.md](SCENE-CATALOG.md)。

线上验证：22 地点契约、20 个模型大小 / ETag、完整二进制校验、旧资产 404、单手模型 / WASM、EEG v2 会话隔离和心跳时效均通过。GLM-5.3-Flash 经原 AI Gateway 成功选择新雨林与极光场景。原 EEG / AI / 手势连接方式不变。验收日志在 artifacts/cloudflare-live.json，完整交接见 HANDOFF.md 第 15 节。
