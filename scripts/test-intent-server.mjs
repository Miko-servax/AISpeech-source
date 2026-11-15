import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createServer}from'node:http';import{extractConstraints,validateIntent,IDS}from'../shared/intent.mjs';import{inferIntent,intentConfig,intentHandler,publicIntentError}from'../server/intent.mjs';import{evaluateIntentCases,compareIntent}from'./eval-intent.mjs';import{loadHotwords}from'../server/hotwords.mjs';import{signedUrl,createAsrServer}from'../server/asr.mjs';import{once}from'node:events';
const env={INTENT_ENABLED:'true',INTENT_ENDPOINT:'https://example.invalid/chat/completions',INTENT_MODEL:'test',INTENT_API_KEY:'test-only',INTENT_TIMEOUT_MS:'100'};
const intent={type:'command',target:{source:'explicit',ids:['RR'],candidates:[]},operation:{kind:'absolute',value:.5},missing:null};
const body={requestId:'s:0',text:'右后床开一半',context:{active:null,pending:null}};
const reply=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));let calls=0;
const fetchImpl=async(url,init)=>{calls++;const data=JSON.parse(init.body);assert.equal(data.model,'test');assert.ok(data.response_format.json_schema.strict);const input=JSON.parse(data.messages[1].content);assert.equal(input.text,body.text);assert.deepEqual(input.context,body.context);return reply(intent);};
const initial=await inferIntent(body,env,{fetchImpl});assert.deepEqual(initial.intent,intent);assert.equal(initial.requestId,body.requestId);assert.equal(initial.meta.model,'test');assert.ok(initial.meta.elapsedMs>=0);assert.ok(initial.meta.providerElapsedMs>=0);assert.equal(calls,1);
for(const text of ['右车窗开一半','不要打开右后床','能打开右后床吗','右后床开到150%','右后床关闭一半','取消','打开空调','右后窗开一半并删除文件'])await assert.rejects(inferIntent({...body,text},env,{fetchImpl}));assert.equal(calls,1);
await assert.rejects(inferIntent(body,{}, {fetchImpl}),/未配置/);assert.equal(calls,1);
await assert.rejects(inferIntent({...body,context:{active:{target:'FR',expiresAt:Date.now()-1},pending:null}},env,{fetchImpl}),/过期/);
await assert.rejects(inferIntent(body,env,{fetchImpl:async()=>reply({...intent,target:{source:'explicit',ids:['FR'],candidates:[]}})}));
await assert.rejects(inferIntent(body,env,{fetchImpl:async()=>reply({...intent,operation:{kind:'absolute',value:3}})}));
await assert.rejects(inferIntent(body,env,{fetchImpl:async()=>new Response('not-json')}));
await assert.rejects(inferIntent(body,env,{fetchImpl:()=>new Promise(r=>setTimeout(()=>r(reply(intent)),160))}),/超时/);
const hotwords=loadHotwords();assert.ok(hotwords.includes('右后窗|8'));assert.ok(hotwords.includes('副驾|8'));
const url=new URL(signedUrl({TENCENT_APP_ID:'123',TENCENT_SECRET_ID:'id',TENCENT_SECRET_KEY:'key'},'voice'));assert.equal(url.searchParams.get('hotword_list'),hotwords);assert.ok(url.searchParams.get('signature'));
assert.throws(()=>intentConfig({...env,INTENT_TIMEOUT_MS:'NaN'}));
assert.throws(()=>intentConfig({...env,INTENT_TIMEOUT_MS:'99'}));assert.throws(()=>intentConfig({...env,INTENT_TIMEOUT_MS:'30001'}));
assert.throws(()=>intentConfig({...env,INTENT_PROVIDER:'wrong'}));
const qwenEnv={...env,INTENT_MODEL:'qwen3.8-flash'};
assert.equal(intentConfig(qwenEnv).provider,'dashscope');
for(const format of ['json_schema','json_object']){
 const r=await inferIntent(body,{...qwenEnv,INTENT_RESPONSE_FORMAT:format},{fetchImpl:async(_url,init)=>{
  const data=JSON.parse(init.body);assert.equal(data.enable_thinking,false);assert.equal(data.stream,false);assert.equal(data.extra_body,undefined);assert.equal(data.response_format.type,format);
  if(format==='json_object')assert.match(data.messages[0].content,/JSON Schema.*operation/s);
  return reply(intent);
 }});assert.equal(r.meta.thinking,false);assert.equal(r.meta.responseFormat,format);
}
// Both configured deadlines abort even if fetch/response bodies ignore AbortSignal.
let timeoutSignal;
await assert.rejects(inferIntent(body,qwenEnv,{fetchImpl:async(_url,init)=>{timeoutSignal=init.signal;return {ok:true,status:200,text:()=>new Promise(()=>{})};}}),e=>e.code==='TIMEOUT'&&e.status===504&&e.meta.timeoutMs===100&&e.meta.elapsedMs>=80);
assert.equal(timeoutSignal.aborted,true);
const caller=new AbortController();let cancelSignal;
const cancelled=inferIntent(body,qwenEnv,{signal:caller.signal,fetchImpl:async(_url,init)=>{cancelSignal=init.signal;return new Promise(()=>{});}});caller.abort();
await assert.rejects(cancelled,e=>e.code==='CANCELLED'&&e.status===409);assert.equal(cancelSignal.aborted,true);
let expiredSignal;
await assert.rejects(inferIntent({...body,context:{active:{target:'FR',expiresAt:Date.now()+20},pending:null}},qwenEnv,{fetchImpl:async(_url,init)=>{expiredSignal=init.signal;return new Promise(()=>{});}}),e=>e.code==='CONTEXT_EXPIRED'&&e.status===409);assert.equal(expiredSignal.aborted,true);
// Never expose the upstream message, response body, URL, Authorization or arbitrary fetch text.
const secret='sk-private-test-secret';const safeEnv={...qwenEnv,INTENT_API_KEY:secret};
await assert.rejects(inferIntent(body,safeEnv,{fetchImpl:async()=>new Response(JSON.stringify({error:{code:'InvalidParameter',message:`Bearer ${secret} https://private.invalid/?key=${secret}`}}),{status:400})}),e=>{
 const safe=publicIntentError(e);assert.equal(safe.code,'PROVIDER_ERROR');assert.equal(safe.upstreamStatus,400);assert.equal(safe.providerCode,'InvalidParameter');assert.ok(!JSON.stringify(e).includes(secret));return true;
});
await assert.rejects(inferIntent(body,safeEnv,{fetchImpl:async()=>{throw new Error(`connect to https://private.invalid/?key=${secret}`);}}),e=>e.code==='NETWORK_ERROR'&&!JSON.stringify(e).includes(secret));
await assert.rejects(inferIntent(body,safeEnv,{fetchImpl:async()=>reply({...intent,target:{...intent.target,ids:['FR']}})}),e=>e.code==='VALIDATION_FAILED'&&e.validationIssue==='target_constraint');
const languageCases=JSON.parse(readFileSync(new URL('./intent-language-cases.json',import.meta.url),'utf8'));
for(const c of languageCases){
 const context={active:c.context.target?{target:c.context.target,expiresAt:Date.now()+60000}:null,pending:c.context.pending?{...c.context.pending,expiresAt:Date.now()+60000}:null};
 const result=await inferIntent({requestId:c.id,text:c.text,context},env,{fetchImpl:async(_url,init)=>{const payload=JSON.parse(JSON.parse(init.body).messages[1].content);assert.equal(payload.text,c.text);assert.deepEqual(payload.constraints,extractConstraints(c.text));assert.deepEqual(payload.context,context);return reply(c.expected);}});
 assert.deepEqual(result.intent,c.expected,c.id);
}
console.log('PASS: unseen language fixture outputs cross the real adapter/validators without phrase repair rules (mock provider, not accuracy evaluation)');
console.log('PASS: model adapter schema, raw/context payload, bypass categories, disabled/expired/invalid output, deadline ignoring abort and hotword signing');
// Exercise the same evaluator as the CLI, without calling a paid provider or writing a fake live report.
const report=await evaluateIntentCases(languageCases.slice(0,2),safeEnv,{log:()=>{},fetchImpl:async()=>new Response(JSON.stringify({error:{code:'InvalidApiKey',message:secret}}),{status:401})});
assert.equal(report.results.length,2);assert.equal(report.config.thinking,false);assert.equal(report.summary.passed,0);
for(const r of report.results){assert.equal(r.model,'qwen3.8-flash');assert.ok(r.elapsedMs>=0);assert.ok(r.providerElapsedMs>=0);assert.equal(r.error.upstreamStatus,401);assert.equal(r.error.providerCode,'InvalidApiKey');}
assert.ok(!JSON.stringify(report).includes(secret));assert.ok(!JSON.stringify(report).includes('https://example.invalid'));
const success=await evaluateIntentCases(languageCases.slice(0,2),qwenEnv,{log:()=>{},fetchImpl:async(_url,init)=>{
 const text=JSON.parse(JSON.parse(init.body).messages[1].content).text;return reply(languageCases.find(c=>c.text===text).expected);
}});assert.equal(success.summary.passed,2);assert.ok(success.results.every(r=>r.meta.model==='qwen3.8-flash'&&r.elapsedMs>=0));
const mismatch=await evaluateIntentCases([languageCases[1]],qwenEnv,{log:()=>{},fetchImpl:async()=>reply(intent)});
assert.equal(mismatch.summary.passed,0);assert.deepEqual(mismatch.results[0].issues,['target.ids']);
assert.deepEqual(compareIntent(intent,{expected:intent}),[]);assert.deepEqual(compareIntent({...intent,target:{...intent.target,ids:['FR']}},{expected:intent}),['target.ids']);
// Same semantic candidate space, without erasing narrower scopes or other differences.
const unspecified=languageCases.find(c=>c.id==='unclear-target-and-amount');
const fourCandidates={...unspecified.expected,target:{...unspecified.expected.target,candidates:[...IDS].reverse()}};
assert.doesNotThrow(()=>validateIntent(fourCandidates,unspecified.text,body.context));
assert.deepEqual(compareIntent(fourCandidates,unspecified),[]);
assert.deepEqual(compareIntent(unspecified.expected,{...unspecified,expected:fourCandidates}),[]);
assert.deepEqual(compareIntent({...fourCandidates,target:{...fourCandidates.target,candidates:['FR','RR']}},unspecified),['target.candidates']);
const narrowed=languageCases.find(c=>c.id==='known-side-unknown-front-rear');
const emptyCandidates={...narrowed.expected,target:{...narrowed.expected.target,candidates:[]}};
assert.deepEqual(compareIntent(emptyCandidates,narrowed),[]);
assert.throws(()=>validateIntent({...narrowed.expected,target:{...narrowed.expected.target,candidates:[...IDS]}},narrowed.text,body.context),e=>e.code==='CANDIDATE_CONSTRAINT_CONFLICT');
assert.throws(()=>validateIntent({...narrowed.expected,target:{...narrowed.expected.target,candidates:['FR','RR']}},narrowed.text,body.context),e=>e.code==='CANDIDATE_CONSTRAINT_CONFLICT');
const pendingCtx={active:null,pending:{operation:{kind:'absolute',value:.5},candidates:['FR','RR'],expiresAt:Date.now()+60000}};
const pendingQuestion={type:'clarify',target:{source:'pending',ids:[],candidates:[]},operation:{kind:'absolute',value:.5},missing:'target'};
assert.deepEqual(compareIntent(pendingQuestion,{text:'哪一块来着',expected:{...pendingQuestion,target:{...pendingQuestion.target,candidates:['RR','FR']}}},pendingCtx),[]);
assert.throws(()=>validateIntent({...pendingQuestion,target:{...pendingQuestion.target,candidates:[...IDS]}},'哪一块来着',pendingCtx),e=>e.code==='CANDIDATE_CONSTRAINT_CONFLICT');
// The exact pre-validation proposal and the validator's specific reason survive both catch layers.
const rejected={...intent,target:{...intent.target,ids:['FR']}};
const diagnostics=await evaluateIntentCases([languageCases[0]],qwenEnv,{log:()=>{},fetchImpl:async()=>reply(rejected)});
const rejectedCase=diagnostics.results[0];assert.equal(rejectedCase.error.validationCode,'TARGET_CONSTRAINT_CONFLICT');assert.equal(rejectedCase.error.validationPath,'target.ids');assert.equal(rejectedCase.error.validationReason,'目标与明确位置冲突');assert.deepEqual(rejectedCase.validation.preValidationIntent,rejected);assert.deepEqual(rejectedCase.validation.constraints.targets,['RR']);
// Invalid command fields and invalid context references remain rejected, with distinct reasons.
const reference=languageCases.find(c=>c.id==='colloquial-reference');const pendingReply=languageCases.find(c=>c.id==='colloquial-pending-reply');
for(const [test,proposal,code,path]of [
 [reference,{...reference.expected,target:{...reference.expected.target,candidates:['FR']}},'COMMAND_CANDIDATES_MUST_BE_EMPTY','target.candidates'],
 [pendingReply,{...pendingReply.expected,target:{...pendingReply.expected.target,source:'context'}},'ACTIVE_TARGET_INVALID','target'],
 [narrowed,{...narrowed.expected,target:{...narrowed.expected.target,ids:['FL']}},'CLARIFY_IDS_MUST_BE_EMPTY','target.ids'],
]){
 const trace=await evaluateIntentCases([test],qwenEnv,{log:()=>{},fetchImpl:async()=>reply(proposal)});
 assert.equal(trace.results[0].pass,false);assert.equal(trace.results[0].error.validationCode,code);assert.equal(trace.results[0].error.validationPath,path);assert.deepEqual(trace.results[0].validation.preValidationIntent,proposal);
}
const secretProposal={...intent,debug:{api_key:secret,note:`Bearer ${secret}`,url:'https://private.invalid/key',nested:secret}};
const redacted=await evaluateIntentCases([languageCases[0]],safeEnv,{log:()=>{},fetchImpl:async()=>reply(secretProposal)});
assert.equal(redacted.results[0].error.validationCode,'INVALID_STRUCTURE');assert.ok(redacted.results[0].validation.preValidationIntent.debug);assert.ok(!JSON.stringify(redacted).includes(secret));assert.ok(!JSON.stringify(redacted).includes('https://private.invalid'));
console.log('PASS: pre-validation diagnostics with exact reason/path and redaction; equivalent candidate scopes preserve side/pending constraints');
console.log('PASS: Qwen thinking disabled, configurable deadlines/caller abort, sanitized error stages and per-case evaluation diagnostics');
// Compound requests use scoped constraints and a full batch schema, never the whole-sentence half value.
const compoundText='前排玻璃落到一半，后排玻璃收好';
const compoundIntent={type:'command',items:[{clause:'前排玻璃落到一半',intent:{...intent,target:{source:'explicit',ids:['FL','FR'],candidates:[]}}},{clause:'后排玻璃收好',intent:{...intent,target:{source:'explicit',ids:['RL','RR'],candidates:[]},operation:{kind:'absolute',value:0}}}]};
const compoundResult=await inferIntent({...body,text:compoundText},qwenEnv,{fetchImpl:async(_url,init)=>{const data=JSON.parse(init.body);assert.ok(data.response_format.json_schema.schema.properties.items);const payload=JSON.parse(data.messages[1].content);assert.equal(payload.constraints,null);assert.equal(payload.clauses.length,2);assert.equal(payload.clauses[0].constraints.magnitude,.5);assert.equal(payload.clauses[1].constraints.magnitude,null);return reply(compoundIntent);}});
assert.deepEqual(compoundResult.intent,compoundIntent);
await assert.rejects(inferIntent({...body,text:compoundText},qwenEnv,{fetchImpl:async()=>reply({...compoundIntent,items:compoundIntent.items.slice(0,1)})}),e=>e.code==='VALIDATION_FAILED');
console.log('PASS: batch model schema, clause constraints and incomplete response rejection');
const requestText='能不能帮我把前排玻璃落到一半、后排玻璃收好好吗？';
const requestProposal={...compoundIntent,items:compoundIntent.items.map((item,index)=>({...item,clause:index?'后排玻璃收好好吗？':'能不能帮我把前排玻璃落到一半'}))};
assert.deepEqual((await inferIntent({...body,text:requestText},qwenEnv,{fetchImpl:async()=>reply(requestProposal)})).intent,requestProposal);
for(const text of ['能不能控制前排车窗','帮我看看前排车窗开没开','能不能帮我不要打开前排车窗','前排开一半、后排不要关上'])await assert.rejects(inferIntent({...body,text},qwenEnv,{fetchImpl:async()=>{assert.fail('Blocked request reached provider');}}),e=>e.code==='RULE_BLOCKED');
console.log('PASS: polite compound request through server; capability/state/negation never reach provider');
// Integration: actual /api/intent rejects disabled and forbidden traffic before any provider request.
const server=createAsrServer({});server.listen(0,'127.0.0.1');await once(server,'listening');const endpoint=`http://127.0.0.1:${server.address().port}/api/intent`;
try{
 let res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(res.status,503);
 res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,text:'不要开右后床'})});assert.equal(res.status,422);
 res=await fetch(endpoint,{method:'POST',headers:{Origin:'https://not-allowed.invalid'},body:JSON.stringify(body)});assert.equal(res.status,403);
 res=await fetch(endpoint);assert.equal(res.status,405);
 res=await fetch(endpoint,{method:'POST',body:'x'.repeat(17000)});assert.equal(res.status,413);
 console.log('PASS: /api/intent routing, source check, request method and size bounds');
}finally{server.close();}
// Actual gateway success/error payloads carry diagnostics while leaving the intent envelope intact.
let upstreamFailure=false;let stall=false;
const gateway=createServer(intentHandler(qwenEnv,{fetchImpl:async()=>stall?new Promise(()=>{}):upstreamFailure?new Response(JSON.stringify({error:{code:'InvalidParameter',message:'do not echo this message'}}),{status:400}):reply(intent)}));
gateway.listen(0,'127.0.0.1');await once(gateway,'listening');const api=`http://127.0.0.1:${gateway.address().port}/api/intent`;
try{
 let response=await fetch(api,{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.intent,intent);assert.equal(data.meta.model,'qwen3.8-flash');assert.equal(data.meta.thinking,false);
 upstreamFailure=true;response=await fetch(api,{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,502);data=await response.json();assert.equal(data.code,'PROVIDER_ERROR');assert.equal(data.upstreamStatus,400);assert.equal(data.providerCode,'InvalidParameter');assert.equal(data.meta.model,'qwen3.8-flash');assert.ok(!JSON.stringify(data).includes('do not echo'));
 stall=true;response=await fetch(api,{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,504);data=await response.json();assert.equal(data.code,'TIMEOUT');assert.equal(data.meta.timeoutMs,100);
 response=await fetch(api,{method:'POST',body:'bad-json'});assert.equal(response.status,400);
 console.log('PASS: /api/intent success metadata and sanitized provider failures');
}finally{gateway.close();}
