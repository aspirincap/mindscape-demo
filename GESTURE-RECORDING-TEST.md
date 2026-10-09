# V.04.1 真实手势录屏回归 · 2026-10-09

> 历史验收记录。V.04.2 已改成捏住后上下移动控制连续缩放速度；以下开合方向验证仅适用于保存的 V.04.1 数据。当前交互和验证见 [GESTURE-RATE-ZOOM.md](GESTURE-RATE-ZOOM.md)。

用户提供的 14.60163 秒、1280×720、30fps 本地录像。测试不上传录像或关键点；样本和逐帧数据保留在被 Git 忽略的 `artifacts/recording-test/`。生产构建仅包含正式应用和模型资源。

## 发现与修复

1. 旧控制器只接受先捏紧再张开的顺序：录屏第一次两指张开没有进入缩放。新增食指伸展、其余三指收起、拇指外展的几何判断，允许直接从两指张开进入。15Hz 对照中，首次缩放从 7.1333s 提前至 6.0667s。
2. 录屏末尾握拳的模型类别置信度在阈值附近波动，导致短暂停止移动。四指蜷曲的关键点关系补充判断，稳定手型区间不再断续。
3. 原采集固定拉伸为 640×480，16:9 视频会变形。改为在 640×480 预算内按原比例缩小，该录像实际输入为 640×360，预览同步适配比例。拇指/食指距离及手掌宽度纳入 z 轴深度，避免仅以二维投影宽度计算时放大手掌转动影响。[MediaPipe 坐标定义](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js#handle_and_display_results)说明 z 与归一化 x 约同尺度；这里仍为模型估算深度，并非实际深度传感器。

单手限制、鼠标接管、丢手重设锚点、过期帧丢弃、镜头边界均保留。AI Gateway、后端协议和模型未修改。

## 验证结果

| 采样频率 | 检出手部 / 总采样 | 旧版首次缩放 | 修复后首次缩放 | 结果 |
| --- | --- | --- | --- | --- |
| 15Hz | 219 / 219 | 7.13s | 6.07s | 稳定手型区间和开合方向通过 |
| 10Hz | 146 / 146 | 7.00s | 6.00s | 稳定手型区间和开合方向通过 |
| 5Hz | 71 / 73 | 8.20s | 6.20s | 降级：两次短暂丢手 |

5Hz 在 4.8s、10.6s 没有检测到手，均在 0.4s 后重新进入对应控制模式。丢失、重新检测和首次重设锚点三帧的镜头输入均为零，没有沿用旧锚点跳变。这一档未达到全程连续要求，不计入完整通过。

检出率仅表示该视频中的手部被找到，不代表通用手势分类准确率。稳定手型时间区间由观看录屏确认；过渡帧不当作固定模式真值。单段录像不能覆盖其他光照、遮挡、手型与设备。

除逐帧重放外，使用本机视频生成 640×360、24fps 的摄像头替身，经过未修改的正式 `GestureControls`、真实 Worker 和 `WorldRenderer` 实时运行：

- 收到 153 次控制更新，约 6.13s 进入首次缩放。
- 选定的张掌/握拳移动和两指缩放稳定区间均正确；移动模式没有缩放输出，缩放模式没有平移输出。
- 浏览器控制台无错误，卸载组件后视频轨道状态为 `ended`。
- 29 项单元测试通过；生产构建通过，检查确认私人视频及测试页未进入 dist。

## 本机证据与复测

- `artifacts/recording-test/report.html`、`report.png`：可视化报告。
- `artifacts/recording-test/verification.json`：无逐帧关键点的汇总。
- `artifacts/recording-test/fixed-{15,10,5}hz.json`：本机逐帧结果。
- `artifacts/recording-test/component-realtime.json`：实时组件的镜头指令。
- 开发页 `/tests/recording-replay.html`：正式模型逐帧诊断，需要本机样本及冻结的旧控制器文件；当前控制器已变更，不能重现下表历史结果。
- 开发页 `/tests/recording-component.html`：真实视频流经过正式组件，不请求硬件摄像头权限。

```sh
npm test
node scripts/verify-gesture-recording.mjs artifacts/recording-test/fixed-15hz.json artifacts/recording-test/fixed-10hz.json
```

同一严格验证命令对 5Hz 结果会在丢手区间失败，这是保留的压力测试限制。
