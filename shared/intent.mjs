import {splitClauses,requestContent} from './clauses.mjs';
export const RuleReason = Object.freeze({Matched:'matched',Cancel:'cancel',Empty:'empty',Negated:'negated',NonImperative:'non_imperative',Ambiguous:'ambiguous',InvalidMagnitude:'invalid_magnitude',UnsupportedDevice:'unsupported_device',UnsupportedExpression:'unsupported_expression',ModelFallback:'model_fallback'});
export const IDS=['FL','FR','RL','RR'];
export function normalize(raw){return raw.normalize('NFKC').replace(/[\s，。！？、,.!?]/g,'').replace(/驾驶员|驾驶位/g,'主驾').replace(/^(请|麻烦|帮我|把)+/,'').replace(/(?:吧|一下|谢谢)+$/,'');}
const location='(?:副驾(?:座位)?(?:后面|后边|后方|后排)|主驾(?:座位)?(?:后面|后边|后方|后排)|左前|右前|左后|右后|前左|前右|后左|后右|主驾|副驾|左(?:侧|边)?|右(?:侧|边)?|前(?:面|排)?|后(?:面|排)?|所有|全部|四个|四扇|两个前|两个后|前|后)';
const target=`${location}(?:的)?(?:两个|两扇)?(?:车窗|窗户|窗)?`;
const amount='(?:一半|半|百分之[零一二两三四五六七八九十百\\d.]+|[\\d.]+%)';
const action=`(?:(?:全部|全)?(?:打开|开启|开|降下|降|关闭|关上|关|升起|升上|升)(?:到)?${amount}?|半开|全开|全关|(?:再)?(?:打开|开|降下|降|关闭|关|升起|升)一点)`;
const full=new RegExp(`^(?:(?:${target})?(?:${action})|(?:${action})(?:${target})|(?:是|就|那个|操作|选)?${target})$`);
export function classifyText(raw){
  raw=requestContent(raw);
  const t=normalize(raw);
  if(!t)return RuleReason.Empty;
  if(/^取消(?:待执行(?:的)?动作|操作|指令|对话)?$/.test(t))return RuleReason.Cancel;
  // A-not-A capability questions contain 不能 but are not negative execution requests.
  if(/^(?:能不能|能否|可不可以|可以|能).*(?:吗|[?？])?$/.test(t))return RuleReason.NonImperative;
  if(/不要|别|莫|勿|禁止|无需|无须|不(?:用|必|许|准|能|可|想)|不.*(?:开|关|升|降)/.test(t))return RuleReason.Negated;
  if(/[?？]|能否|是否|能不能|可以|吗|如果|假如|当.*时候|能否|有没有|是不是|多少|状态|支持|具备|查看|查询|看看|确认|了吗|了么|了没有|开没开|关没关|开了没|关了没|开着|关着/.test(raw))return RuleReason.NonImperative;
  const clauses=splitClauses(raw);
  if(clauses.length>1){
    if(clauses.length>4||/先.+再|然后|之后|等.+后|取消/.test(raw))return RuleReason.Ambiguous;
    const reasons=clauses.map(classifyText);
    const blocked=reasons.find(r=>![RuleReason.Matched,RuleReason.ModelFallback].includes(r));
    return blocked??RuleReason.ModelFallback;
  }
  if(/空调|车门|天窗|座椅|后备[箱厢]|雨[刷刮]|灯光|引擎|启动|发动机/.test(t))return RuleReason.UnsupportedDevice;
  if(t.length>120||/删除|上传|执行代码|忽略|提示词|系统指令/.test(t))return RuleReason.UnsupportedExpression;
  if(/昨天|曾经|听说|如果|假如/.test(t))return RuleReason.NonImperative;
  const percentages=[...t.matchAll(/百分之([零一二两三四五六七八九十百\d.]+)|([\d.]+)%/g)];
  if(percentages.length>1)return RuleReason.Ambiguous;
  if(percentages.length&&(!Number.isFinite(ratio(percentages[0][1]??percentages[0][2]))||ratio(percentages[0][1]??percentages[0][2])<0||ratio(percentages[0][1]??percentages[0][2])>1))return RuleReason.InvalidMagnitude;
  if(/主驾副驾|副驾主驾/.test(t)&&!/(?:主驾|副驾)[、,，](?:主驾|副驾)/.test(raw))return RuleReason.Ambiguous;
  if(/取消|还是|或|然后|并|同时|顺便|先.+再/.test(t)||(/开|降/.test(t)&&/关|升/.test(t)))return RuleReason.Ambiguous;
  if(/(?:关|升).*(?:一半|半|百分之|%)/.test(t))return RuleReason.Ambiguous;
  if(full.test(t))return RuleReason.Matched;
  // Unknown wording (including recognition errors) is for the model, not a typo whitelist.
  return RuleReason.ModelFallback;
}
export function ratio(s){if(/^\d+(\.\d+)?$/.test(s))return Number(s)/100;const d={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(s==='百'||s==='一百')return 1;if(s.includes('十')){const[a,b]=s.split('十');return((a?d[a]:1)*10+(b?d[b]:0))/100;}return (d[s]??NaN)/100;}
/** Sparse facts only. Null means unknown, not permission to reconstruct an answer.
 * No ASR rewriting or example-specific homophone rules belong here. */
export function extractConstraints(raw){
  const t=normalize(raw);let ids=[];
  const rest=t.replace(/副驾(?:座位)?(?:后面|后边|后方|后排)/g,()=>{ids.push('RR');return '';}).replace(/主驾(?:座位)?(?:后面|后边|后方|后排)/g,()=>{ids.push('RL');return '';});
  for(const [re,id]of [[/左前|前左|主驾(?:的)?(?:车窗|窗户|窗|玻璃)/,'FL'],[/右前|前右|副驾(?:的)?(?:车窗|窗户|窗|玻璃)/,'FR'],[/左后|后左/,'RL'],[/右后|后右/,'RR']])if(re.test(rest))ids.push(id);
  for(const match of raw.matchAll(/(主驾|副驾)(?:的)?(?:车窗|窗户|窗)?(?=\s*[、，,])/g))ids.push(match[1]==='主驾'?'FL':'FR');
  if(/所有.*窗|全部.*窗|四[个扇]?车?窗/.test(t))ids=[...IDS];
  if(!ids.length&&/前排(?:的)?车?窗|两个前窗/.test(t))ids=['FL','FR'];
  if(!ids.length&&/后排(?:的)?车?窗|两个后窗/.test(t))ids=['RL','RR'];
  let candidates=null;
  if(!ids.length){
    if(/右(?:侧|边|车窗|窗户|窗)/.test(t))candidates=['FR','RR'];
    else if(/左(?:侧|边|车窗|窗户|窗)/.test(t))candidates=['FL','RL'];
    else if(/后(?:排|面的)?(?:车窗|窗户|窗)/.test(t))candidates=['RL','RR'];
    else if(/前(?:排|面的)?(?:车窗|窗户|窗)/.test(t))candidates=['FL','FR'];
  }
  const p=[...t.matchAll(/百分之([零一二两三四五六七八九十百\d.]+)|([\d.]+)%/g)];
  let magnitude=p.length===1?ratio(p[0][1]??p[0][2]):/一半|半开|开到?半/.test(t)?.5:null;
  let mode=null;
  if(/(?:开|降|升|设置)(?:到|为)|开一半|半开/.test(t))mode='absolute';
  if(/再(?:开|关|降|升)一点/.test(t)){mode='relative';magnitude=.1;}
  const open=/打开|开启|开到|开一半|开一点|降下|降一点/.test(t),close=/关闭|关上|升起|升上|关一点|升一点/.test(t);
  const direction=open!==close?(open?1:-1):null;
  return {targets:ids.length?[...new Set(ids)]:null,candidates,requiresTargetClarification:!!candidates&&full.test(t),mode,magnitude,direction};
}
const keys=(o,expected)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...expected].sort().join(',');
const idsOk=a=>Array.isArray(a)&&a.length<=4&&new Set(a).size===a.length&&a.every(x=>IDS.includes(x));
export function operationValid(o){return o===null||keys(o,['kind',o?.kind==='absolute'?'value':'delta'])&&(o.kind==='absolute'?Number.isFinite(o.value)&&o.value>=0&&o.value<=1:o.kind==='relative'&&[.1,-.1].includes(o.delta));}
const sameOperation=(a,b)=>a&&b&&a.kind===b.kind&&(a.kind==='absolute'?a.value===b.value:a.delta===b.delta);
export class IntentValidationError extends Error {
  constructor(code,message,path){super(message);this.name='IntentValidationError';this.code=code;this.path=path;}
}
const invalid=(code,message,path)=>{throw new IntentValidationError(code,message,path);};
const clarificationScope=(target,constraints,pending)=>constraints.targets??constraints.candidates??(target.source==='pending'?pending?.candidates:null)??IDS;
/** For an already validated clarification, [] means the scope is unspecified, not zero windows.
 * Known constraints still bound the scope. Never use this to filter invalid explicit candidates. */
export function clarificationCandidates(intent,raw,context,now=Date.now()){
  const pending=context.pending&&context.pending.expiresAt>now?context.pending:null;
  return [...(intent.target.candidates.length?intent.target.candidates:clarificationScope(intent.target,extractConstraints(raw),pending))];
}
function checkOperationConstraints(operation,c){
  if(!operation)return;
  if(c.mode&&operation.kind!==c.mode)invalid('OPERATION_MODE_CONFLICT','动作类型与明确表达冲突','operation.kind');
  if(c.magnitude!==null){const amount=operation.kind==='absolute'?operation.value:Math.abs(operation.delta);if(Math.abs(amount-c.magnitude)>1e-9)invalid('MAGNITUDE_CONFLICT','幅度与明确数值冲突','operation');}
  if(c.direction&&operation.kind==='relative'&&Math.sign(operation.delta)!==c.direction)invalid('DIRECTION_CONFLICT','方向与明确动作冲突','operation.delta');
}
export function validateIntent(intent,raw,context,now=Date.now()){
  validateContext(context);
  if(!keys(intent,['type','target','operation','missing']))invalid('INVALID_STRUCTURE','模型意图字段结构无效','$');
  if(!['command','clarify','unsupported'].includes(intent.type))invalid('INVALID_TYPE','模型意图类型无效','type');
  if(!keys(intent.target,['source','ids','candidates']))invalid('INVALID_TARGET_STRUCTURE','模型目标字段结构无效','target');
  if(!['explicit','context','pending','unknown'].includes(intent.target.source))invalid('INVALID_TARGET_SOURCE','模型目标来源枚举无效','target.source');
  if(!idsOk(intent.target.ids))invalid('INVALID_TARGET_IDS','模型目标列表结构无效','target.ids');
  if(!idsOk(intent.target.candidates))invalid('INVALID_CANDIDATES','模型候选列表结构无效','target.candidates');
  if(!operationValid(intent.operation))invalid('INVALID_OPERATION','模型动作结构或幅度无效','operation');
  if(![null,'target','action','amount'].includes(intent.missing))invalid('INVALID_MISSING','模型追问字段枚举无效','missing');
  const t=intent.target,c=extractConstraints(raw),active=context.active&&context.active.expiresAt>now?context.active:null,pending=context.pending&&context.pending.expiresAt>now?context.pending:null;
  if(intent.type==='unsupported'){if(intent.operation||intent.missing||t.ids.length||t.candidates.length||t.source!=='unknown')invalid('INVALID_UNSUPPORTED','无效的不支持结果：必须无目标、动作与追问','$');return intent;}
  const reason=classifyText(raw);
  if([RuleReason.Cancel,RuleReason.Empty,RuleReason.Negated,RuleReason.NonImperative,RuleReason.InvalidMagnitude,RuleReason.UnsupportedDevice,RuleReason.UnsupportedExpression].includes(reason))invalid('RULE_BLOCKED','规则禁止将此输入转为车窗操作','type');
  if(reason===RuleReason.Ambiguous&&intent.type==='command')invalid('AMBIGUITY_REQUIRES_CLARIFY','已知歧义必须追问','type');
  checkOperationConstraints(intent.operation,c);
  if(intent.type==='clarify'){
    if(!intent.missing)invalid('CLARIFY_MISSING_REQUIRED','无效追问：missing不能为null','missing');
    if(t.ids.length)invalid('CLARIFY_IDS_MUST_BE_EMPTY','无效追问：ids必须为空，已知范围放在candidates','target.ids');
    if(t.source==='context')invalid('CLARIFY_CONTEXT_SOURCE','无效追问：source不能为context，追问不能带入执行目标','target.source');
    if(t.source==='pending'&&!pending)invalid('PENDING_UNAVAILABLE','待执行上下文已失效','target.source');
    const allowed=clarificationScope(t,c,pending);
    if(t.candidates.some(id=>!allowed.includes(id)))invalid('CANDIDATE_CONSTRAINT_CONFLICT','追问候选与已知约束冲突','target.candidates');
    if(t.source==='pending'&&intent.operation&&!sameOperation(intent.operation,pending.operation))invalid('PENDING_OPERATION_CHANGED','不能改写待执行动作','operation');
    return intent;
  }
  if(intent.missing!==null)invalid('COMMAND_MISSING_MUST_BE_NULL','执行意图不完整：missing必须为null','missing');
  if(!intent.operation)invalid('COMMAND_OPERATION_REQUIRED','执行意图不完整：必须有动作','operation');
  if(!t.ids.length)invalid('COMMAND_TARGET_REQUIRED','执行意图不完整：必须有目标','target.ids');
  if(t.candidates.length)invalid('COMMAND_CANDIDATES_MUST_BE_EMPTY','执行意图不完整：candidates必须为空','target.candidates');
  if(c.targets&&[...c.targets].sort().join()!==[...t.ids].sort().join())invalid('TARGET_CONSTRAINT_CONFLICT','目标与明确位置冲突','target.ids');
  if(c.candidates){
    const narrowed=t.source==='pending'&&pending?.candidates?c.candidates.filter(id=>pending.candidates.includes(id)):c.candidates;
    if(t.ids.some(id=>!narrowed.includes(id)))invalid('SIDE_CONSTRAINT_CONFLICT','目标与已知侧向约束冲突','target.ids');
    if(c.requiresTargetClarification&&(narrowed.length!==1||t.ids.length!==1||t.ids[0]!==narrowed[0]))invalid('TARGET_STILL_AMBIGUOUS','目标仍不明确，必须追问','target.ids');
  }
  if(t.source==='explicit'){
    // Model may understand new expressions without regex targets. Known facts still bind.
  }else if(t.source==='context'){
    if(c.targets||!active||t.ids.length!==1||t.ids[0]!==active.target)invalid('ACTIVE_TARGET_INVALID','续接目标无效：必须引用有效active且与其单窗目标一致，不能覆盖明确新位置','target');
  }else if(t.source==='pending'){
    if(!pending||t.ids.length!==1||pending.candidates&&!pending.candidates.includes(t.ids[0]))invalid('PENDING_TARGET_INVALID','待执行目标无效：必须从有效pending的候选中确定一个车窗','target');
    if(!sameOperation(intent.operation,pending.operation))invalid('PENDING_OPERATION_CHANGED','不能改写待执行动作','operation');
  }else invalid('COMMAND_TARGET_SOURCE_UNKNOWN','目标来源无效：执行时source不能为unknown','target.source');
  if(intent.operation.kind==='relative'&&t.ids.length!==1)invalid('RELATIVE_SINGLE_TARGET_REQUIRED','相对操作只能是单窗','target.ids');
  return intent;
}
export const intentSchema={type:'object',additionalProperties:false,required:['type','target','operation','missing'],properties:{type:{type:'string',enum:['command','clarify','unsupported']},target:{type:'object',additionalProperties:false,required:['source','ids','candidates'],properties:{source:{type:'string',enum:['explicit','context','pending','unknown']},ids:{type:'array',items:{type:'string',enum:IDS},maxItems:4},candidates:{type:'array',items:{type:'string',enum:IDS},maxItems:4}}},operation:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['kind','value'],properties:{kind:{const:'absolute'},value:{type:'number',minimum:0,maximum:1}}},{type:'object',additionalProperties:false,required:['kind','delta'],properties:{kind:{const:'relative'},delta:{type:'number',enum:[-.1,.1]}}}]},missing:{enum:[null,'target','action','amount']}}};
export function validateContext(c){
  if(!keys(c,['active','pending']))throw new Error('无效对话上下文');
  if(c.active!==null&&(!keys(c.active,['target','expiresAt'])||!IDS.includes(c.active.target)||!Number.isFinite(c.active.expiresAt)))throw new Error('无效续接上下文');
  if(c.pending!==null&&(!keys(c.pending,['operation','expiresAt','candidates'])||!c.pending.operation||!operationValid(c.pending.operation)||!Number.isFinite(c.pending.expiresAt)||!(c.pending.candidates===null||idsOk(c.pending.candidates))))throw new Error('无效待执行上下文');
  return c;
}
