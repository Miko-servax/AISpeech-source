import {splitClauses,requestContent,type BatchItem} from '../../shared/batch.mjs';
import { classifyText, RuleReason, type Reason } from '../../shared/intent.mjs';
export { RuleReason };
import { windowIds, type WindowId } from '../config/v8-windows';
export type CommandSource = 'button' | 'slider' | 'text' | 'voice' | 'playback';
export type Operation = { kind: 'absolute'; value: number } | { kind: 'relative'; delta: number };
export type VehicleCommand = { id: string; source: CommandSource; targets: WindowId[]; openness: number; text?: string; operation?: Operation };
export type ParseResult = ({ ok: true; targets: WindowId[]; operation: Operation | null; unresolvedTarget?: boolean; candidates?: WindowId[]; cancel?: boolean;items?:BatchItem[] } | { ok: false; message: string; clearTarget?: boolean }) & { reason?: Reason };
const fail = (message: string, clearTarget = false, reason: Reason = RuleReason.Ambiguous): ParseResult => ({ ok: false, message, clearTarget, reason });
function chineseNumber(s: string): number {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === '一百' || s === '百') return 100;
  const digits: Record<string, number> = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
  if(s.includes('十')) { const [a,b] = s.split('十'); return (a ? digits[a]! : 1)*10+(b ? digits[b]! : 0); }
  return digits[s] ?? NaN;
}
/** Pure grammar. Omitted target and target-only replies are resolved by the store. */
function parseKnownText(raw: string): ParseResult {
  let t=raw.normalize('NFKC').replace(/[\s，。！？、,.!?]/g,'').replace(/驾驶员|驾驶位/g,'主驾');
  if(!t) return fail('没有听清，请重新说一次。');
  if(t.length>120) return fail('请一次说一条车窗指令。');
  t=t.replace(/^(请|麻烦|帮我|把)+/,'').replace(/(?:吧|一下|谢谢)+$/,'');
  if(/^取消(?:待执行(?:的)?动作|操作|指令|对话)?$/.test(t))return {ok:true,targets:[],operation:null,cancel:true};
  if(/不|别|取消|能否|能不能|是否|吗|还是|或者|然后/.test(t)) return fail('请明确说出一条车窗指令，或单独说“取消”。');
  let targets: WindowId[]=[];
  let candidates: WindowId[] | undefined;
  const passenger=/副驾(?:座位)?(?:后面|后边|后方|后排)/.test(t),driver=/主驾(?:座位)?(?:后面|后边|后方|后排)/.test(t);
  const all=/所有(?:的)?(?:车)?窗|全部(?:的)?(?:车)?窗|四(?:个|扇)?(?:车)?窗/.test(t);
  if(all&&/主驾|副驾|左|右|前|后/.test(t))return fail('目标位置有冲突，请明确要操作哪些车窗。',true);
  if(all)targets=[...windowIds];
  else {
    if(passenger)targets.push('RR');if(driver)targets.push('RL');
    const rest=t.replace(/副驾(?:座位)?(?:后面|后边|后方|后排)/g,'').replace(/主驾(?:座位)?(?:后面|后边|后方|后排)/g,'');
    if(/左前|前左|主驾/.test(rest))targets.push('FL');if(/右前|前右|副驾/.test(rest))targets.push('FR');
    if(/左后|后左/.test(rest))targets.push('RL');if(/右后|后右/.test(rest))targets.push('RR');
    if(/前(?:排)?(?:车)?窗/.test(rest)&&!/左|右|主驾|副驾/.test(rest))targets.push('FL','FR');
    if(/后(?:排)?(?:车)?窗/.test(rest)&&!/左|右|主驾|副驾/.test(rest))targets.push('RL','RR');
    const plural=/两个|两扇|两侧|都|所有|全部/.test(rest);
    if(/左(?:(?:侧|边)?(?:的)?(?:两个|两扇)?(?:车窗|窗户|窗))/.test(rest)) {
      if(plural)targets.push('FL','RL');else candidates=['FL','RL'];
    }
    if(/右(?:(?:侧|边)?(?:的)?(?:两个|两扇)?(?:车窗|窗户|窗))/.test(rest)) {
      if(candidates)return fail('目标位置有冲突，请明确车窗位置。',true);
      if(plural)targets.push('FR','RR');else candidates=['FR','RR'];
    }
    targets=[...new Set(targets)];
    if(candidates&&targets.length&&targets.some(id=>!candidates!.includes(id)))return fail('目标位置有冲突，请明确车窗位置。',true);
    if(targets.length>1&&!/两个|两扇|两侧|前窗|后窗|前排|后排|左侧|右侧|左边|右边|和|及/.test(t))return fail('目标位置有冲突，请明确车窗位置。',true);
  }
  const close=/关|升/.test(t),open=/开|降/.test(t);
  if(close&&open)return fail('同时听到了打开和关闭，请只说一个动作。');
  if(!close&&!open){
    const reply=t.replace(/^(是|就|那个|操作|选)/,'');
    if(/^(?:左|右)(?:侧|边)?(?:的)?(?:车窗|窗户|窗)?$/.test(reply)) {
      return {ok:true,targets:[],operation:null,candidates:reply.startsWith('左')?['FL','RL']:['FR','RR']};
    }
    if(/^(?:前|后)(?:面|排)?(?:的)?(?:车窗|窗户|窗)?$/.test(reply)) {
      return {ok:true,targets:[],operation:null,candidates:reply.startsWith('前')?['FL','FR']:['RL','RR']};
    }
    if(targets.length&&/^(?:左前|前左|右前|前右|左后|后左|右后|后右|主驾|副驾|左|右)(?:的)?(?:车窗|窗户|窗)?$/.test(reply))return {ok:true,targets,operation:null};
    return fail('没有听清动作，请说打开、关闭或开到一半。',/左|右|主驾|副驾|前|后/.test(t)&&!targets.length);
  }
  if(/再|一点/.test(t)) {
    const action=t.replace(/(?:左前|前左|右前|前右|左后|后左|右后|后右|主驾|副驾|左|右)?(?:的)?(?:车窗|窗户|窗)/g,'').replace(/^(?:左前|右前|左后|右后|主驾|副驾)/,'');
    if(!/^(?:再)?(?:开|打开|降|降下|关|关闭|升|升起)(?:一点)$/.test(action))return fail('相对调整请说“再开一点”或“再关一点”。');
    return {ok:true,targets,candidates,unresolvedTarget:!targets.length&&/左|右|前|后|主驾|副驾/.test(t),operation:{kind:'relative',delta:close?-.1:.1}};
  }
  const percentages=[...t.matchAll(/百分之([零一二两三四五六七八九十百\d.]+)|([\d.]+)%/g)];
  if(percentages.length>1)return fail('出现多个开度，请一次指定一个目标开度。');
  const half=/一半|半开|开(?:到)?半/.test(t);
  if(close&&(half||percentages.length))return fail('关闭幅度有歧义，请改说“开到50%”或“全部关闭”。');
  if(half&&percentages.length)return fail('开度有冲突，请只指定一个目标开度。');
  const value=close?0:percentages.length?chineseNumber(percentages[0]![1]??percentages[0]![2]!)/100:half?.5:1;
  if(!Number.isFinite(value)||value<0||value>1)return fail('开度应在0%到100%之间。',false,RuleReason.InvalidMagnitude);
  if((!percentages.length&&!half&&/[\d零一二三四五六七八九十百半]/.test(t.replace(/四(?:个|扇)?(?:车)?窗|两个|两扇/g,'')))||/成|三分|四分|多少|一些/.test(t))return fail('请用一半或明确的百分比描述开度。');
  // Target omitted is only accepted for a constrained follow-up phrase.
  if(!targets.length&&!/窗|主驾|副驾/.test(t)&&!/^(?:打开|开|关上|关闭|关|升上|升起|降下)(?:到)?(?:一半|半|百分之[零一二两三四五六七八九十百\d.]+|[\d.]+%)?$/.test(t))return fail('没有听清车窗指令，请重新说一次。');
  return {ok:true,targets,candidates,unresolvedTarget:!targets.length&&/左|右|前|后|主驾|副驾/.test(t),operation:{kind:'absolute',value}};
}
export function makeCommand(source: CommandSource, targets: WindowId[], openness: number, text?: string): VehicleCommand {
  return { id: crypto.randomUUID(), source, targets, openness, text };
}

/** Only fully matched grammar can reach the synchronous rule executor. */
export function parseVehicleText(raw: string): ParseResult & { reason: Reason } {
  const reason=classifyText(raw);
  const clauses=splitClauses(requestContent(raw));
  if(clauses.length>1&&reason===RuleReason.ModelFallback){
    const parsed=clauses.map(part=>parseVehicleText(part));
    if(parsed.every(p=>p.ok&&!p.cancel))return {ok:true,targets:[],operation:null,items:parsed.map(p=>{if(!p.ok)throw new Error();return {targets:p.targets,operation:p.operation,candidates:p.candidates};}),reason:RuleReason.Matched};
    if(parsed.some(p=>!p.ok&&p.reason!==RuleReason.ModelFallback))return {...fail('部分指令尚不明确，请重新说明整句。',true),reason:RuleReason.Ambiguous};
    return {...fail('正在理解复合指令。',false,RuleReason.ModelFallback),reason:RuleReason.ModelFallback};
  }
  if(reason!==RuleReason.Matched && reason!==RuleReason.Cancel){
    const messages: Partial<Record<Reason,string>>={empty:'没有听清，请重新说一次。',negated:'识别到否定表达，不执行车窗动作。',non_imperative:'请用明确的肯定指令说明车窗操作。',ambiguous:'动作或幅度有歧义，请明确位置及开度。',invalid_magnitude:'开度应为明确的0%到100%。',unsupported_device:'当前仅支持四个车窗。',unsupported_expression:'当前不支持这条表达，请明确说明车窗和动作。',model_fallback:'规则未覆盖，等待模型理解。'};
    return {ok:false,message:messages[reason]||'请重新说明车窗指令。',reason,clearTarget:reason===RuleReason.Ambiguous&&/左|右|主驾|副驾/.test(raw)};
  }
  const friendly=requestContent(raw).replace(/^(?:请|麻烦|帮我|帮忙|把)+/,'').replace(/^(前排|后排)(?=(?:全部|全|开|关|半开))/,'$1车窗').replace(/全部(?=关|开)/,'全');
  const parsed=parseKnownText(friendly.replace(/^(请|麻烦|帮我)(.*)好吗[？?]?$/,'$1$2'));
  return {...parsed,reason:parsed.reason??(parsed.ok&&parsed.cancel?RuleReason.Cancel:parsed.ok&&(parsed.candidates?.length||parsed.unresolvedTarget)?RuleReason.Ambiguous:RuleReason.Matched)};
}
