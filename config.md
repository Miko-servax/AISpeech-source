# AISpeech 项目配置汇总

核对日期：2026-11-13（北京时间）。本文依据当前项目文件、已安装依赖及实际检查结果整理。

**当前结论：Vue 网页基础开发环境已经就绪，环境检查、类型检查和生产构建均已通过。车模、语音服务及原生小程序尚未实现，也未完成手机真机联调。**

此前截图中的「找不到 vue」问题对应依赖未安装时的状态；本次已确认 Vue 及相关依赖安装齐全。原 README.md 中「Vue 安装、构建待完成」的迁移记录已过时，当前状态以本文为准。

## 1. 项目与本机环境

| 项目 | 当前配置 / 状态 |
| --- | --- |
| 项目目录 | `/Users/pukeyang/Documents/AISpeech` |
| npm 项目名 | `aispeech-car-demo` |
| 项目版本 | `0.0.0` |
| 包属性 | `private: true`，ES Module（`type: module`） |
| 本机系统 | macOS，Apple Silicon |
| Node.js | 已安装 `22.23.2` |
| npm | 已安装 `10.9.8`，作为本项目包管理器 |
| Node 版本约束 | `>=22.12.0 <23`；`.nvmrc` 指定 `22.23.2` |
| npm 版本约束 | `>=10` |
| Git | 工具已安装；当前项目尚未初始化 Git 仓库，无提交或远程仓库配置 |
| 编译工具 | 前期已确认安装 Xcode Command Line Tools |
| 浏览器 | Chrome、Safari 已安装 |
| Blender | `/Applications` 未发现；模型需要拆分或修改时再准备 |

## 2. 技术栈与实际安装版本

已经从 React 基础工程切换为 Vue。当前 package.json 不再声明 React、React DOM、React Three Fiber、Drei 或 Zustand。

| 依赖 | 声明范围 | 本次实际安装版本 | 用途 |
| --- | --- | --- | --- |
| `vue` | `^3.5.0` | `3.5.45` | 页面与组件 |
| `pinia` | `^3.0.0` | `3.0.4` | 状态管理，入口已注册；尚未编写业务 store |
| `three` | `~0.180.0` | `0.180.0` | 3D 渲染，已安装；尚未创建场景 |
| `vite` | `^7.0.0` | `7.3.8` | 开发服务与构建 |
| `@vitejs/plugin-vue` | `^6.0.0` | `6.0.11` | 编译 `.vue` 单文件组件 |
| `typescript` | `~5.9.0` | `5.9.3` | TypeScript 支持 |
| `vue-tsc` | `^3.0.0` | `3.3.14` | TypeScript 和 Vue 模板类型检查 |
| `@types/node` | `^22.0.0` | `22.20.5` | Node 类型声明 |
| `@types/three` | `~0.180.0` | `0.180.0` | Three.js 类型声明 |

完整依赖树及精确版本保存在 `package-lock.json`；本次检查确认锁文件与 package.json 一致。版本变化后以锁文件及 `npm ls --depth=0` 的结果为准。

## 3. 项目文件与入口

| 文件 | 当前作用 |
| --- | --- |
| `package.json` | 项目属性、运行命令和依赖声明 |
| `package-lock.json` | 锁定安装版本 |
| `index.html` | HTML 入口，挂载节点 `#app`，加载 `/src/main.ts` |
| `src/main.ts` | 创建 Vue 应用，注册 Pinia，挂载 App |
| `src/App.vue` | 使用 `<script setup lang="ts">` 的占位页面 |
| `vite.config.ts` | Vue 插件、开发及预览服务配置 |
| `tsconfig.json` | TypeScript 严格检查配置 |
| `scripts/check-env.mjs` | 无第三方依赖的环境检查脚本 |
| `.npmrc` | 项目级 npm 源、缓存及网络配置 |
| `.nvmrc` | Node 版本约定 |
| `.env.example` | 公开前端环境变量示例 |
| `.editorconfig` | 缩进、换行和字符编码约定 |
| `.gitignore` | 依赖、产物、缓存和本地环境文件忽略规则 |
| `.vscode/extensions.json` | Vue 官方扩展推荐 |
| `.vscode/settings.json` | 指向项目内 TypeScript SDK |

阅读代码时可以先看 `src/main.ts`（启动与 Pinia 注册）和 `src/App.vue`（页面），再看 `vite.config.ts` 和 `package.json`（运行与构建）。

## 4. 启动、检查与构建

所有命令在项目根目录执行。

```bash
cd /Users/pukeyang/Documents/AISpeech
npm run dev
```

| 命令 | 实际执行 / 用途 |
| --- | --- |
| `npm install` | 安装或更新依赖，更新锁文件 |
| `npm ci` | 根据现有锁文件重建依赖，适合新机器或干净环境 |
| `npm run doctor` | 检查 Node、声明依赖是否存在、锁文件是否同步、入口文件及微信工具 CLI 是否存在 |
| `npm run dev` | 启动 Vite，本机访问 `http://127.0.0.1:5173/` |
| `npm run dev:lan` | 执行 `vite --host 0.0.0.0`，允许局域网设备访问 |
| `npm run typecheck` | 执行 `vue-tsc --noEmit` |
| `npm run build` | 先类型检查，再执行 `vite build`，产物写入 `dist/` |
| `npm run preview` | 在 `http://127.0.0.1:4173/` 预览已构建产物，需先 build |

开发服务和预览服务均启用 `strictPort: true`：端口被占用时会报错，不会自动换端口。框架或依赖调整后应重启开发服务。`preview` 用于本地验收，不代表已部署到公网。

本次端口检查未发现 5173 的监听记录；开发服务不会因为 build 成功而自动启动，需要开发时执行 `npm run dev`。

## 5. npm、TypeScript 和编辑器配置

### npm

| 设置 | 值 / 含义 |
| --- | --- |
| `registry` | `https://registry.npmjs.org/`，项目使用官方源 |
| `cache` | `.cache/npm`，缓存位于项目内 |
| `engine-strict` | `true`，检查 Node/npm 版本约束 |
| `fetch-retries` | `0` |
| `fetch-timeout` | `20000` 毫秒 |

这些是项目级配置，不修改用户全局的快手内网源。助手执行环境此前访问 npm 报过 `ENOTFOUND`；本机终端已完成当前依赖安装。后续新增依赖若再次遇到该限制，可在本机终端执行对应安装命令。

### TypeScript

| 配置 | 当前值 |
| --- | --- |
| `target` | `ES2022` |
| `lib` | `ES2022`、`DOM`、`DOM.Iterable` |
| `module` / `moduleResolution` | `ESNext` / `Bundler` |
| `jsx` | `preserve` |
| `types` | `vite/client`、`node` |
| 严格检查 | `strict: true` |
| 其他已开启项 | `skipLibCheck`、`isolatedModules`、`resolveJsonModule`、`esModuleInterop`、`forceConsistentCasingInFileNames` |
| 输出 | `noEmit: true`，类型检查不生成 JS，构建交给 Vite |
| 检查范围 | `src/**/*.ts`、`src/**/*.vue`、`vite.config.ts` |

### 编辑器与忽略规则

- VS Code 推荐扩展：Vue - Official，扩展 ID `Vue.volar`。已写入推荐配置，未验证编辑器是否实际安装；如已有 Vetur，应在此工作区禁用以避免冲突。
- VS Code TypeScript SDK：`node_modules/typescript/lib`。
- `.editorconfig`：UTF-8、两空格缩进、LF 换行、文件末尾换行、清除行尾空白。
- `.gitignore`：忽略 `node_modules/`、`dist/`、`.cache/`、`*.local`、`.env`、`.env.*`、`.DS_Store`、`*.tsbuildinfo`、`*.log`，保留 `.env.example`。
- 尚未配置 ESLint、格式化工具、自动化测试框架或 CI。

## 6. 环境变量与后端

`.env.example` 目前只有：

```dotenv
VITE_API_BASE_URL=/api
```

它是公开前端配置的占位值；当前页面尚未读取该变量。`.env.example` 不会被 Vite 当作实际环境文件自动加载，后续需要时可复制为 `.env.local`。

当前尚无后端服务、`/api` 接口、Vite API 代理、数据库、ASR 密钥或模型接口配置。语音服务密钥未来应放在后端环境变量中，不写入 `VITE_` 前缀的前端变量。

## 7. 微信小程序配置

| 项目 | 已知配置 / 验证边界 |
| --- | --- |
| 开发者工具 | 已安装 `/Applications/wechatwebdevtools.app` |
| CLI 路径 | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |
| 小程序 AppID | `wx602fe703a3764acb`，来自用户提供的账号页面 |
| 主体类型 | 个人主体，用户已确认 |
| 服务端口 | 用户开启后为 `59738`，此前确认在 `127.0.0.1` 监听；本次未发现监听记录，使用前需打开工具并核实实际端口 |
| 账号状态 | 前期界面已进入项目列表；该 AppID 的实际开发权限和 CLI 登录状态尚未完成验证 |
| 实现路线 | 已选择原生小程序适配方向，不能将当前 Vite 网页工程直接作为小程序运行 |
| 工程状态 | 尚无小程序目录、`project.config.json` 或小程序页面 |
| 上线配置 | 备案、所需认证、业务类目及发布资格尚未做完整验收 |

AppID 目前仅记录在说明文档中，尚未写入小程序工程配置。服务端口可能随工具启动发生变化，不是业务后端端口。

此前 CLI 检查因执行环境无法监听本地回调端口而出现 `EPERM`，不能据此判断小程序账号失效。后续创建工程时再验证导入、权限、预览和真机运行。

## 8. 3D、语音和手机联调的待完成项

| 项目 | 当前状态 / 下一步 |
| --- | --- |
| 车模资源 | 尚未加入 GLB/GLTF 等模型；需确定来源、授权和四块活动玻璃结构 |
| 3D 交互 | Three.js 已安装；场景、旋转视角、点击选窗、升降动画尚未实现 |
| 车辆状态 | Pinia 已注册；统一车辆状态和控车指令尚未实现 |
| 中文语音 | 尚未接入麦克风、ASR、指令解析和识别结果展示 |
| ASR 供应商 | 前期讨论过云端识别方案，尚未正式接入服务账号和密钥 |
| 手机网页 | 可用 `dev:lan` 调试页面；录音验收还需设备信任的 HTTPS |
| 小程序真机 | 待验证 3D 渲染、触摸操作、录音权限、网络请求和性能 |
| 网络与部署 | 尚无公网服务、可信 HTTPS、WSS、部署域名或小程序请求域名配置 |

局域网调试时，手机访问电脑的局域网 IP；手机上的 `127.0.0.1` 指向手机自身。普通局域网 HTTP 不能作为手机网页麦克风验收环境。

## 9. 本次实际验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run doctor` | 通过：Node、依赖、锁文件、配置及入口文件齐备 |
| `npm ls --depth=0` | 通过：当前直接依赖安装完整 |
| `npm run build` | 通过：Vue 类型检查和 Vite 生产构建完成 |
| `node --check scripts/check-env.mjs` | 通过 |
| 浏览器页面、WebGL、麦克风及手机真机 | 本轮未验证 |

现在可以开始 Vue 网页功能开发。模型、语音后端及原生小程序的准备应随对应功能推进；现有检查通过不等于完整 Demo 或所有终端已经可用。
