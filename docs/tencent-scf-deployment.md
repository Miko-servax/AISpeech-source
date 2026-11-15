# 国内SCF Web函数接入（待部署）

更新日期：2026-11-16。用户仅有腾讯云国内站账号，个人在中国大陆，并要求纯云端及保留现有页面。国际站路线暂缓。建议在腾讯云中国大陆地域运行现有Node后端，实际调用成功后再切换Pages的公开API地址；当前Render和已验证的AI文字控车保留。

## 已核对的能力与账号状态

- 官方[WebSocket说明](https://cloud.tencent.com/document/product/583/63406)确认Web函数原生支持WS、函数URL提供ws/wss地址，服务监听0.0.0.0:9000。每条WS连接独占一个实例，200ms一包的现有PCM上传节奏低于其10次/秒、128KB/秒限制。
- [函数URL](https://cloud.tencent.com/document/product/583/96099)提供固定默认HTTPS地址，启用WebSocket后可获得WSS入口；页面仍放在原GitHub Pages，无需为此迁移车模。
- [运行环境](https://cloud.tencent.com/document/product/583/11060)当前列有Node.js20.19，未列Node22。因此单独制作后端包并配Node20启动脚本，不修改前端项目的Node22要求。
- 控制台当前显示本月暂无试用额度；资源购买页显示个人标准版与个人高级版均有0元/月试用入口，尚未下单或创建函数，最终领取资格以订单确认页为准。
- 账号首次进入SCF时出现服务角色授权提示，涉及COS/CMQ/CLS/APIGW等云资源权限。若后续仍提示，需账号持有人查看授权范围并确认，不能由检查动作视为已经授权。

## 费用边界

[免费试用说明](https://cloud.tencent.com/document/product/583/12282)规定符合条件的新用户前三个月可0元试用指定套餐，含计算/调用/部分出流量额度；第三个月后转按量计费。Web函数响应流量不在免费额度内，其他产品如日志服务也有单独计费项。不能把“套餐0元”当作全部运行费用永久为0。[计费概述](https://cloud.tencent.com/document/product/583/17299)。

先由用户核对并领取实际为0元的试用套餐及确认必要的服务角色授权，再创建函数。套餐领取、云服务协议、权限授予或付费选项需由账号持有人确认。不要打开预置并发或附加付费网关作为本轮默认配置。

## 已准备的部署包

```sh
npm run package:scf
```

输出delivery/scf-<时间戳>/aispeech-scf-backend.zip及SHA256清单。包中仅含后端、共享解析模块、已锁定的纯JS ws依赖及其许可、scf_bootstrap、空凭据环境模板和文件清单，不含.env.local、前端车模、证书、日志或真实云密钥。SCF上传包需要携带运行依赖，因此这里仅打包ws，不复制整个项目node_modules。

本次ZIP已独立解压并在本机Node22.23.2通过启动/health/CORS及启动脚本语法检查。尚未在SCF Node20.19实测，也没有用这个包调用真实国内ASR，不应提前宣称已解决6001。

## 创建时的具体配置

1. 选择中国大陆地域（例如广州），Web函数，Node.js20.19，上传ZIP，根目录必须直接包含scf_bootstrap，保持执行权限。选择Web函数，避免误选旧的事件函数+消息回调方案。
2. 启用WebSocket及公网函数URL。建议先设置256MB内存、执行超时120秒、WS空闲超时30秒，无预置并发；最终以控制台允许值和实测为准。现有录音最多60秒，与其结束等待应包含在函数时限内。
3. 将现有后端的腾讯ASR及Qwen环境变量配置到函数环境，ALLOWED_ORIGINS=https://miko-servax.github.io。HOST/PORT由启动脚本设置为0.0.0.0:9000。密钥不写ZIP、不提交GitHub、不发到聊天。
4. 核对公网出站可连接腾讯ASR和当前Qwen端点。先验证health、CORS预检/错误响应、WS握手，再测试ready/final/done及真实模型输出。若未通过，保留现有Pages配置，不发布猜测地址。
5. 全部通过后把新函数URL加/api作为Pages API基地址，更新原AISpeech-demo构建；车模和页面URL不变。再验收连续对话、复合批次与手动操作使晚到结果失效。

SCF会按连接生命周期运行，Mac睡眠/关机不参与服务可用性。函数冷启动、账号额度、云平台故障等仍需按实际部署验收；进程内限流不能代替账号级费用控制。
