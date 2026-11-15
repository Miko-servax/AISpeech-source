# 国内SCF Web函数接入与联调

更新日期：2026-11-16。广州/default 的 aispeech-api 已创建，Node20.19 后端启动及真实 ASR/Qwen 接口通过。继续使用 https://miko-servax.github.io/AISpeech-demo/ ，默认 API 基地址为 https://1257253028-ejvbd6nvzl.ap-guangzhou.tencentscf.com/api 。国际站路线暂缓，Render 保留早期联调记录，不再作为默认语音入口。

## 真实接口验证

- health 200/asrConfigured=true；Pages Origin 的预检204、Access-Control-Allow-Origin正确；其他Origin返回403。
- 使用macOS Tingting合成“把右后车窗开一半”，以16kHz单声道PCM16、200ms一包上传：ready约848ms，收到sentence_start/interim/final/done，final为“把右后车窗开一半。”，正常关闭1000，总约4507ms。此项是实际云端识别测试音频，不等于浏览器麦克风或手机实测。
- “右后床开一半”实际调用qwen3.8-flash返回RR/absolute/0.5，HTTP200，客户端约2454ms、后端约1910ms；dashscope适配、enable_thinking=false、后端超时10000ms。
- 原始测试报告仅保存在.cache/github-pages/scf-live-check.json，不上传测试音频或临时报告。密钥继续由用户配置在函数环境。
- 函数URL控制台标记“仅供测试”，本Demo先使用默认HTTPS/WSS入口联调；正式生产按平台要求绑定自定义域名。平台CORS关闭，应用后端负责HTTP与WS的精确Origin检查。公开AppID会作为默认域名的一部分出现；打包扫描仅允许已核对的这个完整域名，其他AppID出现位置及所有SecretId/SecretKey/模型Key仍被拦截。

## 已核对的能力与账号状态

- 官方[WebSocket说明](https://cloud.tencent.com/document/product/583/63406)确认Web函数原生支持WS、函数URL提供ws/wss地址，服务监听0.0.0.0:9000。每条WS连接独占一个实例，200ms一包的现有PCM上传节奏低于其10次/秒、128KB/秒限制。
- [函数URL](https://cloud.tencent.com/document/product/583/96099)提供固定默认HTTPS地址，启用WebSocket后可获得WSS入口；页面仍放在原GitHub Pages，无需为此迁移车模。
- [运行环境](https://cloud.tencent.com/document/product/583/11060)当前列有Node.js20.19，未列Node22。因此单独制作后端包并配Node20启动脚本，不修改前端项目的Node22要求。
- 用户已领取广州个人标准版试用，控制台显示到期时间2027-02-16 01:13:23；实际套餐为每月事件/Web调用各50万次、资源使用量10万GB·s、外网出流量2GB，以账号实际套餐为准。函数已由用户确认协议后创建。
- 账号首次进入SCF时出现服务角色授权提示，涉及COS/CMQ/CLS/APIGW等云资源权限。若后续仍提示，需账号持有人查看授权范围并确认，不能由检查动作视为已经授权。

## 费用边界

[免费试用说明](https://cloud.tencent.com/document/product/583/12282)规定符合条件的新用户前三个月可0元试用指定套餐，含计算/调用/部分出流量额度；第三个月后转按量计费。Web函数响应流量不在免费额度内，其他产品如日志服务也有单独计费项。不能把“套餐0元”当作全部运行费用永久为0。[计费概述](https://cloud.tencent.com/document/product/583/17299)。

先由用户核对并领取实际为0元的试用套餐及确认必要的服务角色授权，再创建函数。套餐领取、云服务协议、权限授予或付费选项需由账号持有人确认。不要打开预置并发或附加付费网关作为本轮默认配置。

## 已准备的部署包

```sh
npm run package:scf
```

输出delivery/scf-<时间戳>/aispeech-scf-backend.zip及SHA256清单。包中仅含后端、共享解析模块、已锁定的纯JS ws依赖及其许可、scf_bootstrap、空凭据环境模板和文件清单，不含.env.local、前端车模、证书、日志或真实云密钥。SCF上传包需要携带运行依赖，因此这里仅打包ws，不复制整个项目node_modules。

本次ZIP已独立解压并在本机Node22.23.2通过启动/health/CORS及启动脚本语法检查；用户上传后，SCF Node20.19已通过上方真实云端接口测试。

2026-11-16创建配置：从头开始、Web函数、aispeech-api、广州/default、Nodejs20.19、本地ZIP、端口9000、启动命令`/bin/bash /var/user/scf_bootstrap`、256MB、执行超时120秒、WebSocket开启/空闲超时30秒、函数URL公网开启/内网关闭/开放鉴权。注意开启WebSocket时控制台会自动把执行超时改成600秒，本次已重新改回120秒。日志投递、插件、运行角色、VPC保持关闭。已导入12个环境变量名及非敏感值，四项凭据由用户在控制台补齐后创建。

## 创建时的具体配置

1. 选择中国大陆地域（例如广州），Web函数，Node.js20.19，上传ZIP，根目录必须直接包含scf_bootstrap，保持执行权限。选择Web函数，避免误选旧的事件函数+消息回调方案。
2. 启用WebSocket及公网函数URL。建议先设置256MB内存、执行超时120秒、WS空闲超时30秒，无预置并发；最终以控制台允许值和实测为准。现有录音最多60秒，与其结束等待应包含在函数时限内。
3. 将现有后端的腾讯ASR及Qwen环境变量配置到函数环境，ALLOWED_ORIGINS=https://miko-servax.github.io。HOST/PORT由启动脚本设置为0.0.0.0:9000。密钥不写ZIP、不提交GitHub、不发到聊天。
4. 核对公网出站可连接腾讯ASR和当前Qwen端点。先验证health、CORS预检/错误响应、WS握手，再测试ready/final/done及真实模型输出。若未通过，保留现有Pages配置，不发布猜测地址。
5. 全部通过后把新函数URL加/api作为Pages API基地址，更新原AISpeech-demo构建；车模和页面URL不变。再验收连续对话、复合批次与手动操作使晚到结果失效。

SCF会按连接生命周期运行，Mac睡眠/关机不参与服务可用性。函数冷启动、账号额度、云平台故障等仍需按实际部署验收；进程内限流不能代替账号级费用控制。
