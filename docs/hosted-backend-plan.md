# 现有GitHub Pages接入云后端的部署方案

更新日期：2026-11-16。Render Free后端已由用户创建并填写凭据，地址为https://aispeech-api.onrender.com。GitHub Pages继续使用原址。真实Qwen请求通过；腾讯ASR遇到境外调用限制，语音尚未通过验收。

## 真实联调结果

- health返回200、asrConfigured=true；CORS精确允许https://miko-servax.github.io。
- “右后床开一半”实际调用qwen3.8-flash，返回RR/absolute/0.5；关闭思考、后端超时10000ms，本次接口处理约2140ms。
- 腾讯ASR返回6001，在ready之前即被拒绝，未发送麦克风或测试音频。官方定义为“境外调用请前往腾讯云国际站开通服务”，不是密钥输错或余额不足的证据。[官方错误码](https://cloud.tencent.com/document/api/1093/48982)。
- Render当前部署在新加坡；继续使用该部署需匹配境外调用的ASR账号开通条件，或将ASR后端放在可使用当前国内站账号的运行环境。本机临时通道需电脑与进程保持在线，不能当长期云服务验收通过。
- Pages默认后端URL已保存在shared/public-deployment.mjs；显式VITE_API_BASE_URL可覆盖，设为空字符串可构建纯静态版。语音连接失败会显示原因，不将AI成功宣称为语音成功。

用户已选择纯云端，继续使用原页面。国际站ASR的账号资格、后付费及免费额度核对见[开通核对记录](tencent-international-asr.md)；目前尚未开通或替换国际站凭据，不能将语音标记为已通过。

## 最短免费部署步骤

1. 打开 [部署到Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMiko-servax%2FAISpeech)，使用自己的账号登录，并仅授权AISpeech私有仓库。仓库授权与新账号条款需由用户本人完成。
2. 读取仓库根目录render.yaml：已固定`plan: free`、新加坡、Node22、后端启动/健康检查和GitHub Pages的Origin。没有付费数据库或磁盘。自动部署关闭，后续从控制台手动部署新提交。
3. 在Render表单/Environment中填写腾讯APP_ID、SecretId、SecretKey以及现有INTENT_ENDPOINT、INTENT_MODEL、INTENT_API_KEY；只在平台填写，不发到聊天或GitHub。
4. 服务部署完成后取得真实`https://<分配名称>.onrender.com`地址，先验证health和真实ASR/Qwen可用。
5. 用该真实地址在本地生成并更新现有展示仓库：

```sh
VITE_API_BASE_URL=https://实际服务地址.onrender.com/api npm run build:pages
```

构建产物位于.cache/github-pages/site，按github-publishing.md同步到AISpeech-demo即可；分享的仍是原页面URL。不要把测试用example.invalid地址发布出去。只有后端已部署、凭据可用且Pages构建包含真实API地址后，麦克风才真正可用；只修改文档不会改变线上按钮。

## 页面留在原址，只部署Node后端

访客继续打开`https://miko-servax.github.io/AISpeech-demo/`，布局、车模和交互继续沿用当前页面，在页面内启用语音与AI功能。连接私有源码仓库Miko-servax/AISpeech，在Render上仅部署Node后端。平台分配的`https://<服务名>.onrender.com`只作为API/WSS服务地址，名字以创建结果为准，不要求访客跳转。Render提供受信任HTTPS并支持入站WSS/出站WebSocket，见 [Web Service](https://render.com/docs/web-services)、[WebSocket](https://render.com/docs/websocket) 官方说明。

```text
访客 ── GitHub Pages原地址（页面、车模、音频Worklet）
                  └─ HTTPS/WSS ── Render后端默认域名
                                    ├─ /api/health
                                    ├─ /api/asr ── 腾讯云ASR
                                    └─ /api/intent ── 已配置的Qwen端点
```

页面与后端跨域，需要增加公开API基地址配置和精确CORS处理；无需把云服务密钥交给前端。每位访客的车辆状态、记录和有效对话仍在自己的浏览器store里；模型意图经现有校验和dispatch执行。3D渲染在访客设备上，后端不需要GPU、数据库或持久磁盘。

先前“另开完整站点再从Pages跳转”的建议已被本方案取代。上线方式是更新同一个公开展示仓库里的前端构建；原页面地址继续使用。

## 已完成的代码适配

1. `server/asr.mjs`支持平台PORT并监听0.0.0.0；没有PORT时仍默认127.0.0.1:8787。[Render端口要求](https://render.com/docs/web-services#port-binding)。
2. 前端VITE_API_BASE_URL统一用于health/intent请求，ASR由同一配置转换为WSS地址。HTTPS页面禁止不安全后端URL和包含凭据/查询参数的配置，本地开发仍默认/api。配置只包含公开地址，不包含凭据。
3. 后端给health/intent提供精确CORS响应；JSON POST的OPTIONS预检、实际响应及错误响应均需覆盖。只允许`https://miko-servax.github.io`这个Origin（不带/AISpeech-demo/路径），方法与请求头按实际需要开放，动态Origin响应带Vary: Origin。WebSocket独立校验同一个Origin，不依赖CORS预检，也不使用*。见 [MDN CORS说明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。
4. Pages在配置真实API基地址后启用麦克风/模型，未配置时仍保持纯静态预览；pcm-worklet.js已加入发布白名单并从原Pages子目录加载。旧FBX/门腔对照仍禁用，不公开源模型库。
5. 前端默认超时已改为12000ms，可用VITE_INTENT_TIMEOUT_MS覆盖，后端模板为10000ms。Qwen继续关闭思考并保持现有输出校验。
6. ALLOWED_ORIGINS精确设置为`https://miko-servax.github.io`，不使用*。后端增加进程级限制：模型30次/分钟、最多4个进行中请求，ASR20次建立/分钟、最多4路录音且每次60秒。来源检查不是身份鉴权；这些内存限制随进程重启重置，不是云账单硬上限。
7. 托管入口支持SIGTERM/SIGINT关闭和录音连接清理，更新时提示重新录音；不自动重放音频或已执行指令。远端语音服务唤醒可等待最多90秒，临时错误会重试，取消可中止等待；模型执行超时仍独立。

实际配置已保存在render.yaml：build为`npm ci --omit=dev`，start为`node server/asr.mjs`。健康检查/api/health不能证明腾讯云或Qwen调用成功。已通过test:commands、test:cloud、test-microphone、test-asr、test-intent-server及构建验证；云接口测试使用模拟服务，未调用付费API。

## 密钥与配置

腾讯APP_ID/SecretId/SecretKey及INTENT_API_KEY放在Render服务的环境变量/Secret配置中，值不写GitHub、render.yaml、VITE_*或静态产物。[Render环境变量与Secrets](https://render.com/docs/configure-environment-variables)。后端出站使用服务端凭据；浏览器只能拿到转写文本、意图及脱敏错误，不能拿到腾讯签名URL或模型Key。

非敏感配置包含INTENT_ENABLED=true、原有INTENT_ENDPOINT/INTENT_MODEL/INTENT_PROVIDER、INTENT_TIMEOUT_MS=10000、INTENT_RESPONSE_FORMAT及来源白名单。平台部署时需显式补齐，不能依赖本机server/.env.local。凭据通过平台配置，不要求在聊天里发送。源码仓库保持私有，Render的GitHub授权仅选择该仓库。

## 地区、费用与验收顺序

先在新加坡区域做实际网络测试；Render列有该区域，见 [官方区域说明](https://render.com/docs/regions)。区域存在不等于国内访客网络必然顺畅，还需分别测访客到站点、服务到腾讯ASR、服务到当前Qwen端点的可达性和耗时。

免费实例适合先跑通：官方说明15分钟无入站流量会休眠，重新唤醒约1分钟，且有配额限制，不适合作为稳定演示的性能承诺。[免费服务限制](https://render.com/docs/free)。建议跑通后再决定是否转常驻付费实例；入门0.5CPU/512MB（原Starter，现ID 0.5c-512mb）官方材料列约7美元/月计算费用，最终按控制台当前价格确认，另计腾讯ASR、Qwen及可能的流量/构建等费用，不是总费用封顶。[规格](https://render.com/docs/compute-plans)、[官方价格示例](https://render.com/articles/production-rails-hosting-guide)、[价格页](https://render.com/pricing)。

部署验收分三层：

1. 空凭据启动云后端，验证HTTPS、CORS预检/实际/错误响应、WSS的Origin检查与限流，录音提示服务未配置；确认Pages前端包无凭据、Worklet仍由原站点加载。
2. 在平台配置凭据，验证服务器到腾讯/Qwen的真实调用；先跑文字模型纠错，再用麦克风测“副驾后面的车窗开一半”、续接/追问与复合指令。
3. 从实际访客网络继续打开原GitHub Pages地址，验证麦克风权限、耗时、长连接、超时/断网/重启提示、等待期间手动/取消失效和逐窗记录；免费实例额外测冷唤醒。分享的仍是原页面地址。

账号注册、仓库授权和后端创建已完成；当前实例为Free，未购买常驻套餐。语音6001的处理方式待用户选择，不能承诺当前国内站ASR账号可直接用于境外实例。
