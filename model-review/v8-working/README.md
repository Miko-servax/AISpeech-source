# V8 工作副本

本目录以“原始 FBX + door-cavity.patch.json”保存可重建的工作副本；原模型继续位于 `../V8 Executive/v8_executive_01/`，没有覆盖或减面。

- `door-cavity.patch.json`：6 个替换网格（2 块前内饰板、4 扇门上沿开槽后的门皮）及 4 个新增内侧门腰网格，厘米坐标。
- `build-cavity.mjs`：从原始 FBX 重建补丁，局部细分/静态切槽/新增固定板件。
- `original-motion.ts`：修正前运动配置，用于页面对照。
- `baseline-collisions.json`：初版左前/左后每 5% 的三角面交点证据。
- `current-collisions.json`：当前四窗每 1% 的三角面检查结果。
- `mesh-check.mjs`：三角面 BVH 候选筛选和边—三角形相交检查。
- `check-motion.mjs`：从同一原始模型和同一补丁读取后执行检查。
- `evidence/`：浏览器实际截图。

页面默认加载工作副本；`/?baseline=1` 使用未修正原模型与旧轨迹。运行时加载逻辑见 `src/scene/apply-cavity.ts`；当前轨迹在 `src/config/v8-windows.ts`。

详细尺寸、判断与限制见 `../../docs/V8-motion-review.md`。
