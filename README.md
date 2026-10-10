# Mindscape · 意境

12 个世界的交互式点云 demo：粒子地球、心意推荐、真实 ThinkGear 脑电氛围反馈、MediaPipe 单手镜头控制。按用户提供的 `DESIGN (3).md` 重构为纯黑背景、大字号轻字重、紫色主按钮和多色三角粒子地球，常驻数据侧栏改为按需打开的共鸣面板。

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
5. **共鸣**：设备模式下，冥想与专注驱动限幅氛围，镜头始终由鼠标或单手控制；没有心率时不产生心率脉动。可随时返回地球更换地点。

保留帕劳水下遗迹和屋久岛森林，新增长城、富士山、埃菲尔铁塔、罗马斗兽场、吉萨金字塔、泰姬陵、马丘比丘、大峡谷、悉尼歌剧院、伊瓜苏瀑布。富士山火山口为实测点云，外围及大峡谷为真实高程构建的地形；其余 10 处为主题创作。均不是 3DGS，详见 [真实地理场景](GEOSPATIAL.md)。

模拟器保留手动滑杆与 60 秒演示。设备模式的 60 秒旅程仅提供呼吸引导，不替换真实数据。个人校准至少 30 秒、每项至少 25 个有效独立读数；最多等待 60 秒，暂停及隐藏页面不计时。

鼠标拖动控制视角、滚轮缩放；`F` 沉浸、`Esc` 退出、`Space` 暂停。手机会降低点数；支持减少动态效果偏好。环境音为本地 Web Audio 合成。语音依赖浏览器 SpeechRecognition，可能需要网络，不属于 AI Gateway 模型调用。

## 点云视觉

进入场景后打开「视觉调节」，可选 **清晰 / 流光 / 梦境** 三种预设，也可对照 **原始点云 / 粒子流动 / 完整光影**。支持粒子尺寸、聚散、亮度、Bloom、亮点余辉和流动参数；转动镜头时清除旧余辉，保持主体清楚。主题与真实地理场景共用面板。原始档不叠加脑电视觉偏移，手动预设始终保留。实现和验证见 [VISUAL-STYLE.md](VISUAL-STYLE.md)。

## 单手控制

仅在最终场景中点「开启手势」才申请摄像头权限。

- **张掌或握拳并移动手**：主题场景控制观察角度与高度；真实地理场景默认平移，也可选择环绕。
- **拇指食指捏住后上下移动**：上移持续放大，下移持续缩小；手保持在偏移位置就会继续缩放，离中点越远速度越快。回到中点暂停，松开立即停止，再次捏合重新设定中点。其余手指自然舒展，避免完整握拳。
- 只识别一只手，第二只手不参与控制；不再有双手缩放或掌心局部扰动。
- 四指伸展关键点可补充模型未分类的手背张掌；模式进入有 150ms 驻留，松开立即退出缩放；捏合使用不同的进入/退出阈值。平移平滑并限幅；缩放采用渲染时钟积分、中点停止区和镜头边界，推理频率不决定缩放速度。丢手、超过 250ms 没有新结果、暂停或隐藏页面时停止并重设起点。
- 鼠标、触摸、重置视角优先接管。手移出画面再放回可恢复手势。
- 关闭手势或离开场景会停止视频轨道并终止 Worker。暂停或隐藏页面暂停推理。

识别使用本站托管的 `@mediapipe/tasks-vision@1.1.0`、官方 Gesture Recognizer float16 v1，`numHands: 1`。独立 Web Worker + OffscreenCanvas，优先 GPU、失败回退 CPU。65ms 起步的推理间隔按耗时自适应，最多一帧在途，丢弃过期结果。摄像头画面和关键点不上传、不保存，不经过 AI Gateway。首次开启约需下载 21MB 模型、WASM 与 SDK。HTTPS 或 localhost 可用；权限拒绝、设备占用等有错误提示，仍可用鼠标。

## 真实脑电接入

1. 运行 `npm run eeg`，打开 <http://127.0.0.1:8765>，沿用设备当前 9600 baud / 8N1 设置。Python 是唯一串口读取者。
2. 在本地或线上 Mindscape 的「调节共鸣 → 设备接入」复制配对配置。
3. 在 EEG Studio「连接 Mindscape」粘贴配置并开始联动；Node 主动建立 WSS，线上页面无需访问 localhost。
4. 等待稳定读数，选择「开始脑电氛围」，按需校准。停止联动与释放串口是独立操作。

唯一网络协议为 `mindscape.eeg.v2`，不兼容旧格式。attention / meditation 的有效 1–100 分除以 100，零值与缺失为无效；poorSignal 非零或字段超过 2.5 秒未更新时冻结该控制量。HR 可缺失，显示“未接入”。界面相对分不加百分号，不把聚散称为脑电相干性。

每个字段独立 sampleId / ageMs；同值的新观测仍计为新样本，重复包、心跳和渲染帧不计。3 个有效新读数后采用温和映射；校准使用中位数/MAD、尺度下限、短中值、约 3 秒平滑及每秒 0.10 限幅。断网不重放历史，采集流更换清除基线，短暂网络重连保留基线；离线超过 10 秒需重新开启氛围。

主题场景采用克制聚散、亮度与光点变化；设备模式中的真实地形主体锁定测量位置，冥想调节辅助亮点/光晕，专注调节限幅亮度。原始点云不叠加脑电视觉变化，关闭氛围平滑回到手动设置。环境音由用户启用和控制音量。摄像头、RAW、8 频段、原始字节不上传。

本地和 Cloudflare 均使用同源 HttpOnly 会话 Cookie；设备以 Authorization 头配对，有效期 24 小时。协议、握手与排错见 [CLOUDFLARE.md](CLOUDFLARE.md)，监视器见 [EEG-MONITOR.md](EEG-MONITOR.md)，实现状态见 [HANDOFF.md](HANDOFF.md)。

- `GET /api/session`：建立或读取当前会话，返回协议和配对配置字段。
- `GET /api/health`：后端、设备时效与模型配置；不等同于推理成功。
- `GET /api/locations`：全部 12 个目的地。
- `POST /api/eeg/lease`：HTTP 排错发送前取得连接所有权与时效租约。
- `POST /api/frame`、`/ws?role=device`：统一 v2 设备信封；广播只有 `eeg-frame`。
- `POST /api/route`：只接收 `{text}`，返回目的地排序。AI Gateway 仅处理用户主动提交的文字，不接入实时脑电流。

## 资产和资源管理

富士山与大峡谷已升级为真实地理场景，包含分层点云、地图与地标跳转。数据来源、精度、复现及 R2 部署见 [GEOSPATIAL.md](GEOSPATIAL.md)。

`npm run assets` 以固定随机种子重建 12 份旧版主题资产（不会覆盖真实地理场景），并更新 `src/core/point-counts.mjs`。`public/worlds/manifest.json` 记录点数、字节数、格式和来源。

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
npm run test:eeg
npm run test:eeg:integration
npm run build
```

开发服务上的浏览器验证页（不进入生产构建）：

- `/tests/visual-lab.html`：三种显示层级的实际像素对照、反馈清除、聚散恢复及 GPU 资源生命周期检查。
- `/tests/world-gallery.html`：依次加载全部世界，检查真实 WebGL 渲染并显示缩略图。
- `/tests/gesture-lab.html`：正式 Worker/WASM/模型、空白帧与 Google 公开手部图片，验证最多一只手。
- `/tests/gesture-ui.html`：以公开图片生成测试视频流，验证真实组件开启、暂停、拒绝授权、关闭与卸载释放。
- `/tests/rate-zoom.html`：以本机录像中的真实手型加合成上下位移验证正式组件，持续放大/缩小各 10 秒、中点停止、松开、重设中点、暂停与冻结视频。详见 [连续缩放验收](GESTURE-RATE-ZOOM.md)。
- `/tests/responsive-lab.html`：同一应用在 390/768 像素 iframe 中的响应式布局。

自动测试覆盖信号处理、12 个地点的有效性和独立资源、推荐契约、单手模式转换、捏合迟滞、中点停止、10/15/30Hz 速度一致性、过期输入停止、镜头边界与摄像头比例，以及视觉参数范围、恢复与反馈衰减的一致性。`test:eeg:integration` 检查实际 Node 转发链路；`test:eeg:browser` 检查设备 UI 与三类场景。旧 `browser.mjs` / `deployed-browser.mjs` 为历史双世界脚本，不作为本版验收。

真实录屏诊断页 `/tests/recording-replay.html` 可按 15/10/5Hz 将本机视频送入正式 Worker。私人视频、旧控制器快照与逐帧数据保存在 gitignored `artifacts/recording-test/`，不打包、不上传。`scripts/verify-gesture-recording.mjs` 仅验证保存的 V.04.1 历史指令，不重新运行当前控制器；历史结果见 [真实录屏回归](GESTURE-RECORDING-TEST.md)。当前录像未包含持续捏住后上下控制速度的动作，新交互使用真实手型加合成位移测试，不等同于真人手感验收。

Cloudflare 发布使用 `npm run deploy`，内部执行 `build:cloudflare`，仅打包正式 Mindscape 入口。普通 `npm run build` 包含本地 EEG Studio。真实地形 pack 不进 Git，新 clone 需从 R2 取回或按 GEOSPATIAL.md 重建。
