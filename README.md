# Mindscape · 意境

12 个世界的交互式点云 demo：粒子地球、心意推荐、生理信号驱动的聚散、MediaPipe 单手镜头控制。按用户提供的 `DESIGN (3).md` 重构为纯黑背景、大字号轻字重、紫色主按钮和多色三角粒子地球，常驻数据侧栏改为按需打开的共鸣面板。

[线上体验](https://mindscape-demo.aspirincap.workers.dev/) · [部署与后端说明](CLOUDFLARE.md) · [地标资产与来源](LANDMARKS.md)

## 本地运行

Node.js 20.19+ 或 22.12+：

```sh
npm install
npm run dev
```

访问 <http://127.0.0.1:5173/>。前端、API 与 WebSocket 使用同一回环地址。生产构建：`npm run build`；本地生产预览：`npm start`。可通过 `PORT=5174` 改端口。

## 体验流程

1. **连接**：模拟器默认就绪，无需设备。右上角「调节共鸣」可打开模拟器或接入设备。
2. **心意**：文字或浏览器语音输入。云端通过 AI Gateway 调用 `@cf/zai-org/glm-5.3-flash`；失败或超额时明确回退本地规则。
3. **探索**：旋转地球，或在 12 个地点目录中搜索地点、国家、风景。推荐不自动进入场景。
4. **抵达**：确认目的地后飞入。支持取消及 Esc 返回。
5. **共鸣**：放松度改变点云聚散，专注度影响视野和明亮度，心率影响轻微脉动。可随时返回地球更换地点。

保留帕劳水下遗迹和屋久岛森林，新增长城、富士山、埃菲尔铁塔、罗马斗兽场、吉萨金字塔、泰姬陵、马丘比丘、大峡谷、悉尼歌剧院、伊瓜苏瀑布。每处均有独立生成的三维几何和可下载的 binary/PLY 文件。**这些是地标主题创作，并非实地扫描或摄影重建 3DGS。**

共鸣面板中可使用「紧绷」「舒缓」「深度平静」、四项滑杆、10 秒基线校准和 60 秒演示。60 秒演示依次经历破碎、恢复、安定。低质量或失联信号保持上次有效视觉状态。

鼠标拖动控制视角、滚轮缩放；`F` 沉浸、`Esc` 退出、`Space` 暂停。手机会降低点数；支持减少动态效果偏好。环境音为本地 Web Audio 合成。语音依赖浏览器 SpeechRecognition，可能需要网络，不属于 AI Gateway 模型调用。

## 单手控制

仅在最终场景中点「开启手势」才申请摄像头权限。

- **张掌或握拳并移动手**：水平移动改变观察角度，上下移动改变镜头高度。
- **拇指食指捏住后上下移动**：上移持续放大，下移持续缩小；手保持在偏移位置就会继续缩放，离中点越远速度越快。回到中点暂停，松开立即停止，再次捏合重新设定中点。其余手指自然舒展，避免完整握拳。
- 只识别一只手，第二只手不参与控制；不再有双手缩放或掌心局部扰动。
- 四指伸展关键点可补充模型未分类的手背张掌；模式进入有 150ms 驻留，松开立即退出缩放；捏合使用不同的进入/退出阈值。平移平滑并限幅；缩放采用渲染时钟积分、中点停止区和镜头边界，推理频率不决定缩放速度。丢手、超过 250ms 没有新结果、暂停或隐藏页面时停止并重设起点。
- 鼠标、触摸、重置视角优先接管。手移出画面再放回可恢复手势。
- 关闭手势或离开场景会停止视频轨道并终止 Worker。暂停或隐藏页面暂停推理。

识别使用本站托管的 `@mediapipe/tasks-vision@1.1.0`、官方 Gesture Recognizer float16 v1，`numHands: 1`。独立 Web Worker + OffscreenCanvas，优先 GPU、失败回退 CPU。65ms 起步的推理间隔按耗时自适应，最多一帧在途，丢弃过期结果。摄像头画面和关键点不上传、不保存，不经过 AI Gateway。首次开启约需下载 21MB 模型、WASM 与 SDK。HTTPS 或 localhost 可用；权限拒绝、设备占用等有错误提示，仍可用鼠标。

## 数据与接口

| 入参 | 范围 | 作用 |
| --- | --- | --- |
| `attention` | 0–1 | 镜头靠近、点云明亮度 |
| `relaxation` | 0–1 | 世界聚散、色彩和音频 |
| `HR` | 35–220 BPM | 世界微脉动 |
| `signalQuality` | 0–1 | 低于 0.4 保持上次状态 |

约 1.15 秒指数平滑；10 秒个人基线只采集有效信号。此 demo 不作健康评估，也不假装连接了真实 EEG 设备。BLE/串口/厂商 SDK 采集驱动需另外提供。

本地设备输入：

```sh
curl http://127.0.0.1:5173/api/frame \
  -H 'Content-Type: application/json' \
  -d '{"attention":0.58,"relaxation":0.76,"HR":72,"signalQuality":0.98}'
```

WebSocket `/ws` 接收 `{ "type":"sensor", "frame":{...} }`，以 25Hz 广播。2.5 秒未收到设备数据后标记失联。云端使用隔离会话，需在共鸣面板的「设备接入」复制配对配置，将 24 小时有效的 token 放入 Authorization 请求头。详细协议见 [CLOUDFLARE.md](CLOUDFLARE.md)。

- `GET /api/health`：后端、传感器和模型状态。
- `GET /api/locations`：全部 12 个目的地。
- `POST /api/route`：`{text, frame}`；返回 `world`、`reason`、`mode` 及包含 12 个唯一目的地的 `recommendedWorlds`。AI 只选择并解释首选，其他地点由服务器补足；主题分是体验排序，不是模型置信度。请求不改变用户的最终选择。

AI 只接收心意文字和粗略放松状态，不接收心率、原始 EEG、摄像头或设备凭据。服务不可用时推荐和场景仍可本地运行。

## 资产和资源管理

`npm run assets` 以固定随机种子重建全部 12 个世界，并更新 `src/core/point-counts.mjs`。`public/worlds/manifest.json` 记录点数、字节数、格式和来源。

- `.bin`：每点 8 个 float32：`x y z r g b size motion`。
- `.ply`：binary little endian XYZ + RGB，可导入其他点云工具。
- 原有两世界由 `scripts/generate-worlds.mjs` 生成；10 个地标由 `scripts/generate-landmarks.mjs` 生成。
- 地球独立使用约 349KB 陆地粒子，进入场景后才按需请求该地点资产。切换渲染器时释放请求、动画、WebGL 上下文、几何和材质。
- 地球数据来自公共领域 [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)；来源见 `public/globe/SOURCE.md`。
- Inter 字体本地托管，SIL OFL 许可证见 `public/fonts/LICENSE.txt`；图标为 Phosphor Icons。

## 验证

```sh
npm test
npm run test:cloudflare
npm run build
```

开发服务上的浏览器验证页（不进入生产构建）：

- `/tests/world-gallery.html`：依次加载全部世界，检查真实 WebGL 渲染并显示缩略图。
- `/tests/gesture-lab.html`：正式 Worker/WASM/模型、空白帧与 Google 公开手部图片，验证最多一只手。
- `/tests/gesture-ui.html`：以公开图片生成测试视频流，验证真实组件开启、暂停、拒绝授权、关闭与卸载释放。
- `/tests/rate-zoom.html`：以本机录像中的真实手型加合成上下位移验证正式组件，持续放大/缩小各 10 秒、中点停止、松开、重设中点、暂停与冻结视频。详见 [连续缩放验收](GESTURE-RATE-ZOOM.md)。
- `/tests/responsive-lab.html`：同一应用在 390/768 像素 iframe 中的响应式布局。

32 项单元测试覆盖信号处理、12 个地点的有效性和独立资源、推荐契约、单手模式转换、捏合迟滞、中点停止、10/15/30Hz 速度一致性、过期输入停止、镜头边界与摄像头比例。旧 `browser.mjs` / `deployed-browser.mjs` 是双世界版本的历史脚本；本版以以上检查与实际浏览器验收为准。

真实录屏诊断页 `/tests/recording-replay.html` 可按 15/10/5Hz 将本机视频送入正式 Worker。私人视频、旧控制器快照与逐帧数据保存在 gitignored `artifacts/recording-test/`，不打包、不上传。`scripts/verify-gesture-recording.mjs` 仅验证保存的 V.04.1 历史指令，不重新运行当前控制器；历史结果见 [真实录屏回归](GESTURE-RECORDING-TEST.md)。当前录像未包含持续捏住后上下控制速度的动作，新交互使用真实手型加合成位移测试，不等同于真人手感验收。
