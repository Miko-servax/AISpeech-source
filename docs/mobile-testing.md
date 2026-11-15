# 手机真机HTTPS联调

以下LAN_IP替换为启动命令实际输出的电脑Wi-Fi地址。入口：**https://LAN_IP:5443/**。性能记录入口：**https://LAN_IP:5443/?perf=1**。首次证书下载：**http://LAN_IP:5442/**。地址仅在手机和电脑位于能互通的同一局域网时可达；没有启用公网隧道或修改系统防火墙。

## 最短连接步骤

1. 手机与电脑连接同一Wi-Fi，用系统Safari/Chrome打开首次证书下载地址，点击下载 `AISpeech-Local-CA.cer`。
2. 安装并信任 `AISpeech Local Test CA`：
   - iPhone：设置→已下载描述文件（或通用→VPN与设备管理）→安装；再到“通用→关于本机→证书信任设置”，开启此CA的完全信任。安装描述文件本身不会自动完成SSL信任，见[Apple官方说明](https://support.apple.com/en-us/102390)。
   - Android：设置→安全与隐私→更多安全设置→加密与凭据→安装证书→CA证书，选择下载的文件；菜单随厂商系统不同，见[Google官方说明](https://support.google.com/pixelphone/answer/2844832?hl=en)。
3. 打开HTTPS性能记录入口。确认没有证书错误，点击“点击说话”时允许麦克风。页面“性能记录”展开后可检查 `device.secureContext=true` 和 `microphoneAvailable=true`。不要通过浏览器安全警告的“继续访问”来代替正确的证书信任。

证书只需在这台测试手机信任一次。此CA用于本项目本地调试，测试结束可在手机删除它；只下载/传送公钥 `.cer`，私钥不应离开电脑。CA的SHA256指纹以本次 `npm run mobile` 启动终端输出为准，不随交付包预置。

电脑入口已通过自定义CA的完整TLS验证；手机实际安装与信任尚需用户完成，不能用电脑检测替代真机验证。

## 启动与代理

```sh
npm run mobile
```

脚本先构建生产页面，再启动：

- HTTPS前端：绑定当前Wi-Fi IPv4:5443，静态文件仅来自dist。
- 同源 `/api/intent`、`/api/health`、WSS `/api/asr`：代理到专用 `127.0.0.1:8790` 后端，不影响已有8787开发后端。
- HTTP证书下载：绑定Wi-Fi IPv4:5442，只提供公开CA证书与安装说明，其他路径404，不提供API或任意文件读取。
- 后端启动时加载现有 `server/.env.local`；不改写该文件、不输出密钥、不使用VITE_密钥，也不把服务器环境注入前端构建。
- 本次HTTPS origin自动追加到该进程的精确来源白名单，HTTP模型代理和WSS均保留同源Origin。未设置通配Origin或绕过TLS校验。
- `.local-https/` 已加入Git忽略；CA目录700、私钥600。根CA不加入电脑系统钥匙串。手机信任由用户显式安装完成。

`Ctrl+C` 停止本次HTTPS、专用后端和证书下载服务；录音连接也会关闭。电脑IP变动时重新运行，终端显示新地址，叶证书重签且保留原CA，手机通常不需要重新安装CA。叶证书有效30天，启动时检查并在将到期时重签；CA有效一年，CA更新后需要手机重新信任。

可选环境变量：`MOBILE_HOST` 指定本机局域网IPv4（自动优先en0，排除VPN接口），`MOBILE_HTTPS_PORT`默认5443、`MOBILE_CERT_PORT`默认5442、`MOBILE_API_PORT`默认8790。端口被占用会明确报错，不会停止其他进程。

## 已完成检查与边界

```sh
npm run test:mobile
npm run mobile:check
```

- `test:mobile` 使用真实HTTPS/WSS链路和本地模拟ASR/模型：验证证书链/SAN、模型请求、6400字节音频、final/done、非法Origin拒绝、GLB gzip和私钥/环境文件不被静态服务返回；不调用腾讯云或Qwen。
- `mobile:check` 检查当前实际入口：TLS可信（显式使用项目CA）、ASR已配置、同源模型路由、音频Worklet、GLB gzip与证书下载内容一致。模型探测使用会在规则层拒绝的输入，故预期422而不是云端调用。
- 结果保存在 `.cache/mobile/https-proxy-test.json` 与 `.cache/mobile/live-entry-check.json`。电脑本地已通过，不表示手机麦克风、系统证书安装或Wi-Fi隔离已验证。

若手机连不上两个入口，先确认同Wi-Fi且非访客隔离网络，检查电脑是否出现待用户允许的防火墙提示；不需要关闭防火墙。若网页正常但麦克风不可用，检查系统浏览器、证书完全信任与站点麦克风权限。避免用微信内置浏览器作为本轮基准。

## 设备与性能留档

展开页面右上方“性能记录”，填设备型号，选定画质。浏览器/系统UA、触控能力、安全上下文、实际DPR和缓冲尺寸会自动进入JSON，型号手动填写。数据仅留在页面及手机导出的文件，不上传服务器。

每项先点“重置采样”，持续测试约10秒，再点“导出测量JSON”：

| 场景 | 重点 |
| --- | --- |
| 首次与再次加载 | readyMs、firstFrame、resource transferSize，明确冷/缓存情况 |
| 持续拖动旋转 | camera.averageActiveFPS、帧间隔P95、超过33/50ms帧数 |
| 四窗升降及中途反向 | moving.averageActiveFPS、P95、动作响应、四窗状态和记录 |
| 展开/收起底部面板 | 车模持续可见，画布尺寸更新，停止后不空转 |
| 拖滑块、滚动操作记录 | 不误触车身旋转，记录与真实动画一致 |
| 语音和连续追问 | 原文、追问、目标、执行结果；等模型期间手动操作仍使旧结果失效 |

`averageActiveFPS`是活跃渲染间隔的平均值，不是GPU计时；静止按需渲染时为null属于正常情况，不能当成0fps。旋转与动画分别统计，长于200ms的活跃卡顿也保留，避免掩盖长帧。高/均衡/流畅可在“演示与调试”切换，切换会重新加载；固定同一视角、设备方向与画质做比较。记录系统版本、浏览器、设备温热状态，连续3–5分钟后再测一次温升/降频。
