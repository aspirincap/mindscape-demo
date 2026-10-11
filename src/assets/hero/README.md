# 首页背景素材

四张图片由内置 imagegen 生成，用户于 2026-10-11 选择全部用于渐变轮播。生成构图保留左下暗色文字区，主景偏右。原始 PNG 及完整提示词保存在本机 `artifacts/hero-options/`，不作为线上资源。

- `01-fuji-clouds`：云海富士
- `02-particle-landscape`：流光地貌
- `03-ocean-sanctuary`：深蓝海境
- `04-canyon-dawn`：峡谷晨光

线上素材为 WebP（cwebp quality 84 / method 6），宽度 1672；`-960` 为小尺寸备选。四张完整尺寸合计约 414 KiB，四张小尺寸合计约 154 KiB，由 img srcset 按视口与像素密度选择。Vite 导入生成内容哈希 URL，避免更新后的旧缓存。
