# 腾讯云国际站ASR开通核对

核对日期：2026-11-16。用户选择纯云端，继续使用 https://miko-servax.github.io/AISpeech-demo/ 。现有Render后端和Qwen文字控车已通过真实验证，腾讯国内站ASR从新加坡调用返回6001。以下为开通前的核对结果，未代开新账号、绑卡或启用后付费。

用户已确认仅有国内站账号、个人在中国大陆，当前暂缓国际站路线，转而核对[国内SCF Web函数部署](tencent-scf-deployment.md)，保留同一个页面。

## 先核对账号资格

[官方账号说明](https://www.tencentcloud.com/document/product/378/80429)区分国际站与国内站，资源相互隔离，不能转移或合并。国际站适用主体包括中国大陆以外的个人/机构及中资企业海外分支；使用云服务有银行卡绑定或信用授权要求。

若只有中国大陆身份证/主体资料，[官方身份验证说明](https://www.tencentcloud.com/document/product/378/80678)引导使用国内站。先确认实际账号是否适用，不应把“换网页语言”或“国内账号重新建密钥”当成国际站开通。

## 免费额度与价格

[国际站ASR计费概述](https://intl.cloud.tencent.com/zh/document/product/1118/43352)明确开通后默认后付费；标准实时识别起步档为1.4美元/小时，大模型版为2美元/小时。当前项目配置的是16k_zh普通引擎，不需要为车控额外切换ASR大模型。

在这份现行计费文档及[服务计费FAQ](https://intl.cloud.tencent.com/zh/document/product/1118/43371)中，未找到对所有账号承诺的固定每月免费额度。因此不能保证“注册国际站就免费使用”。如账号有活动赠送，需在该国际站账号的ASR资源/账单页面核对产品、引擎、额度、有效期和扣费条件，再决定是否开通。

国内站资源包不能当作国际站可用额度。其他产品（如数据万象或TRTC）的语音相关优惠，也不能直接套用到本项目的独立ASR WebSocket接口。

## 具备资格后的开通顺序

1. 登录[国际站ASR控制台](https://console.tencentcloud.com/asr)，按实际账号情况完成注册/认证与支付条件核对。[官方新手指引](https://intl.cloud.tencent.com/zh/document/product/1118/43344)。
2. 查看实时语音识别的实际开通条件、优惠/额度和默认后付费说明。服务协议、绑卡与费用授权由账号持有人确认后再开通。
3. 在[国际站API密钥管理](https://console.tencentcloud.com/cam/capi)创建对应账号的ASR调用凭据，记录其AppID、SecretId、SecretKey；使用国际站已开通ASR的账号凭据，不能只在原国内站账号下重建密钥。
4. 在[现有Render服务](https://dashboard.render.com/web/srv-dbsu20oae00c7393cfbg/env)替换TENCENT_APP_ID、TENCENT_SECRET_ID、TENCENT_SECRET_KEY并重新部署。保留Qwen配置和ALLOWED_ORIGINS=https://miko-servax.github.io。密钥仅放后端，不发到聊天、GitHub或前端。
5. 先从Render检验ASR握手ready，再测短音频的final/done，最后在原网页实测“副驾后面的车窗开一半”及续接/复合指令。health的asrConfigured=true只代表已填配置。

[国际站WebSocket协议](https://intl.cloud.tencent.com/zh/document/product/1118/53937)使用与当前代码相同的asr.cloud.tencent.com主机和/asr/v2路径。协议入口不需要因“国际站”换成一个猜测的新域名；当前签名、热词、PCM及最终结果流程仍须通过实际账号联调确认。

页面、车模、Pinia和dispatch沿用现有实现。国际站凭据通过联调后，后端仍运行在Render，Mac关机不影响服务；Render Free的休眠/冷唤醒限制仍存在。现有进程级并发/频率限制不等于金额上限，不能据此承诺永不产生ASR费用。
