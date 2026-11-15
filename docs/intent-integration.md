# 热词与模型意图理解接入

本次实现不改动真实 server/.env.local。示例配置默认关闭模型兜底，规则控车和原腾讯云 ASR 可独立运行。模型配置完成后重启后端；修改 VITE_* 配置须重启 Vite。首次接入建议先用文字输入“右后床开一半”排查。

## 配置

热词在 `server/config/asr-hotwords.json`，包含四窗位置及带“车窗”的全称、主驾、副驾。每项为 word 和 weight；首版限制普通权重1–10。ASR每次连接读取文件，将 hotword_list 一起排序签名，再做 URL 编码，不修改识别原文。修改后在下次录音连接生效。

把以下配置追加至现有 `server/.env.local`，不要覆盖已经配置的腾讯云凭据：

```dotenv
INTENT_ENABLED=true
INTENT_ENDPOINT=https://your-provider.example/full/chat/completions/path
INTENT_MODEL=your-model-name
INTENT_API_KEY=your-model-key
INTENT_TIMEOUT_MS=3000
INTENT_RESPONSE_FORMAT=json_schema
```

适配器使用可配置的 Chat Completions 风格 HTTP 接口：发送 model、messages、response_format，读取 choices[0].message.content 中的 JSON。endpoint 是完整接口地址；不自动拼接路径。模型需支持严格 json_schema 响应格式；若提供方只支持 JSON object，可设 `INTENT_RESPONSE_FORMAT=json_object`，两种模式都必须经过相同本地校验。其他协议需要替换 `server/intent.mjs` 内的适配器，不能只填一个不兼容的地址。

### 阿里云 Qwen 联调

当前本机配置检查结果（2026-11-15）：`qwen3.8-flash`，HTTPS Chat Completions 完整路径，`json_schema`，后端10000ms、前端12000ms。这里只读取配置状态，没有输出或改写实际密钥，也没有调用真实模型。以上是磁盘配置，重启前后端后才用于新进程。

Qwen 模型名自动使用 DashScope 适配；自定义部署名可显式设置 `INTENT_PROVIDER=dashscope`。其他兼容接口可设 `INTENT_PROVIDER=openai-compatible`。DashScope 每次请求体顶层固定发送 `enable_thinking:false`、`stream:false`，不把 `extra_body` 当作 HTTP 字段。后者只是 SDK 的参数包装，本项目直接用 fetch。响应只读取 `message.content`，不使用 `reasoning_content`。

阿里云官方文档列出 Qwen3.8-Flash 支持严格 JSON Schema，可保留当前格式，不必降级为 JSON Object：[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)、[思考模式](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)。若切换到不支持 Schema 的模型，JSON Object 模式会在 system 中附带同一份 Schema，仍使用本地 validateIntent 校验。

前端公开配置 `.env.local` 可设置 `VITE_INTENT_TIMEOUT_MS=3500`。后端超时和前端截止时间独立，实际请求期限还受上下文/待执行动作到期时间约束。密钥仅放后端，不使用 VITE_ 前缀。

两端均支持100–30000ms；后端非法配置报配置错误，前端非法数值回退3500ms，有限数值钳制到范围内。后端计时覆盖 fetch、响应体读取和输出校验；到期返回 HTTP504 / `TIMEOUT`，即使上游忽略 abort 也不等待它完成。上下文先到期则为 HTTP409 / `CONTEXT_EXPIRED`。前端在开始处理该条请求时创建自己的截止时间；即使后端未返回也会 abort 并清空续接/待执行动作。输入时间另外用于限制待执行动作的60秒有效期。执行前仍核对版本和截止时间，晚到结果不能控车。浏览器取消/断开会通知后端中止上游。

可分别验证两条超时路径：后端临时100ms、前端保留12000ms，应先见后端 `TIMEOUT`；再恢复后端10000ms，前端临时100ms，应由前端先提示超时、请求被取消。每次更改后重启对应进程，验收后恢复10000/12000ms。真实请求若恰好在100ms内完成，此次不算超时用例；自动测试使用不返回的模拟接口保证覆盖，不依赖网络碰巧慢。

启动：

```sh
npm run dev:server
# 另一个终端
npm run dev
```

## 分流和完整匹配

`shared/intent.mjs` 的 RuleReason 是共享枚举值集合；`src/commands/vehicle-command.ts` 先检查完整语法，再进入规则解析，避免靠位置和动作子串直接判成功。

| 原因 | 处理 |
| --- | --- |
| matched | 明确规则或有效续接，经 resolveIntent 执行 |
| cancel | 立即清空对话并中止模型队列 |
| empty | 提示重说 |
| negated | 否定表达不执行、不进入模型 |
| non_imperative | 问句、条件或部分叙述表达不执行 |
| ambiguous | 已知歧义继续追问；不交给模型选目标 |
| invalid_magnitude | 非法幅度拒绝，不进入模型 |
| unsupported_device | 非四窗设备不进入模型 |
| unsupported_expression | 无法支持的表达拒绝 |
| model_fallback | 规则未覆盖的表达交给模型理解；非车窗或无意义表达由模型返回 unsupported |

“右后床开一半”为 model_fallback；原文完整保留。“右车窗开一半”由规则保留动作并追问右前/右后。“不要开右后床”、问句、越界幅度等不通过模型变成肯定命令。

## 请求与输出

独立 `POST /api/intent` 接收 requestId、text、context。context 只包含有效 active 续接目标和 pending 动作/候选/绝对过期时间，不传 selected、完整聊天历史、音频或凭据。服务端校验来源、方法、请求大小、字段和上下文有效期；并重新检查此原文是否有资格进入模型兜底。

模型接收到原始文本、有效上下文及四窗能力约定。模型输出字段固定为 type、target、operation、missing。例如：

```json
{
  "type": "command",
  "target": { "source": "explicit", "ids": ["RR"], "candidates": [] },
  "operation": { "kind": "absolute", "value": 0.5 },
  "missing": null
}
```

- type：command / clarify / unsupported。
- target.source：explicit / context / pending / unknown；ids 为执行目标，candidates 为追问候选。
- operation：absolute/value（0–1），relative/delta（首版仅 ±0.1），或者 null。
- clarify 的 missing：target / action / amount。页面使用本地模板追问，不直接渲染模型任意生成的提示或代码。

服务端与浏览器共用 `validateIntent`，检查严格字段和枚举、有限数值、幅度范围、单窗相对调整、有效上下文引用及规则已经确定的部分约束。不再要求正则提取出完整的目标、动作和幅度；没有匹配到的信息不等于禁止模型理解。生产代码和提示词中没有针对“床”或其他评测句的专门修复。

追问的 `target.candidates=[]` 表示没有显式列出候选，不是“零个车窗”。`clarificationCandidates` 将其解释为当前有效范围：优先使用规则已确定的 targets/candidates，再使用 source=pending 的有效待执行候选，均未知才回退四窗。因此完全未限定时，空列表与四窗列表语义等价，候选顺序也无关。已知左侧范围时，空候选沿用左前/左后；显式列出四窗仍会在 validateIntent 被拒绝，不会通过取交集来修复。评测比较和前端创建待执行动作使用同一函数，执行候选也不会因此被扩大。

`extractConstraints` 返回部分事实：targets、candidates、requiresTargetClarification、mode、magnitude、direction。未知字段为 null。仅确定50%时只约束幅度，不要求同时确定目标和动作；完全未知的表达允许模型独立给出合法结构化意图。“主驾／副驾”作为关系描述的参照物时，不直接当作目标，例如未覆盖的“副驾身后”由模型理解。侧向候选可以限制左右范围，但只有规则完整识别的“右车窗”等已知歧义才强制追问前后，不能把所有候选集合都当成模型无法消解的歧义。

请求中将原始 text、有效 context、部分 constraints 分开传给模型。模型既不能覆盖已经确定的目标/数值，也不能引用不存在或过期的上下文、改写待执行动作。未知口语的语义正确性由模型理解及真实模型评测检验；结构校验本身不证明模型理解正确。无法确定目标/动作/幅度时应返回 clarify，非车窗和无意义输入返回 unsupported。

规则和模型最终共用 store.resolveIntent → dispatch；模型额外通过 store.commitIntent 校验请求票据与输出。相对操作只在 dispatch 读取实时 current，模型请求不携带开度快照来计算目标。

## 顺序和晚到结果

`src/commands/intent-controller.ts` 对去重后的语音最终句子串行处理。下一句开始处理时才读取上下文快照，因此能使用上一句刚成功建立的目标；不是在进入队列时提前快照。文字输入替换正在处理/排队的旧工作。

模型请求票据绑定输入ID、interactionVersion、dialogueRevision、请求截止时间和上下文快照。手动操作、取消、过期会使等待中的请求和队列失效，AbortController 尝试中止网络；即使适配器忽略信号继续返回，响应也不会提交。store.commitIntent 在执行前仍再次检查截止时间、交互版本和对话版本。动画 current 每帧变化不递增 dialogueRevision。

取消优先于队列，不能排在模型后面。录音开始版本仍在 connecting 时固定，首条 sentence_start/interim/final 晚于手动操作的结果不获得新版本。正常停止录音或收到ASR done 不会自动取消一个仍有效的意图请求；开始新录音会使旧请求失效。

模型超时、输出校验失败、或不支持该表达时清空对话目标和待执行动作，避免下一句“再开一点”错误地续接更早的目标。模型的 clarify 分支强制进入追问，不能因旧上下文存在而变成执行。已有动作的追问不能延长原来的60秒期限，模型等待也不会刷新期限。

## 验证与边界

```sh
npm run test:commands
node scripts/test-intent-server.mjs
node scripts/test-asr.mjs
node scripts/check-v8.mjs
npm run build
```

测试覆盖：右后床分流与恢复、否定/问句/歧义/越界不调用模型、错误目标与额外字段拒绝、模型配置缺失、HTTP请求边界、热词签名、模型等待中的手动/取消/过期、忽略中止信号的晚到响应、超时后继续输入、下一句规则/模型依赖上一句目标、模型失败不沿用更早目标、实时 current 相对计算以及重复结果幂等。

新增未覆盖语言样例位于 `scripts/intent-language-cases.json`，包含“坐司机后边那位，把那块玻璃落到一半的位置”“副座后头那扇玻离给我落到三成”“副驾身后那块玻璃落到三成”“右厚创打凯一伴”，以及省略指代、待澄清补答、位置幅度不明确、非车窗和无意义输入。这些句子没有写进生产匹配规则或提示词。

本地自动测试使用预设模型输出，验证通路与校验职责，不声称验证了模型理解准确率。当前 Qwen 配置已经就绪，真实评测由使用者运行：

```sh
npm run eval:intent
```

该命令调用真实模型，对每句输出与预期进行比较，报告写入 `.cache/intent-eval-report.json`，不会调用 dispatch 或移动车窗。它直接复用后端提供方适配器，不要求先启动服务；耗时不包括浏览器、Vite代理或本机HTTP网关，也不验证前端超时。对误识别较严重的句子，“追问”也可作为允许结果；目标错误仍会标记 REVIEW。未配置时明确输出 SKIP，不把模拟测试当成真实模型评测。

报告 version=3。每条包含 requestId、原文、当次有效 context、model、elapsedMs（整条评测调用）、providerElapsedMs（上游请求至响应体读完，超时时为已等待时间）、结构化 intent、expected 和 mismatch 的 issues。meta 包含提供方、思考设置、响应格式和实际后端超时。控制台同样逐条打印耗时与模型。错误信息包含 code、stage、HTTP status、可用时的 upstreamStatus / providerCode、validationIssue。

校验失败另存 `validation.preValidationIntent`（校验前已解析的意图，包含被拒绝的字段）和 `validation.constraints`（规则已确定的信息）；`error.validationCode`、`validationReason`、`validationPath` 直接来自共享校验器，表示具体原因和字段路径，不再只依赖粗分类。例如 `COMMAND_CANDIDATES_MUST_BE_EMPTY` 指 command 错把候选放入 candidates，`CLARIFY_IDS_MUST_BE_EMPTY` 指追问仍给出执行目标，`ACTIVE_TARGET_INVALID` 指续接目标与有效 active 不符。这里只保存 JSON 意图，密钥、Bearer、URL和敏感字段会脱敏；不记录请求头、上游原始错误响应或堆栈。过深/过大的诊断节点有截断标记。正常 `/api/intent` 响应仍附带 meta，失败 HTTP 响应包含具体校验原因但不回传该诊断意图；前端只把通过校验的 intent 交给 commitIntent → resolveIntent → dispatch。

定位时先看错误阶段：`provider` + 400 通常检查模型ID/Schema/参数，401/403检查凭据与地域权限，429检查限流；`network` 检查网络可达性；`timeout` 看等待是否达到 timeoutMs；`decode` 是上游 JSON/响应格式问题；`validation` 的 schema/target_constraint/operation_constraint/context/pending_operation 表示本地拦截；没有 error 但 issues 非空是可解析结果与语义预期不符。具体判断以实际报告为准。无论失败还是 REVIEW，都不为通过评测而放松 dispatch 的校验。

### 首次 Qwen 实测失败项分析

原始报告生成于 `2026-11-15T13:05:27.777Z`，结果7/12，总耗时17656ms。本次保留原报告，没有用模拟结果覆盖它，也没有重新调用真实模型。5个失败请求均约1.4–2.0秒；三条校验失败的上游状态均为200，本轮没有看到超时或接口配置失败。

| 用例 | 已有证据 | 本次处理 |
| --- | --- | --- |
| colloquial-small-step | 正确定位FR，但下降输出relative/-0.1，预期+0.1 | 提示词明确0=关闭、1=打开，下降增加开度，上升减少开度；不增加该句的方向匹配规则 |
| colloquial-reference | validation / intent_constraint，旧报告没有意图 | 增加校验前意图、具体原因和路径；通用契约说明command与clarify的字段含义，下一轮确认真实原因 |
| colloquial-pending-reply | validation / context，输入有有效pending、没有active | 可能误用active续接来源，旧报告不能证实具体输出；提示词区分pending/context，并要求继承pending原动作，不放松上下文校验 |
| unclear-target-and-amount | clarify的候选为四窗，预期空列表，其余字段一致 | 同一未限定候选空间，修正语义比较；只重比较原结果即可消除这条表示差异，不算模型理解能力提升 |
| known-side-unknown-front-rear | validation / intent_constraint，旧报告没有意图 | 保留左侧范围与追问约束，等待新诊断判断是否为ids/candidates/source等契约错误 |

新增6条不同表达位于 `scripts/intent-language-cases.json`，总计18条：`副驾驶那块玻璃往下挪一丁点`、`前排乘客那片玻璃往上收一丁点`、`沿用刚才那扇，往上抬一丁点`、`挑后排那个就好`、`选靠前的那一块玻璃`、`有块玻璃给我降一丁点`。分别覆盖正负相对方向、active引用、左右不同候选的pending补答、目标不明追问。这些句子只作为测试数据，不进入生产匹配或提示词。模拟回归验证拒绝原因、脱敏、空/四窗等价及侧向/pending约束仍生效；不代表真实模型已理解正确。重新运行 `npm run eval:intent` 后，再根据新报告的具体输出判断提示词与校验逻辑的职责。

### 第二轮 Qwen 实测：15/18

报告生成于 `2026-11-15T13:18:25.501Z`，结果15/18。此次仅调整 `server/intent.mjs` 的通用提示词，保留18条用例、评测标准和共享校验条件；原报告没有覆盖，也没有重新请求真实模型。

| 剩余问题 | 实际输出与判断 | 提示词调整 |
| --- | --- | --- |
| unseen-recognition-errors | 模型定位RR后输出relative/+0.1，而预期是absolute/0.5或安全追问 | 区分目标比例与少量相对变化，10个百分点不能作为未知幅度的默认动作；无法可靠恢复语音原意时追问，不凑成可执行命令 |
| known-side-unknown-front-rear | 校验前输出command，目标为FL和RL，delta=-0.1，被单窗相对约束拦截 | 说明玻璃下降→开口变大→开度增加，升高则相反；单窗位置的多个候选不能合并成多窗操作，规则未确认歧义不代表目标明确 |
| alternate-unknown-target-small-step | 正确追问目标，但operation=null，丢失已经确定的小幅下降动作 | 目标、动作、幅度分开理解；仅缺目标时保留已知operation，不需要当前开度也能表达relative调整 |

这些是一般语义和输出契约，不把评测句或误识别词写进提示词或正则。物理方向也适用于clarify中暂存的动作。现有校验仍拒绝多窗相对操作、越界数值、无效上下文等输出；不通过放松校验或改变预期来提高通过率。重跑同一份 `npm run eval:intent` 评估提示词效果，网页实测前重启后端加载新提示词。

## 网页验收用例

启动前后端后打开 `http://127.0.0.1:5173`。先用文字入口排除ASR影响，再把同一句换成麦克风。每组开始前点击“全关”并等运动结束，清空旧上下文。除专门测试运动中操作的步骤外，等待当前动画完成后再说下一句。

| 用例 | 输入或操作 | 验收结果 |
| --- | --- | --- |
| 模型纠错 | `右后床开一半`；另测 `副座后头那扇玻离给我落到三成` | 显示原文、模型结果已校验；分别只有右后窗到50%/30%，高亮与目标一致，最终提示执行完成。Network 的 `/api/intent` 返回 command，点击、滑块同步展示同一状态 |
| 多轮追问与 pending | 依次输入 `开一半` → `右车窗` → `就后头那块` | 前两步都不运动，保留50%待执行动作，追问先缩小到右前/右后；最后一句走模型并承接 pending，只把右后窗设为50% |
| 模型续接与规则续接 | 上组执行完成后，依次输入 `刚才那块再多透一点风` → `再开一点` → `关上吧` | 模型引用有效右后窗上下文，随后规则沿用同窗；每次完成后依次60%、70%、0%，其他窗不动。相对操作基于执行时 current |
| 等待时手动操作 | 输入纠错句，出现“模型理解中”时选左前窗并把滑块调到30% | 旧请求被中止/忽略，右后窗不执行晚到命令，左前窗仅按手动操作运动；再输入 `再开一点` 应追问目标，不能默认选中的左前窗 |
| 等待时取消 | 输入纠错句，等待中点击取消；随后仅输入 `右后窗` | 旧结果不执行，pending和续接均为空；补位置不能恢复旧50%动作，应追问动作 |
| 否定、位置不明与越界 | 独立输入 `不要打开右后床`、`右车窗开一半`、`右后窗开到150%` | 分别提示否定/追问前后/幅度越界，无车窗运动；这些规则分支不请求模型 |
| 上下文过期 | 完成明确单窗操作后不再操作，等待超过60秒，再输入 `刚才那块再多透一点风` | 不引用过期目标，追问位置；旧 pending 超时后补位置也不能恢复旧动作 |

等待期间操作需要发生在响应到达前。模型过快时可先对浏览器网络启用慢速节流，使用文字入口重复，不必修改生产解析规则或给后端加入固定延迟。观察前端未执行状态和实际玻璃目标；仅看到 HTTP200 不代表已经经过 dispatch 执行。

## 并行指令批次

单条指令和复合指令共用 `store.prepareBatch` / `commitBatch`。前者调用 `shared/batch.mjs` 的纯校验函数，复制输入、不修改store；后者重新校验，统一读取全部current，计算相对开度后一次替换windows状态。所有动作检查通过前不会修改目标；相同车窗在多项中重复出现时，即使动作相同也整批拒绝。相对动作每项限一个车窗，幅度仍为±10个百分点；一批可以包含多个互不重叠的单窗相对动作。

批次ID沿用程序生成的输入ID，子项ID由程序生成 `${batchId}:${index}`，模型不能提供ID。记录按批次汇总原句，每窗保存所属itemId、目标开度、完成/替换/暂停状态。补答执行后记录归回原批次；手动操作只替换涉及车窗的未完成记录。

`shared/clauses.mjs` 保留分句；有明确动作的并列分句进入批次解析，定位或代词中的口语停顿仍保留为单句。规则全部能理解则直接准备批次，否则由模型返回 `{type,items:[{clause,intent}]}`，clauses必须逐项对应原文，不允许丢弃未理解的分句。每项使用单项协议并按自己的分句约束校验，不用整句的50%去校验其他项。模型的批次项不继承旧active/pending，省略目标需追问；现有单句续接和补答继续使用有效上下文。原来的单句协议兼容保留。前后端均执行批次校验。

`pendingBatch` 暂存整句及各项，只把当前待补位置项映射到原有pending上下文给模型。回复补全后整批重新校验，不能边追问边执行。期限60秒，补答不延期；取消、手动操作和到期同时清空pendingBatch/pendingAction。等待模型时仍使用交互版本、对话版本和截止时间拦截晚到响应。

多窗批次成功提交后清空单窗续接目标；“再开一点”先追问目标，补位置只执行新的相对动作，不重放旧批次。只涉及单窗的成功指令继续建立该窗的60秒上下文。

规则允许清楚的并列表达及带明确请求前缀的礼貌句（如“帮我把右前车窗打开好吗”）；否定、能力询问、条件及明确先后顺序仍不执行。不支持的混合项不会被过滤掉后执行剩余部分。

验证：`npm run test:commands` 包含 `scripts/batch.test.ts`；`node scripts/test-intent-server.mjs` 包含模型批次Schema、分句约束与遗漏项拒绝。`npm run eval:intent` 现在在原18条上追加 `scripts/intent-batch-cases.json` 的2条真实模型样例，共20条；模拟测试不代表真实模型准确率。

网页验收：
1. 输入“前排车窗开一半，后排全部关上”，确认一条记录内前窗50%、后窗0%。
2. 输入“开一半，右后窗关上”，整批应不动；补“左前窗”后一起执行。
3. 动画期间手动改右前窗，原记录只有右前标为替换，其他窗最终完成。
4. 输入“前排半开，右前窗关闭”，整批不执行。
5. 多窗批次后说“再开一点”，必须追问；补一个位置后按该窗提交时current计算。

### 请求式表达与顿号（修正）

`shared/clauses.mjs` 的 requestContent 统一处理明确代操作请求包装，例如“能不能帮我…”“可不可以帮我…好吗”。分类器先识别该包装，再检查内容的否定与查询语义，避免把“能不能”内部的“不能”当作否定操作；不把所有问号都当成请求。能力/状态查询及请求包装内的否定仍不能执行。服务端提示词已同步区分这些语义。

分句保留原文字符与位置：顿号、逗号等只有在动作之间才形成批次边界，位置枚举与共用动作保留在同一分句。模型响应的clause仍按原始分句校验，语义校验使用去除请求包装后的对应分句，避免末尾礼貌问句被单独误拦。枚举车窗暂由模型理解，不代表只枚举的位置直接执行。

可复现验证：`npm run test:commands` 会运行 `scripts/request-language.test.ts`，直接打印 classifyText、parseVehicleText 的实际结果及store执行结果。请求“能不能帮我把前排开一半、后排关上”分类为model_fallback（复合输入初筛），批次规则解析为matched，得到FL/FR absolute .5和RL/RR absolute 0，store执行。能力/状态/否定样例不提交动作。`node scripts/test-intent-server.mjs` 同时验证请求式模型批次能通过校验，查询与否定在调用提供方前拦截。此处的接口测试使用模拟模型，不声称验证真实模型理解率。
