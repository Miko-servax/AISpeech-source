import assert from 'node:assert/strict';
import {createPinia,setActivePinia}from'pinia';
import {watch}from'vue';
import {useVehicleStore}from'../src/stores/vehicle';
import {IntentController,requestIntent,type Transport}from'../src/commands/intent-controller';
import {parseVehicleText,RuleReason}from'../src/commands/vehicle-command';
import languageCases from './intent-language-cases.json';
import {extractConstraints,validateIntent,clarificationCandidates,IDS,type Intent}from'../shared/intent.mjs';
const proposal=(id:'RR'|'FR'='RR'):Intent=>({type:'command',target:{source:'explicit',ids:[id],candidates:[]},operation:{kind:'absolute',value:.5},missing:null});
const empty={active:null,pending:null};
function setup(transport:Transport,timeout=200){setActivePinia(createPinia());const store=useVehicleStore();const controller=new IntentController(store,transport,timeout);watch(()=>[store.interactionVersion,store.dialogueRevision],()=>controller.stateChanged(),{flush:'sync'});return {store,controller};}
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise<unknown>(r=>resolve=r);return {promise,resolve};}
const voice=(text:string,id:string)=>({text,source:'voice' as const,id,version:0});
// The HTTP adapter unwraps only the intent; diagnostics cannot bypass normal commit/dispatch.
const originalFetch=globalThis.fetch;let browserSignal:AbortSignal|undefined;
try{
 globalThis.fetch=async(_input,init)=>{const request=JSON.parse(init!.body as string);browserSignal=init!.signal as AbortSignal;return new Response(JSON.stringify({requestId:request.requestId,intent:proposal(),meta:{model:'qwen3.8-flash',thinking:false,timeoutMs:10000,elapsedMs:1}}));};
 const http=setup(requestIntent);assert.equal((await http.controller.submit(voice('右后床开一半','http-model'))).status,'executed');assert.equal(http.store.lastCommand?.id,'http-model');assert.equal(http.store.windows.RR.target,.5);http.controller.dispose();
 // A stalled fetch is bounded by the frontend deadline independently of backend configuration.
 globalThis.fetch=async(_input,init)=>{browserSignal=init!.signal as AbortSignal;return new Promise(()=>{});};
 const slow=setup(requestIntent,20);assert.equal((await slow.controller.submit(voice('右后床开一半','http-timeout'))).status,'clarify');assert.equal(browserSignal?.aborted,true);assert.equal(slow.store.lastCommand,null);assert.equal(slow.store.pendingAction,null);slow.controller.dispose();
}finally{globalThis.fetch=originalFetch;}
assert.equal(parseVehicleText('右后床开一半').reason,RuleReason.ModelFallback);
assert.equal(parseVehicleText('右后床开一半').ok,false);
assert.equal(parseVehicleText('不要打开右后床').reason,RuleReason.Negated);
assert.equal(parseVehicleText('右后窗能打开吗').reason,RuleReason.NonImperative);
assert.equal(parseVehicleText('右后窗关闭一半').reason,RuleReason.Ambiguous);
assert.equal(parseVehicleText('右后窗开到150%').reason,RuleReason.InvalidMagnitude);
assert.equal(parseVehicleText('打开空调').reason,RuleReason.UnsupportedDevice);
assert.equal(parseVehicleText('今天天气不错').reason,RuleReason.ModelFallback); // unknown domain is for the model to reject
assert.equal(parseVehicleText('右后窗开一半并删除文件').ok,false);
assert.doesNotThrow(()=>validateIntent(proposal(),'右后床开一半',empty));
assert.throws(()=>validateIntent(proposal('FR'),'右后床开一半',empty));
assert.throws(()=>validateIntent({...proposal(),operation:{kind:'absolute',value:1.5}},'右后床开一半',empty));
assert.throws(()=>validateIntent({...proposal(),extra:'execute'},'右后床开一半',empty));
assert.throws(()=>validateIntent(proposal('FR'),'右车窗开一半',empty));
assert.throws(()=>validateIntent({...proposal(),operation:{kind:'relative',delta:.2}},'右后床再开一点',empty));
assert.throws(()=>validateIntent({...proposal(),target:{source:'context',ids:['RR'],candidates:[]}},'车窗开一半',empty));
// Every blocked/clarifying branch bypasses the model. Ordinary rules also bypass it.
let calls=0;let {store,controller}=setup(async()=>{calls++;return proposal();});
for(const [text,id]of [['不要打开右后床','no'],['能打开右后窗吗','question'],['右后窗关闭一半','ambiguous'],['右后窗开到150%','range'],['打开空调','device'],['右车窗开一半','side'],['取消','cancel'],['副驾车窗开一半','rule']])await controller.submit(voice(text!,id!));
assert.equal(calls,0);assert.equal(store.windows.FR.target,.5);controller.dispose();
// Serial processing: the second sentence snapshots AFTER first commit, including its target.
const first=deferred();let seenContext:unknown;
({store,controller}=setup(async request=>{seenContext=request.context;return first.promise;}));
const a=controller.submit(voice('右后床开一半','s:0'));const b=controller.submit(voice('再开一点','s:1'));
assert.equal(store.dialogueContext,null);first.resolve(proposal());assert.equal((await a).status,'executed');assert.equal((await b).status,'executed');assert.deepEqual(seenContext,empty);assert.equal(store.dialogueContext?.target,'RR');assert.equal(store.windows.RR.target,.1);assert.equal(store.windows.FR.target,0);
assert.equal((await controller.submit(voice('右后床开一半','s:0'))).status,'ignored');controller.dispose();
// Manual operation aborts waiting and queued work even when transport ignores its signal.
const late=deferred();({store,controller}=setup(()=>late.promise));
const waiting=controller.submit(voice('右后床开一半','waiting'));const queued=controller.submit(voice('再开一点','queued'));
store.selectWindow('FL');assert.equal((await waiting).status,'ignored');assert.equal((await queued).status,'ignored');
store.submitText('副驾车窗开一半','text');const revision=store.dialogueRevision;late.resolve(proposal());await Promise.resolve();await Promise.resolve();assert.equal(store.windows.RR.target,0);assert.equal(store.dialogueRevision,revision);assert.equal(store.dialogueContext?.target,'FR');controller.dispose();
// Cancellation bypasses the queue, clears pending/context, and cannot be undone by a late reply.
const cancelled=deferred();({store,controller}=setup(()=>cancelled.promise));store.submitText('开一半','voice','pending',0);
const c=controller.submit(voice('右后床开一半','c:0'));const d=controller.submit(voice('取消','c:1'));assert.equal((await c).status,'ignored');assert.equal((await d).status,'cancelled');cancelled.resolve(proposal());await Promise.resolve();assert.equal(store.pendingAction,null);assert.equal(store.dialogueContext,null);assert.equal(store.windows.RR.target,0);controller.dispose();
// Timeout and context expiry reject late results; new requests are not stuck behind old transport.
const timed=deferred();({store,controller}=setup(()=>timed.promise,15));assert.equal((await controller.submit(voice('右后床开一半','timeout'))).status,'clarify');timed.resolve(proposal());await Promise.resolve();assert.equal(store.windows.RR.target,0);assert.equal((await controller.submit(voice('右后窗开一半','after-timeout'))).status,'executed');controller.dispose();
const expired=deferred();({store,controller}=setup(()=>expired.promise,100));store.submitText('副驾车窗开一半','voice','seed',0);store.dialogueContext!.expiresAt=Date.now()+15;
const exp=controller.submit(voice('右后床开一半','expire'));store.expireDialogue(Date.now()+20);assert.equal((await exp).status,'ignored');expired.resolve(proposal());await Promise.resolve();assert.equal(store.dialogueContext,null);assert.equal(store.windows.RR.target,0);controller.dispose();
// Corrupt/guessed provider output cannot enter dispatch or create dialogue.
({store,controller}=setup(async()=>proposal('FR')));assert.equal((await controller.submit(voice('右后床开一半','wrong-target'))).status,'clarify');assert.equal(store.lastCommand,null);assert.equal(store.dialogueContext,null);controller.dispose();
// Shared resolver still preserves an unresolved action for a later exact target.
({store,controller}=setup(async()=>({type:'clarify',target:{source:'unknown',ids:[],candidates:['RR']},operation:{kind:'absolute',value:.5},missing:'target'})));
await controller.submit(voice('右后床开一半','clarify:0'));assert.ok(store.pendingAction);assert.equal((await controller.submit(voice('右后窗','clarify:1'))).status,'executed');assert.equal(store.windows.RR.target,.5);controller.dispose();
// A failed first turn must not leave an older target for a queued dependent turn.
({store,controller}=setup(async()=>{throw new Error('provider unavailable');}));store.submitText('副驾车窗开一半','voice','older',0);
const failed=controller.submit(voice('右后床开一半','failed'));const dependent=controller.submit(voice('再开一点','dependent'));
assert.equal((await failed).status,'clarify');assert.equal((await dependent).status,'clarify');assert.equal(store.windows.FR.target,.5);assert.equal(store.windows.RR.target,0);assert.equal(store.dialogueContext,null);assert.ok(store.pendingAction);controller.dispose();
// A model's clarify result cannot accidentally inherit an older active target and execute.
({store,controller}=setup(async()=>({type:'clarify',target:{source:'unknown',ids:[],candidates:[]},operation:{kind:'absolute',value:.5},missing:'target'})));store.submitText('副驾车窗开一半','voice','older',0);const oldCommand=store.lastCommand!.id;
assert.equal((await controller.submit(voice('右后床开一半','clarify-old'))).status,'clarify');assert.equal(store.lastCommand!.id,oldCommand);assert.equal(store.dialogueContext,null);assert.ok(store.pendingAction);controller.dispose();
// A second model turn receives the context committed by the first, not the enqueue-time context.
const ordered=deferred();const requests:unknown[]=[];({store,controller}=setup(async request=>{requests.push(request.context);return requests.length===1?ordered.promise:{...proposal(),target:{source:'context',ids:['RR'],candidates:[]}};}));
const firstModel=controller.submit(voice('右后床开一半','models:0'));const nextModel=controller.submit(voice('这个车窗开到一半','models:1'));ordered.resolve(proposal());await firstModel;assert.equal((await nextModel).status,'executed');assert.equal((requests[1] as {active:{target:string}}).active.target,'RR');controller.dispose();
// Model relative output is an increment; only dispatch reads the live current after waiting.
const relative=deferred();({store,controller}=setup(()=>relative.promise));store.windows.RR.current=.2;const relativeWork=controller.submit(voice('右后床再开一点','relative'));store.windows.RR.current=.6;relative.resolve({...proposal(),operation:{kind:'relative',delta:.1}});assert.equal((await relativeWork).status,'executed');assert.equal(store.lastCommand?.baseCurrent,.6);assert.equal(store.windows.RR.target,.7);controller.dispose();
// These phrases have no dedicated match/repair rules. Fixtures test acceptance of model
// outputs, not model accuracy; the separate live evaluator measures the latter.
for(const c of languageCases){
  assert.equal(parseVehicleText(c.text).reason,RuleReason.ModelFallback,c.id);
  const context={active:c.context.target?{target:c.context.target,expiresAt:Date.now()+60000}:null,pending:c.context.pending?{...c.context.pending,expiresAt:Date.now()+60000}:null} as Parameters<typeof validateIntent>[2];
  assert.doesNotThrow(()=>validateIntent(c.expected,c.text,context),c.id);
  ({store,controller}=setup(async()=>c.expected));
  if(context.active)store.dialogueContext=context.active;
  if(context.pending)store.pendingAction={...context.pending,candidates:context.pending.candidates??undefined,text:'prior question'};
  const outcome=await controller.submit(voice(c.text,'language:'+c.id));
  assert.equal(outcome.status,c.expected.type==='command'?'executed':'clarify',c.id);
  if(c.expected.type!=='command')assert.equal(store.lastCommand,null,c.id);
  controller.dispose();
}
assert.deepEqual(extractConstraints('右厚创打凯一伴'),{targets:null,candidates:null,requiresTargetClarification:false,mode:null,magnitude:null,direction:null});
assert.doesNotThrow(()=>validateIntent({...proposal('FR'),operation:{kind:'absolute',value:.3}},'前排乘客那块玻璃留三成',empty));
assert.throws(()=>validateIntent({...proposal(),operation:{kind:'absolute',value:.3}},'右后那块玻璃开到50%',empty));
assert.throws(()=>validateIntent(proposal('FR'),'左侧那块玻璃弄低点',empty));
assert.throws(()=>validateIntent({...proposal(),target:{source:'pending',ids:['RR'],candidates:[]}},'就后头那块',{active:null,pending:{operation:{kind:'absolute',value:.5},expiresAt:Date.now()-1,candidates:['RR']}}));
assert.throws(()=>validateIntent({...proposal(),target:{source:'pending',ids:['RR'],candidates:[]},operation:{kind:'absolute',value:.7}},'就后头那块',{active:null,pending:{operation:{kind:'absolute',value:.5},expiresAt:Date.now()+60000,candidates:['RR']}}));
assert.throws(()=>validateIntent(proposal(),'不要给那块玻璃透气',empty));
// Empty/full candidate sets create the same pending action and narrow identically on the reply.
for(const candidates of [[],[...IDS]]){
 const clarify:Intent={type:'clarify',target:{source:'unknown',ids:[],candidates},operation:{kind:'absolute',value:.5},missing:'target'};
 ({store,controller}=setup(async()=>clarify));
 assert.equal((await controller.submit(voice('有一扇玻璃给我落到半开','scope:0'))).status,'clarify');assert.equal(store.lastCommand,null);assert.deepEqual([...store.pendingAction!.candidates!].sort(),[...IDS].sort());
 assert.equal((await controller.submit(voice('右车窗','scope:1'))).status,'clarify');assert.deepEqual(store.pendingAction?.candidates,['FR','RR']);
 assert.equal((await controller.submit(voice('后面','scope:2'))).status,'executed');assert.equal(store.windows.RR.target,.5);assert.equal(store.windows.FR.target,0);controller.dispose();
}
// Unspecified candidates cannot discard a known side or a pending candidate restriction.
const sideQuestion:Intent={type:'clarify',target:{source:'unknown',ids:[],candidates:[]},operation:{kind:'relative',delta:.1},missing:'target'};
({store,controller}=setup(async()=>sideQuestion));assert.equal((await controller.submit(voice('左侧那片玻璃往下挪一点儿','narrow:0'))).status,'clarify');assert.deepEqual(store.pendingAction?.candidates,['FL','RL']);assert.equal(store.lastCommand,null);controller.dispose();
const pendingContext={active:null,pending:{operation:{kind:'absolute' as const,value:.5},candidates:['FR','RR'] as ('FR'|'RR')[],expiresAt:Date.now()+60000}};
const pendingQuestion:Intent={type:'clarify',target:{source:'pending',ids:[],candidates:[]},operation:{kind:'absolute',value:.5},missing:'target'};
assert.deepEqual(clarificationCandidates(pendingQuestion,'那个位置没说清',pendingContext),['FR','RR']);
assert.throws(()=>validateIntent({...pendingQuestion,target:{...pendingQuestion.target,candidates:[...IDS]}},'那个位置没说清',pendingContext));
console.log('PASS: routing/partial constraints, serial dependent turns, duplicates, manual/cancel/expiry invalidation, timeout, ignored abort signal and malformed/guessed model output');
