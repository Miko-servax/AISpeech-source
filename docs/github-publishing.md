# GitHub 源码与公开预览

更新日期：2026-11-16。三个仓库各自负责：

| 仓库 | 可见性与用途 |
| --- | --- |
| [AISpeech-source](https://github.com/Miko-servax/AISpeech-source) | 公开应用源码：Vue 前端、Node 后端、共享协议、配置/测试/部署脚本、文档和应用用发布 GLB |
| [AISpeech-demo](https://github.com/Miko-servax/AISpeech-demo) | 公开编译产物，GitHub Pages 从 main 根目录发布 |
| AISpeech | 私有维护仓库，另保留授权源模型和历史 |

页面继续使用 https://miko-servax.github.io/AISpeech-demo/ 。公开源码采用独立历史，不把私有 Git 历史或原始模型库一并公开。模型原文和来源说明始终保留，许可证不因公开应用代码而改变。

## 当前页面与后端

已发布的页面支持旋转、四窗独立调节、明确文字/续接/追问与复合批次。当前 API 地址由 `shared/public-deployment.mjs` 提供，显式 `VITE_API_BASE_URL` 可覆盖；普通构建仍默认同源 `/api`。默认后端为广州腾讯云 SCF，已验证真实测试音频的 ASR final/done 和 Qwen 意图接口；具体地址及数据见 [SCF 联调](tencent-scf-deployment.md)。早期新加坡 Render 曾返回 ASR 6001，当前不再作为默认语音后端。手机麦克风与网络体验仍需实际设备验收。

Pages 只托管静态文件，不能运行 ASR/模型代理。保持当前页面地址，只替换构建时的公开 API 地址即可接其他后端。凭据始终在后端；部署细节见 [托管后端](hosted-backend-plan.md)、[国内 SCF 方案](tencent-scf-deployment.md)、[同源 Linux 部署](deployment-linux.md)。

## 公开源码的范围

包含应用维护所需代码、锁文件、GLB/gzip、独立车窗运动配置、模型说明/截图/修正工具和许可。普通 `npm ci && npm run build` 不需要原始几何。

不公开：原始 FBX、门腔补丁几何 JSON、Blender/模型 ZIP、安装包、私有 Git 历史、真实环境文件/密钥、证书、缓存、日志和临时报告。模型许可允许完成的应用分发，源文件限私下项目协作；原始资产仍留私有维护工作副本。`build:model`、`test:model` 等源模型对照工具需要另行取得相应授权资产；公开克隆使用 `test:model:runtime` 检查运行模型。

### 从私有维护仓库导出

先审查改动，将需要公开的新代码、文档等暂存；导出只读取 Git 已跟踪/已暂存路径对应的工作区文件，因此先保存全部修改。它不上传、不复制 `.git`，且独立排除私有源几何。

```sh
git status --short
# 用具体文件路径暂存并检查改动，不暂存实际环境文件
npm run prepare:public-source
```

输出 `.cache/public-source/site/` 与其中的 `PUBLIC-SOURCE-MANIFEST.json`（文件大小、SHA256、排除项）。脚本检查已配置凭据、常见令牌、私钥、文件类型/大小、符号链接和模型许可；发现问题失败且不打印秘密值。新增敏感配置仍需维护者审查，不能仅依赖扫描。

首次创建公开源码仓库时只提交该目录中的文件，不推送私有维护仓库的历史。后续从专用临时克隆更新，先确认没有他人未合并的改动：

```sh
# 仅首次，目录需不存在
git clone https://github.com/Miko-servax/AISpeech-source.git .cache/public-source/repository
# 每次：先成功执行导出，再检查目标仓库/分支和工作区
git -C .cache/public-source/repository status --short
git -C .cache/public-source/repository pull --ff-only
rsync -a --delete --exclude=.git .cache/public-source/site/ .cache/public-source/repository/
git -C .cache/public-source/repository add --all
git -C .cache/public-source/repository diff --cached --stat
git -C .cache/public-source/repository commit -m "Update application source and documentation"
git -C .cache/public-source/repository push origin main
```

必须保持 `.git` 排除，删除操作只用于此专用导出克隆。不要把私有 `package:delivery` 生成的含源几何交接包上传公开仓库。公开源码改动和运行中的后端分别发布；当前 Render 自动部署已关闭。

## 页面构建与更新

```sh
npm ci
npm run test:commands
npm run test:model:runtime
npm run build:pages
```

`build:pages` 使用 pages 模式和 `/AISpeech-demo/` 基路径，输出 `dist-pages` 后从白名单生成 `.cache/github-pages/site/`。正常 `build` 输出 `dist`，不直接用于该 Pages 子路径。更改展示仓库名须同步修改 package.json 中的 base、脚本/文档链接。参考 [Vite Pages 部署说明](https://vite.dev/guide/static-deploy.html#github-pages)。

指定新的真实后端时：

```sh
VITE_API_BASE_URL=https://实际后端域名/api npm run build:pages
# 明确需要禁用后端的静态体验版时
VITE_API_BASE_URL='' npm run build:pages
```

白名单包含 HTML、JS/CSS、PCM Worklet、应用 GLB、模型/第三方许可、README、`.nojekyll` 和含逐文件 SHA256 的部署清单。源 FBX、门腔 JSON、source map、实际环境文件、凭据及本机证书不在页面产物中。Pages 不使用本地 Nginx 的 gzip_static，实际传输大小以响应为准。

更新专用展示克隆：

```sh
# 仅首次，目录需不存在
git clone https://github.com/Miko-servax/AISpeech-demo.git .cache/github-pages/repository
# 每次先确认目标仓库/分支与工作区无他人未保存修改
git -C .cache/github-pages/repository pull --ff-only
rsync -a --delete --exclude=.git .cache/github-pages/site/ .cache/github-pages/repository/
git -C .cache/github-pages/repository add --all
git -C .cache/github-pages/repository diff --cached --stat
git -C .cache/github-pages/repository commit -m "Update public car preview"
git -C .cache/github-pages/repository push origin main
```

Pages 设置 main 分支根目录并强制 HTTPS，GitHub 自动执行部署任务。推送成功不等于发布成功；等部署成功后再验收。GitHub 登录凭据使用本机凭据管理，不写仓库。

## 发布检查

1. 源码仓库可匿名访问，README/前后端/锁文件/运行 GLB/许可存在；没有实际 `.env.local`、证书、FBX 和门腔几何。
2. 从干净克隆执行安装、类型检查、构建、命令回归及 `test:model:runtime`，不依赖维护者电脑上的私有资产。
3. Pages 部署成功，HTTPS 与 `/AISpeech-demo/` 子路径资源正常，README 能链接公开源码。
4. 浏览器旋转、四窗调节、前排半开/后排关闭、记录与运动一致。模型/ASR 分别验证；若语音失败应显示原因，不能用 health 正常代替真实 final 验收。
5. 原始许可与项目内副本一致，云端凭据仍仅在后端。手机可达性/加载耗时/帧率以真机留档为准。

## 历史上线记录

最初上线（2026-11-16）使用私有功能提交 `58f43d0` 和展示提交 `95ac6fa`，当时为禁用语音/AI的静态版。首次 [Pages 部署](https://github.com/Miko-servax/AISpeech-demo/actions/runs/43733623695) 成功，HTTP 资源哈希与本地一致；浏览器通过旋转、调窗、续接和请求式复合指令。随后同一页面接入 Render 并验证真实 Qwen；ASR 地区限制单独保留。临时检查文件在 `.cache/github-pages/`，不上传公共仓库。
