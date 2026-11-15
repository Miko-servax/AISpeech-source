# 运行时优化与发布GLB对比

本轮不减面。原始FBX和门腔补丁保持原文件；新增发布副本、构建/校验脚本与按需渲染。历史基线见 performance-baseline.md。

## 资源与结构

| 指标 | FBX工作副本 | 发布GLB |
| --- | ---: | ---: |
| 原始资源字节 | 27,559,370（FBX+JSON） | 10,450,476 |
| gzip载荷字节 | 12,587,890 | 6,077,943 |
| 网格 | 490 | 265 |
| 三角面 | 704,399 | 704,399 |
| 顶点属性条目 | 2,113,149 | 486,891 |
| 透明网格 | 34 | 34 |

发布GLB采用完整属性完全相同的顶点索引化、静态不透明同材质合并及无损Meshopt编码，未量化位置或删除面。索引条目的减少不代表减面。保护229个节点：所有Door/Glass相关节点、透明件以及轮胎/轮毂/刹车；包括四块可运动主玻璃、固定三角玻璃、门皮、内饰与门腔腰板。29组合并结果保存sourceNodes与manifest映射。GLB仍为厘米坐标，运行时根节点缩放0.01；不改轨迹配置、旋转中心或玻璃透明度。

编码遵循 [EXT_meshopt_compression规范](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)：不使用有损filter，索引采用INDICES以保留顺序；构建时对每个bufferView进行逐字节压缩解压一致性检查。解码器随Three依赖打包，无外部CDN请求。

生成和验证：

```sh
npm run build:model
npm run test:model
npm run test:commands
node scripts/check-v8.mjs
npm run build
```

- `scripts/build-v8-glb.mjs` / `scripts/v8-release-lib.mjs`：读源文件和门腔补丁，输出发布副本。
- `public/models/v8-working.glb`、`.glb.gz`、`v8-working.manifest.json`：发布资源及源哈希/节点映射；应一同保存和更新。
- `scripts/test-v8-release.mjs`：验证源/补丁/GLB哈希、gzip内容、总面数、229个保护节点的位置/变换/透明属性、29组合并几何全部三角形、四窗各101个姿态及固定三角玻璃。
- `.cache/performance/v8-release-validation.json`：结果与本机Node解析耗时。本轮约19–29ms；旧FBX Node离线解析约589–675ms，环境数据仅作本地参考。

当前GLB路径在public中，服务器应使用协商压缩及重新验证缓存，不宜对未带版本的固定文件名永久immutable缓存。Vite开发/生产预览已通过 `scripts/serve-model-gzip.mjs` 协商发送预压缩gzip、Vary/ETag和正确Content-Encoding；实际部署时也需配置等价行为（例如Nginx gzip_static与适当Cache-Control），不能直接把.gz文件当普通GLB返回。缺少gzip配置时下载10.45MB，渲染/解码仍正常；本次6.08MB传输结果依赖该配置。

## 运行时更新路径

- 默认加载GLB；FBXLoader、门腔JSON与旧轨迹对照改为动态导入，只在显式FBX/旧轨迹路径使用。常规GLB页面不会再下载FBX或门腔JSON。
- `src/scene/render-loop.ts` 合并失效请求：相机change/start/end、阻尼未收敛、窗口target/current变化、选择高亮、循环播放、模型加载、视角切换、ResizeObserver、window resize、页面可见性恢复均能唤醒。动画和阻尼停下后停止RAF，不只跳过render。
- 每窗只在开度变更时更新变换，复用Quaternion/Vector3；静止窗不重复写store。静态点击命中代理使用独立layer，仅raycast访问，不重复绘制不可见玻璃。
- `src/scene/dialogue-expiry.ts` 独立于渲染计时：active/pending/batch到期仍清空；后台恢复先检查过期，再重置动画时钟，避免长时间后台造成跳变。dispose清理RAF、watch、计时器、事件、几何和材质。网格调试场景按需创建，节点共享几何只用于同一场景生命周期。
- 质量档：高清DPR上限2，均衡1.25，流畅1（流畅关闭MSAA）；自动在coarse pointer设备选择均衡，其余高清。灯光、透明度、门腔、面数和轨迹均一致。可以在“演示与调试”切换，切换会重新加载页面。未启用未经真机校准的自动帧率升降档。
- 测试验证同样1秒动画推进在30Hz和60Hz一致；额外检查空闲、阻尼收敛、失效合并、后台恢复、dispose，以及没有任何渲染帧时对话过期。

## 同视角同画质比较

原始数据：`.cache/performance/v8-browser-release-raw.json`；汇总：`.cache/performance/v8-runtime-comparison.json`。本地macOS IAB，生产预览端口4180，CSS画布900×652、DPR2、缓冲1800×1304，初始整体视角、四窗关闭、高清、相同光照。FBX对照使用本轮公共运行时，关闭点击代理绘制并共享材质，强制连续渲染；因此不是历史代码原封不动的基线，也不使用旧轨迹 `baseline=1`。

| 指标 | FBX+补丁、连续渲染 | GLB、按需渲染 |
| --- | ---: | ---: |
| 首次完整载荷传输（含每请求300字节） | 12,588,490字节 | 6,078,243字节 |
| 首次场景ready | 969.2ms | 174.9ms |
| 首次render提交 | 1008.0ms | 196.6ms |
| 缓存复测ready（2次） | 646.3 / 632.4ms | 101.4 / 103.0ms |
| 缓存复测首帧提交（2次） | 688.6 / 673.0ms | 120.9 / 123.6ms |
| 完整载荷请求后的解析阶段 | 548.2ms（含材质） | 23.7ms |
| 同视角静止draw calls | 527 | 302 |
| 提交三角面 | 890,788 | 890,788 |

模型原始字节降低62.1%，gzip载荷降低51.7%，draw calls降低42.7%。三角面相同，收益来自发布格式、索引化、静态批次及不再空转。首次运行在此仅指ResourceTiming确认完整载荷传输，不代表真实手机冷启动；本地网络与桌面GPU结果不能外推真机帧率。firstFrame是完成首次render调用的提交时间，不是GPU计时或呈现完成时间。预览响应中encoded/decodedBodySize已经确认gzip生效；两次缓存复测实际仅300字节重新验证，不混为冷加载。

按需模式在约29秒静止内保持1次模型绘制。拖动后阻尼累计更新到126帧并停止；单窗动画触发持续绘制，74%时反向后界面继续更新、旧记录标记替换。另一轮四窗同时开到100%后总帧数603并在结束后17秒没有新绘制，运动段601帧、RAF间隔P95约9ms（桌面高刷新环境，非真机FPS）。

视口检查：390×844时展开面板，画布高度从450变为332，ResizeObserver更新渲染并在过渡完成后停止；仍能看到车模。视口覆盖工具报告DPR1，此情况下高清和均衡都渲染390像素宽，不能据此声称移动画质提升帧率。恢复DPR2桌面环境，同一900×652画布的均衡缓冲为1125×815，高清为1800×1304，像素量降低60.9%；这只是像素工作量，不等于帧率提升比例。

## 重现和真机后续

启动 `npm run dev`，或 `npm run build` 后启动 `npm run preview`。固定同一设备和视角，访问：

- 发布高清：`/?perf=1&quality=high`
- FBX同轨迹对照：`/?perf=1&quality=high&asset=fbx&loop=continuous`
- 发布均衡：`/?perf=1&quality=balanced`
- 发布流畅：`/?perf=1&quality=low`
- 旧轨迹诊断：`/?baseline=1`，此模式不用于性能/新轨迹公平对比。

探针每秒更新DOM，但不会唤醒GPU；观察renderedFrames/lastFrameAgeMs判断空转是否停止。运动段看RAF间隔P95与CPU提交耗时，不能把按需空闲时间当掉帧。调试数据仅显示/保存本地，不上传。下一轮仍需真实手机相同画质下持续旋转、四窗运动/反向、滚动记录及3–5分钟热机测试，确认触控响应与温升收益。

补充：`dist`仍保存FBX/JSON按需对照资源，目录总大小不等于常规页面下载量；正常GLB页面只取GLB，旧资源仅在asset=fbx/baseline时加载。表中的体积均是模型加载链路，未把共享HTML/JS/CSS算入模型载荷。后续新增场景视觉状态或异步资源时，调用createV8返回的invalidate，或把该状态接入视觉watch；DOM诊断与聊天记录更新本身不应启动GPU循环。
