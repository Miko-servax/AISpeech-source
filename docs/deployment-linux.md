# Linux生产部署：同源HTTPS + Node后端

推荐Linux服务器，以 `https://demo.example.com` 作为唯一浏览器入口：

```text
手机/电脑浏览器 ── HTTPS :443 ── Nginx ── 前端静态文件
                                  └─ /api/* ── HTTP/WS 127.0.0.1:8787
                                                       ├─ 腾讯云ASR WSS :443
                                                       └─ 模型服务 HTTPS :443
```

生产使用服务器域名对应的受信任证书（公有CA或已部署的受信任企业CA），证书及私钥在服务器单独配置；本地手机调试CA不随包交付，不用于公开部署。

### 1. 解包与安装后端依赖

将部署包解压至 `/opt/aispeech/releases/<版本>/`，将 `/opt/aispeech/current` 指向其中的 `aispeech-runtime` 目录。结构如下：

```text
aispeech-runtime/
  frontend/      # Nginx唯一静态根目录
  backend/       # server、shared及仅包含ws的package/lock
  deploy/        # Nginx、systemd和无凭据环境模板
  docs/          # 配置、联调和验收说明
  licenses/      # 模型原文、来源说明及第三方许可证
  README.md
  DELIVERY-MANIFEST.json
```

```sh
cd /opt/aispeech/current/backend
npm ci --omit=dev
```

创建 `aispeech` 服务用户，确保可以读取部署目录。安装Node 22.x后，核实systemd模板中的 `/usr/bin/node` 是否为实际路径。配置 `/etc/aispeech/backend.env`，可从 `deploy/backend.env.example` 开始，文件权限600、由root管理；将ALLOWED_ORIGINS改为正式HTTPS Origin并填写凭据。环境文件不放在frontend。

将 [systemd模板](../deploy/aispeech.service.example) 安装为 `/etc/systemd/system/aispeech.service`，检查路径后运行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now aispeech
sudo systemctl status aispeech
curl http://127.0.0.1:8787/api/health
```

systemd通过EnvironmentFile注入环境，启动命令为 `node server/asr.mjs`，不需要在部署目录创建.env.local。health返回ok/asrConfigured只证明本地配置已加载，不证明云端账号、配额或网络调用已通过。

### 2. 配置域名、TLS与同源代理

将DNS指向服务器，取得对应域名的证书，修改并安装 [Nginx模板](../deploy/nginx.conf.example)：替换server_name、证书路径和静态root；map指令必须放在http上下文，检查配置后启用：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

模板包含HTTP跳转HTTPS、TLS1.2/1.3、`/api/` HTTP/WS代理、Upgrade/Connection头、90秒代理读写超时与关闭代理缓冲，参见[Nginx WebSocket代理文档](https://nginx.org/en/docs/http/websocket.html)。`proxy_pass http://127.0.0.1:8787`不带结尾斜杠，以保留/api路径。浏览器始终请求同源 `/api/health`、`/api/intent`、`wss://demo.example.com/api/asr`；反向代理保留Origin供后端精确检查，不能统一改写为“允许”的来源。

若使用云负载均衡/CDN，须支持WebSocket升级、至少90秒连接空闲超时，并对/api禁用缓存/响应缓冲。服务器需能出站连接asr.cloud.tencent.com:443和配置的模型端点:443。仅公开所需的80/443入口；Node 8787保持本机监听。当前Demo的Origin检查不是用户登录鉴权；公开到不受控用户前，应在入口接入适合场景的访问认证/配额与限流，且覆盖HTTP和WSS。ASR现有限制为单进程最多4路连接、每次录音最多60秒，不是完整的公网访问控制。

GLB提供 `.glb` 与 `.glb.gz`；启用Nginx gzip_static及Vary后，模型可按协商传输约6.08MB。参见[Nginx gzip_static文档](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html)。缺少该模块/配置仍能加载约10.45MB原始GLB，但无法复现压缩传输收益。不要把.gz作为普通GLB返回。带hash的assets可长期缓存；固定名称GLB、HTML和音频Worklet须重新验证缓存，避免前后端/模型版本错配。

### 3. 上线验收与回滚

1. 浏览器打开正式HTTPS域名，确认受信任证书与麦克风权限正常；桌面localhost特例不能替代手机HTTPS验收。
2. `/api/health`正常；说“副驾车窗开一半”，验证WSS返回final且同一窗运动到位；再测规则之外表达，确认模型接口与本地校验。
3. 测“前排车窗开一半、后排关上”、缺位置整批追问、重复目标不动、多窗后续接追问、等待模型期间手动操作使晚到结果失效。
4. 验证旋转/阻尼、四窗中间过程及反向、底部面板/滑块触摸、逐窗记录状态、独立60秒到期。
5. `?perf=1`填写机型并导出每种画质/场景的JSON；静止按需渲染时FPS为null属正常。确认API不被缓存，静态目录无法读取环境文件和私钥。

保留上一版本完整前端/后端/模型发布目录。回滚时整体切换current软链，重启后端并reload Nginx，避免只替换HTML而遗留旧模型/后端协议。
