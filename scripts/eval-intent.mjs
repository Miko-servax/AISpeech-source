// Calls the live provider adapter, not the browser/API gateway; never dispatches vehicle actions.
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {inferIntent,intentConfig,publicIntentError} from '../server/intent.mjs';
import {classifyText,RuleReason,clarificationCandidates} from '../shared/intent.mjs';

const sameIds=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const sameOperation=(a,b)=>a===null||b===null?a===b:a.kind===b.kind&&Math.abs((a.value??a.delta)-(b.value??b.delta))<1e-6;
export function compareIntent(intent,test,context={active:null,pending:null}){
  const expected=test.expected;
  if(expected.items){
    if(intent.type!==expected.type)return ['type'];
    if(!Array.isArray(intent.items)||intent.items.length!==expected.items.length)return ['items'];
    return expected.items.flatMap((item,index)=>compareIntent(intent.items[index].intent,{text:item.clause,expected:item.intent},context).map(issue=>`items.${index}.${issue}`));
  }

  if(!(test.acceptableTypes??[expected.type]).includes(intent.type))return ['type'];
  // Some severe recognition errors explicitly permit a safe clarification instead of guessing.
  if(intent.type!==expected.type)return [];
  const issues=[];
  if(intent.type==='command'){
    if(!sameIds(intent.target.ids,expected.target.ids))issues.push('target.ids');
    if(intent.target.source!==expected.target.source)issues.push('target.source');
    if(!sameOperation(intent.operation,expected.operation))issues.push('operation');
  }else if(intent.type==='clarify'){
    if(intent.missing!==expected.missing)issues.push('missing');
    if(!sameIds(clarificationCandidates(intent,test.text??'',context),clarificationCandidates(expected,test.text??'',context)))issues.push('target.candidates');
    if(!sameOperation(intent.operation,expected.operation))issues.push('operation');
  }
  return issues;
}
export async function evaluateIntentCases(cases,env,{fetchImpl,log=console.log}={}){
  const config=intentConfig(env);const results=[];
  for(const c of cases){
    const started=performance.now();const requestId='eval:'+c.id;
    const context={active:c.context.target?{target:c.context.target,expiresAt:Date.now()+60000}:null,
      pending:c.context.pending?{...c.context.pending,expiresAt:Date.now()+60000}:null};
    let result;
    const common={id:c.id,requestId,text:c.text,context,expected:c.expected,
      ...(c.acceptableTypes?{acceptableTypes:c.acceptableTypes}:{}),model:config.model};
    if(classifyText(c.text)!==RuleReason.ModelFallback){
      result={...common,pass:false,elapsedMs:Math.round(performance.now()-started),providerElapsedMs:null,
        error:{code:'EVAL_ROUTING',stage:'routing',message:'评测用例被规则覆盖或拦截，未调用模型'}};
    }else try{
      const {intent,meta}=await inferIntent({requestId,text:c.text,context},env,{fetchImpl});
      const issues=compareIntent(intent,c,context);
      result={...common,pass:issues.length===0,elapsedMs:Math.round(performance.now()-started),
        providerElapsedMs:meta.providerElapsedMs,meta,intent,issues};
    }catch(error){
      result={...common,pass:false,elapsedMs:Math.round(performance.now()-started),providerElapsedMs:error.meta?.providerElapsedMs??null,
        meta:error.meta,error:publicIntentError(error),...(error.diagnostics?{validation:error.diagnostics}:{})};
    }
    results.push(result);
    log(`${result.pass?'PASS':'REVIEW'} ${c.id} | ${result.elapsedMs}ms | ${result.model}`+
      (result.error?` | ${result.error.code} [${result.error.stage}]${result.error.upstreamStatus?' upstream='+result.error.upstreamStatus:''}${result.error.providerCode?' '+result.error.providerCode:''}: ${result.error.validationCode?result.error.validationCode+' ('+result.error.validationPath+'): '+result.error.validationReason:result.error.message}`:
        result.issues.length?` | mismatch: ${result.issues.join(', ')}`:''));
  }
  return {kind:'live-provider-evaluation',version:3,generatedAt:new Date().toISOString(),
    path:'provider-adapter',config:{model:config.model,provider:config.provider,thinking:config.thinking,
      timeoutMs:config.timeoutMs,responseFormat:config.format},
    summary:{passed:results.filter(r=>r.pass).length,total:results.length,
      totalElapsedMs:results.reduce((sum,r)=>sum+r.elapsedMs,0)},results};
}
async function main(){
  let config;try{config=intentConfig(process.env);}catch{
    console.error('配置无效：请检查 INTENT_TIMEOUT_MS、INTENT_PROVIDER 和 INTENT_RESPONSE_FORMAT。');process.exitCode=2;return;
  }
  if(!config.enabled||!config.endpoint||!config.model||!config.key){
    console.log('SKIP: 模型未配置，未调用真实模型；请先配置 INTENT_*，再运行 npm run eval:intent。');process.exitCode=2;return;
  }
  console.log(`模型 ${config.model} | 后端超时 ${config.timeoutMs}ms | 思考 ${config.thinking===false?'关闭':'由提供方决定'} | ${config.format}`);
  const cases=['intent-language-cases.json','intent-batch-cases.json'].flatMap(file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8')));
  const report=await evaluateIntentCases(cases,process.env);
  await mkdir('.cache',{recursive:true});await writeFile('.cache/intent-eval-report.json',JSON.stringify(report,null,2));
  console.log(`真实模型评测通过 ${report.summary.passed}/${report.summary.total}，报告 .cache/intent-eval-report.json；未执行车辆动作。`);
  if(report.summary.passed!==report.summary.total)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
