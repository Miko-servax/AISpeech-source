import {IDS,operationValid,validateIntent,intentSchema,IntentValidationError} from './intent.mjs';
// Preserve clause boundaries for scoped constraints; never assign one clause's number to another.
import {splitClauses,requestContent} from './clauses.mjs';
export {splitClauses,requestContent};
export function prepareBatch(items){
  if(!Array.isArray(items)||!items.length||items.length>4)throw new Error('一次最多支持四项车窗操作。');
  const seen=new Set();const copy=items.map(item=>{
    if(!item||!Array.isArray(item.targets)||item.targets.some(id=>!IDS.includes(id)))throw new Error('无效车辆目标');
    if(!operationValid(item.operation))throw new Error('无效车窗动作或幅度');
    for(const id of item.targets){if(seen.has(id))throw new Error('同一车窗出现多次，请明确每扇车窗只执行一个动作。');seen.add(id);}
    if(item.candidates&&(!Array.isArray(item.candidates)||item.candidates.some(id=>!IDS.includes(id))))throw new Error('无效候选车窗');
    if(item.operation?.kind==='relative'&&item.targets.length>1)throw new Error('相对调整请指定一个车窗。');
    return {targets:[...item.targets],operation:item.operation?{...item.operation}:null,...(item.candidates?{candidates:[...item.candidates]}:{})};
  });
  return {items:copy,ready:copy.every(item=>item.targets.length&&item.operation),missingIndex:copy.findIndex(item=>!item.targets.length||!item.operation)};
}
export const batchSchema={type:'object',additionalProperties:false,required:['type','items'],properties:{type:{enum:['command','clarify','unsupported']},items:{type:'array',minItems:1,maxItems:4,items:{type:'object',additionalProperties:false,required:['clause','intent'],properties:{clause:{type:'string'},intent:intentSchema}}}}};
export function validateBatchIntent(value,raw,context,now=Date.now()){
  const fail=(message,path='$')=>{throw new IntentValidationError('INVALID_BATCH',message,path);};
  if(!value||Object.keys(value).sort().join()!=='items,type'||!['command','clarify','unsupported'].includes(value.type)||!Array.isArray(value.items))fail('批次结构无效');
  const clauses=splitClauses(raw);
  if(clauses.length<2||clauses.length>4||value.items.length!==clauses.length)fail('批次必须完整覆盖每个分句');
  const semanticClauses=splitClauses(requestContent(raw));
  const items=value.items.map((item,index)=>{
    if(!item||Object.keys(item).sort().join()!=='clause,intent'||item.clause!==clauses[index])fail('分句与原文不一致',`items.${index}.clause`);
    const intent=validateIntent(item.intent,semanticClauses[index]??item.clause,{active:null,pending:null},now);
    return intent;
  });
  const unsupported=items.some(i=>i.type==='unsupported');const clarify=items.some(i=>i.type==='clarify');
  if(value.type!==(unsupported?'unsupported':clarify?'clarify':'command'))fail('批次状态与子项不一致');
  const seen=new Set();for(const intent of items)for(const id of intent.target.ids){if(seen.has(id))fail('同一车窗出现多次，整批未执行','items');seen.add(id);}
  return value;
}
