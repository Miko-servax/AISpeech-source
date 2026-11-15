# AISpeech · 3D 智能车窗展示台

可旋转的 3D 汽车交互 Demo：四窗独立升降，按钮、滑块、文字与语音共用车辆状态。Vue 3 + TypeScript + Vite + Three.js + Pinia，Node.js 后端代理腾讯云实时 ASR 和兼容 Chat Completions 的意图模型。

- **在线体验**：[V8 智能车窗](https://miko-servax.github.io/AISpeech-demo/)
- **公开应用源码**：[AISpeech-source](https://github.com/Miko-servax/AISpeech-source)：前端、后端、共享协议、测试、部署配置、文档和应用用 GLB。
- **展示构建仓库**：[AISpeech-demo](https://github.com/Miko-servax/AISpeech-demo)：仅保存页面发布产物。
- **私有维护仓库**：AISpeech，保留原始模型资产和维护历史。公开源码使用独立历史，不包含密钥和原始模型库。

## 当前可用范围

| 项目 | 状态 |
| --- | --- |
| 旋转、四窗按钮/滑块、文字指令 | 本地及公开页面已验证 |
| 云端 AI 文字控车 | 广州 SCF + Qwen 实际调用已通过；模型关闭思考模式 |
| 云端语音 | 广州 SCF 真实测试音频已收到正确 final/done；浏览器麦克风及手机仍需设备实测 |
| 手机布局、HTTPS 联调、性能记录入口 | 已实现；完整手机真机设备/画质/帧率对照仍待补齐 |
| 小程序 | 当前交付为网页，没有小程序工程 |

页面继续使用原地址。默认后端为 `https://1257253028-ejvbd6nvzl.ap-guangzhou.tencentscf.com`。`/api/health` 正常只说明进程和配置已加载，不能替代真实语音或模型验收。国内函数配置与联调数据见 [SCF 部署说明](docs/tencent-scf-deployment.md)，早期 Render 结果见 [托管联调记录](docs/hosted-backend-plan.md)。

## 功能与交互

- 拖动旋转、缩放；桌面侧栏、手机底部面板。拖滑块和滚动记录时隔离车身旋转手势。
- 左前、右前、左后、右后四块主玻璃真实平移/倾转进入门内；后窗三角玻璃固定。不通过隐藏或透明度模拟升降。
- 全开、半开、全关及单窗调节；中途反向操作以当前动画位置继续。
- 语音只执行最终识别结果，保留文字输入、识别原文、追问和执行反馈；来源与耗时在详情中查看。
- “副驾后面的车窗开一半”“前排开一半、后排关上”等明确单条/并行复合指令。
- 单窗操作后可续接“再开一点”“关上吧”。“再开一点”在提交时按当前开度增加 10 个百分点，并限制在 0–100%；有效上下文为 60 秒。
- 缺位置时保留待执行动作，回答明确位置后整批执行；“右车窗”仍追问前后。多窗之后“再开一点”也追问目标。取消、超时或手动操作清理相关上下文并使等待中的旧结果失效。
- 整批校验通过后同步提交；目标重复/冲突时整批不执行。按一句话关联批次记录，逐窗区分执行中、完成和被后续操作替换。

## 快速启动

使用 **Node.js 22.12+、22.x 和 npm 10+**；项目已在 Node 22.23.2 验证。保留 `package-lock.json`，通过锁文件安装：

```sh
git clone https://github.com/Miko-servax/AISpeech-source.git
cd AISpeech-source
npm ci
npm run doctor
# 已有本地配置时保留它，不覆盖现有凭据
test -e .env.local || cp .env.example .env.local
test -e server/.env.local || cp server/.env.example server/.env.local
npm run dev:server
```

另开终端，在同一目录运行：

```sh
npm run dev
```

访问 `http://127.0.0.1:5173`。后端默认 `127.0.0.1:8787`，开发服务器将 `/api` 的 HTTP 和 WebSocket 请求代理到后端。不填云端凭据也能旋转、手动调窗和使用明确规则文字指令；语音和模型理解需要在 `server/.env.local` 配置自己的服务。

```sh
npm run build       # 类型检查 + 生产构建，输出 dist
npm run preview     # 本地预览 http://127.0.0.1:4173；需后端进程
```

公开源码直接加载随应用提供的发布 GLB，不依赖私有 FBX 或门腔几何文件。缺少这些资产时自动关闭 FBX/旧门腔对照入口，正常车窗运动不受影响。`preview` 用于本地验收；正式部署使用静态托管/反向代理和独立 Node 进程。

## 目录与指令链路

```text
src/
  App.vue, components/      展示布局、调窗面板、语音和操作记录
  commands/                 规则解析、意图处理、批次及记录逻辑
  stores/                   Pinia 车辆状态和统一执行入口
  voice/                    采音、ASR 连接、请求失效与会话协调
  scene/                    GLB 加载、动画、拾取、高亮、按需渲染
  config/                   窗节点/运动轨迹、运行时和画质配置
server/                     ASR 网关、模型代理、热词、Origin/限流
shared/                     前后端共用意图/批次协议和校验
public/                     发布 GLB、PCM Worklet、模型授权
scripts/                    回归、评测、构建、性能和交付工具
model-review/               模型说明、运动分析、修正脚本和对照截图
docs/, deploy/              设计/验收说明与部署模板
licenses/                   模型原文和来源说明
render.yaml                 Render 免费后端部署声明（不含凭据）
```

按钮、滑块、文字和语音最终使用同一套 store 与批次逻辑。明确规则先解析；规则未覆盖且允许交给模型的表达通过 `/api/intent` 理解。前后端共享结构、范围、约束校验；`prepareBatch` 无副作用，`commitBatch` 同步读取当前开度并提交全部目标，复用单条执行逻辑。批次和子项 ID 由程序生成。动画按 store 状态更新，记录以实际到位或被替换为准。详见 [意图协议](docs/intent-integration.md)、[连续对话](docs/continuous-dialogue.md)。

## 配置与密钥

前端模板 [.env.example](.env.example)，后端模板 [server/.env.example](server/.env.example)，生产模板 [deploy/backend.env.example](deploy/backend.env.example)。示例中的凭据均为空。

| 配置 | 含义 |
| --- | --- |
| `VITE_API_BASE_URL` | 浏览器公开 API 基地址。普通构建默认同源 `/api`；Pages 默认读取 `shared/public-deployment.mjs`，可显式覆盖。Pages 设为空字符串时构建静态体验版 |
| `VITE_INTENT_TIMEOUT_MS` | 前端模型请求超时，默认 12000ms；修改后重启 Vite/重新构建 |
| `TENCENT_APP_ID / TENCENT_SECRET_ID / TENCENT_SECRET_KEY` | 仅在后端配置的腾讯实时 ASR 凭据；须已开通匹配地域/账号的服务 |
| `TENCENT_ASR_ENGINE` | 默认 `16k_zh`；上传 16kHz、单声道 PCM16 |
| `ALLOWED_ORIGINS` | 逗号分隔的精确浏览器 Origin，包含协议/端口、不带路径或尾斜杠。Pages 为 `https://miko-servax.github.io` |
| `INTENT_ENABLED` | `true` 启用模型兜底，默认 `false`；规则指令独立可用 |
| `INTENT_ENDPOINT` | 完整 Chat Completions URL，含 `/chat/completions`，与模型账号地域对应 |
| `INTENT_MODEL / INTENT_API_KEY` | 模型 ID 和后端密钥，例如 `qwen3.8-flash` |
| `INTENT_PROVIDER` | `dashscope` 或 `openai-compatible`；Qwen 名称自动适配，使用 `enable_thinking=false` |
| `INTENT_RESPONSE_FORMAT` | `json_schema` 或 `json_object`，均执行本地校验 |
| `INTENT_TIMEOUT_MS` | 后端超时 100–30000ms；开发模板 3000、生产模板 10000，前端应留传输余量 |
| `HOST / PORT` | 无平台端口时默认本机 8787；托管平台传入 PORT 时默认监听 `0.0.0.0` |

ASR 热词独立放在 [server/config/asr-hotwords.json](server/config/asr-hotwords.json)。未被规则完整覆盖的口语交给模型理解，规则能确定的信息仍作为约束。

密钥不得写入 `VITE_*`、`public`、`dist`、GitHub、Render 声明或前端请求。音频不落盘，错误信息脱敏；日志不记录请求体、Authorization 或签名 URL。Origin 检查不是身份认证，公开服务还需按访问范围设置认证、调用配额和费用控制。

## 模型、节点映射与运动参数

- 运行模型：[public/models/v8-working.glb](public/models/v8-working.glb)，含门腔修正、精确索引、静态不透明合并及无损压缩，**未减面**。
- 节点映射和逐窗轨迹：[src/config/v8-windows.ts](src/config/v8-windows.ts)。前窗下降约 57cm/倾角 12°，后窗约 55cm/18°；后窗三角玻璃固定。百分比是归一化运动轨迹，不承诺等于可见开口面积。
- 发布清单：[public/models/v8-working.manifest.json](public/models/v8-working.manifest.json)。约 70.44 万三角面、265 网格，透明网格 34 个；受保护节点 229 个。GLB 约 10.45MB，预压缩 gzip 约 6.08MB，实际传输取决于托管平台。
- [运动修正与网格检查](docs/V8-motion-review.md)、[性能与按需渲染](docs/performance-runtime.md)、[对照截图](model-review/v8-working/evidence/)。

四窗和透明部件保持独立。移动端有画质档位；按需渲染覆盖相机阻尼、动画、高亮、资源与尺寸更新。`?perf=1` 可记录设备/画质/帧率并导出 JSON；静止且不渲染时 FPS 为 null 属正常。

V8 Executive 0.1 原作者为 **GTV Lab**，来源 [GTV Lab](https://lab.gtvgtv.co.il/)。[模型许可原文](licenses/V8-MODEL-LICENSE.txt)和[修改/来源说明](licenses/V8-MODEL-NOTICE.txt)原样随应用保留。许可允许随完成的应用分发，源资产仅供私下项目协作；因此公开仓库不提供原始 FBX 和门腔几何补丁 JSON，不提供模型资源库。Fab 取得的副本依购买时所选许可。公开源码不为模型或第三方依赖重新授予许可。

普通运行与构建不需要源资产。取得授权的维护者可在私有工作副本恢复原路径，使用 `build:model` 和 `test:model` 重建/核对；公开仓库使用 `test:model:runtime` 校验发布 GLB。不要从应用抽出模型单独再分发。

## 验证与评测

```sh
npm run doctor
npm run test:commands
npm run test:model:runtime
node scripts/test-intent-server.mjs
node scripts/test-asr.mjs
node scripts/test-audio.mjs
node scripts/test-microphone.mjs
npm run test:cloud
npm run build
```

这些命令使用本地数据/模拟云服务；端口测试需允许本机监听，不产生真实云调用。`test:model:runtime` 检查 GLB/gzip 哈希、网格统计、独立节点、四窗各 101 个轨迹采样与固定三角玻璃。测试通过不能代替浏览器真实动画和麦克风实测。

| 命令 | 用途 |
| --- | --- |
| `npm run eval:intent` | **真实模型评测**，使用后端本地环境配置，可能消耗云端额度；不控制车辆 |
| `npm run profile:assets` / `build:model` / `test:model` | 需要授权源资产的分析、重建和无损对照 |
| `npm run mobile` | 构建、启动手机 HTTPS 页面与专用同源后端 |
| `npm run test:mobile` / `mobile:check` | 本地 HTTPS 回归/运行中入口检查 |
| `npm run build:pages` | 生成 Pages 页面及 `.cache/github-pages/site/` 发布白名单 |
| `npm run prepare:public-source` | 从已跟踪/已暂存文件导出经过扫描的公开应用源码 |
| `npm run package:delivery` | 构建并生成运行包、源码包及 SHA256 清单 |
| `npm run package:scf` | 生成只含 Node 后端及 ws 依赖的 SCF ZIP，不含密钥 |

真实评测报告保存在 `.cache/intent-eval-report.json`，记录文本、耗时、模型名、校验前意图及脱敏错误；临时报告不上传。评测结果依实际运行而定，不能把模拟回归当作真实模型通过率。

## 部署与更新

**GitHub Pages + 托管后端**：现有页面使用 `build:pages`，API/WSS 连接独立 HTTPS 后端。Render 通过根目录 `render.yaml` 创建后端，构建 `npm ci --omit=dev`、启动 `node server/asr.mjs`；凭据只在平台环境设置。当前关闭自动部署，代码推送不会自动替换运行中的后端。具体更新步骤见 [GitHub 发布](docs/github-publishing.md) 和 [Render 联调](docs/hosted-backend-plan.md)。

默认使用[广州 SCF Web 函数](docs/tencent-scf-deployment.md)，已验证 ASR 测试音频和 Qwen 接口。Render 是早期方案，其国内站 ASR 境外调用曾返回6001；保留历史记录，不作为当前语音后端。SCF 函数 URL 由平台标记为测试入口，当前用于本 Demo 联调，正式生产应按平台要求绑定自定义域名。免费托管额度、ASR 和模型调用额度分别计算，不承诺整条链路永久免费。原页面地址及车模保持不变。

**Linux 同源部署**：Nginx 托管前端并代理 `/api/*` 的 HTTP/WS 到 Node，使用公有 CA 证书。提供 [Nginx](deploy/nginx.conf.example)、[systemd](deploy/aispeech.service.example) 和空凭据环境模板。完整安装、TLS、WebSocket、gzip、上线检查及整体回滚步骤见 [Linux 部署说明](docs/deployment-linux.md)。

**手机局域网联调**：运行 `npm run mobile`，按终端输出安装/信任测试 CA，并访问实际 HTTPS 地址。该入口依赖本机在线，适合调试；公网云部署不依赖 Mac。不要交付本机 CA、IP 或实际 `.env.local`。步骤与性能留档见 [手机测试](docs/mobile-testing.md)，剩余验收与演示顺序见 [验收清单](docs/acceptance-and-demo.md)。

## 交付与公开源码同步

```sh
npm ci
npm run test:commands
npm run test:model:runtime
npm run package:delivery
```

输出 `delivery/<时间戳>/`：

- `aispeech-runtime.tar.gz`：前端静态文件、后端和 ws 锁文件、部署模板、文档、模型及第三方许可证。后端单独执行 `npm ci --omit=dev`。
- `aispeech-source.tar.gz`：应用源码、锁文件、发布 GLB、配置、测试及文档。在公开源码检出目录打包不含源几何；私有维护目录存在授权源资产时会纳入源码交接包，仅供许可允许的私下协作，**不要把该私有交接包上传公开仓库**。
- `SHA256SUMS.txt`、`package-report.json` 和包内文件清单用于核对。

公开 GitHub 同步另用 `prepare:public-source`，排除私有源几何和 Git 历史，生成 `PUBLIC-SOURCE-MANIFEST.json` 记录每个文件大小及 SHA256。上传前检查暂存区，步骤见 [公开源码更新](docs/github-publishing.md)。

打包/导出会检查真实配置的密钥是否意外进入文件，发现后失败且不打印值；模型许可保持原文。不包含 `.env.local`、私钥/证书、`.local-https`、`node_modules`、`.git`、缓存、日志、临时报告、无关模型/安装包和旧交付包。

## 常见排查

| 现象 | 检查 |
| --- | --- |
| Node/安装失败 | Node 22.x、npm 10+、锁文件；先 `npm run doctor`，不要用旧 Node 强制跳过 engine |
| 车模可用但语音未开放/连接失败 | 构建时 API 地址、后端 health、HTTPS/WSS、麦克风权限；设置环境后需重新构建 |
| ASR 6001 | 服务账号与部署地区不匹配，见托管记录；不是前端重试可解决 |
| 模型失败或超时 | 后端开关、完整 endpoint、模型名、凭据/配额；前端超时应大于后端，查看脱敏错误 |
| CORS/WS 403 | Origin 只含协议/主机/端口，Pages 不带 `/AISpeech-demo/` 路径；HTTP 与 WS 均需允许 |
| 手机无法录音 | 受信任 HTTPS、浏览器权限；局域网 CA 需安装并信任，不能用 HTTP IP 入口 |
| `build:model` 提示缺少 FBX/补丁 | 公开源码不含授权源几何；运行/构建直接使用 GLB，执行 `test:model:runtime` |

更多设计：[语音链路](docs/voice-control.md) · [意图接入与批次](docs/intent-integration.md) · [连续对话](docs/continuous-dialogue.md) · [移动端测试](docs/mobile-testing.md) · [演示顺序](docs/acceptance-and-demo.md)。
