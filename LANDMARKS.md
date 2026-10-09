# 地标点云目录

V.04 新增 10 个全球地标，原有帕劳、屋久岛保留，共 12 个世界。坐标定位主题入口。所有几何由本项目代码独立生成，不使用外部摄影点云，不声称精确比例或实地重建。每个模型均包含三维深度、颜色和运动属性。

| 地点 | 模型特征 | 点数 | 地点资料 |
| --- | --- | ---: | --- |
| 长城 · 中国 | 起伏山脊、城墙、垛口与四座敌楼 | 105680 | [UNESCO](https://whc.unesco.org/en/list/438) |
| 富士山 · 日本 | 火山曲面、雪顶、湖面与鸟居 | 127555 | [UNESCO](https://whc.unesco.org/en/list/1418) |
| 埃菲尔铁塔 · 法国 | 四条弧形支腿、交叉桁架、平台、天线 | 111640 | [铁塔官网](https://www.toureiffel.paris/en/the-monument/history) |
| 罗马斗兽场 · 意大利 | 三层椭圆拱廊、内侧阶梯、中央场地 | 186600 | [UNESCO 罗马历史中心](https://whc.unesco.org/en/list/91) |
| 吉萨金字塔 · 埃及 | 三座不同尺度金字塔与沙丘 | 122000 | [UNESCO](https://whc.unesco.org/en/list/86) |
| 泰姬陵 · 印度 | 主穹顶、四座宣礼塔、台基和水池 | 119164 | [UNESCO](https://whc.unesco.org/en/list/252) |
| 马丘比丘 · 秘鲁 | 梯田、石屋、后方高山 | 119002 | [UNESCO](https://whc.unesco.org/en/list/274) |
| 大峡谷 · 美国 | 分层岩壁、蜿蜒河谷 | 148000 | [UNESCO](https://whc.unesco.org/en/list/75) |
| 悉尼歌剧院 · 澳大利亚 | 两组重叠的肋纹帆壳、台阶和海港 | 139950 | [UNESCO](https://whc.unesco.org/en/list/166/) |
| 伊瓜苏瀑布 · 阿根廷 / 巴西 | 马蹄形崖壁、连续水幕和水雾 | 121000 | [UNESCO](https://whc.unesco.org/en/list/303) |

原有模型：帕劳水下遗迹 195160 点、屋久岛森林 280050 点。计数由生成器和 manifest 对照测试，不依赖 UI 中的占位数字。所有 binary/PLY 位于 `public/worlds/`，按地点独立加载。

视觉按用户提供的 `DESIGN (3).md`：纯黑、白色 400 字重标题、200 字重正文、Inter、本地字体、紫色主按钮、琥珀色小标签。粒子地球采用多色三角轮廓；场景保留柔和点精灵，以呈现地标几何与聚散。
