import assert from 'node:assert/strict';
import {createPinia,setActivePinia} from 'pinia';
import {parseVehicleText,makeCommand} from '../src/commands/vehicle-command';
import {useVehicleStore,DIALOGUE_TTL} from '../src/stores/vehicle';
import {FinalResults} from '../src/voice/final-results';
import {VoiceTurns} from '../src/voice/voice-turns';
function fresh(){setActivePinia(createPinia());return useVehicleStore();}
for(const [text,targets,value] of [
 ['副驾后面的车窗开一半',['RR'],.5],['关闭所有车窗',['FL','FR','RL','RR'],0],['主驾后面的窗户打开',['RL'],1],['右前车窗开到百分之三十',['FR'],.3],['左前窗开到25%',['FL'],.25],['两个后窗全部打开',['RL','RR'],1],['副驾车窗关闭',['FR'],0],['所有车窗半开',['FL','FR','RL','RR'],.5],
] as const){const r=parseVehicleText(text);assert.ok(r.ok,text);assert.deepEqual(r.targets,[...targets]);assert.deepEqual(r.operation,{kind:'absolute',value});}
for(const text of ['','左前窗开20','左前窗开三分之一','不要打开右后车窗','右后窗关闭一半','左前窗打开再关闭','左前窗开到130%','主驾副驾打开','左前窗开到50%然后右后窗打开'])assert.equal(parseVehicleText(text).ok,false,text);
let store=fresh();const now=Date.now();
assert.equal(store.submitText('副驾车窗开一半','text').status,'executed');assert.equal(store.dialogueContext?.target,'FR');store.windows.FR.current=.32;
assert.equal(store.submitText('再开一点','text').status,'executed');assert.ok(Math.abs(store.windows.FR.target-.42)<1e-9);assert.equal(store.windows.FR.current,.32);assert.equal(store.lastCommand?.baseCurrent,.32);
store.windows.FR.current=.97;store.submitText('再开一点','text');assert.equal(store.windows.FR.target,1);store.windows.FR.current=.04;store.submitText('再关一点','text');assert.equal(store.windows.FR.target,0);
store.submitText('关上吧','text');assert.equal(store.windows.FR.target,0);store.submitText('打开吧','text');assert.equal(store.windows.FR.target,1);
store.submitText('关闭所有车窗','text');assert.equal(store.dialogueContext,null);assert.equal(store.submitText('再开一点','text').status,'clarify');assert.ok(store.pendingAction);store.windows.FR.current=.25;assert.equal(store.submitText('右前窗','text').status,'executed');assert.equal(store.windows.FR.target,.35);assert.equal(store.pendingAction,null);assert.equal(store.dialogueContext?.target,'FR');
// Pending absolute action, duplicate final, failure does not refresh deadline.
store=fresh();assert.equal(store.submitText('开一半','text','question',undefined,now).status,'clarify');const deadline=store.pendingAction!.expiresAt;assert.equal(deadline,now+DIALOGUE_TTL);assert.equal(store.submitText('开一半','text','question',undefined,now+1000).status,'ignored');store.submitText('没听清','text','bad',undefined,now+2000);assert.equal(store.pendingAction?.expiresAt,deadline);store.submitText('右后窗','text','reply',undefined,now+3000);assert.equal(store.windows.RR.target,.5);assert.equal(store.pendingAction,null);
// Expiry is checked at submit as well as tick (background tab).
store=fresh();store.submitText('开一半','text','p',undefined,now);store.submitText('右前窗','text','late',undefined,now+DIALOGUE_TTL);assert.equal(store.lastCommand,null);assert.equal(store.pendingAction,null);
store.submitText('副驾车窗开一半','text','set',undefined,now);store.submitText('再开一点','text','expired',undefined,now+DIALOGUE_TTL);assert.equal(store.dialogueContext,null);assert.equal(store.pendingAction?.operation.kind,'relative');
// Manual selection, same selection, slider, button and playback all clear context and pending.
for(const manual of [(s:ReturnType<typeof fresh>)=>s.selectWindow('RL'),(s:ReturnType<typeof fresh>)=>s.selectWindow(s.selected),(s:ReturnType<typeof fresh>)=>s.setWindow('FR',.8,'slider'),(s:ReturnType<typeof fresh>)=>s.setAll(0),(s:ReturnType<typeof fresh>)=>s.togglePlayback()]){
 store=fresh();store.submitText('开一半','text');const version=store.interactionVersion;manual(store);assert.equal(store.pendingAction,null);assert.equal(store.dialogueContext,null);assert.ok(store.interactionVersion>version);assert.notEqual(store.submitText('右前窗','text').status,'executed');
 store=fresh();store.submitText('副驾车窗开一半','text');manual(store);assert.equal(store.dialogueContext,null);
}
// Context confusion never falls back to old target; new full command supersedes pending.
store=fresh();store.submitText('副驾车窗开一半','text');store.submitText('主驾副驾打开','text');assert.equal(store.dialogueContext,null);store.submitText('再开一点','text');store.submitText('左后窗全开','text');assert.equal(store.pendingAction,null);assert.equal(store.windows.RL.target,1);assert.equal(store.dialogueContext?.target,'RL');
// Start-time version fencing: no result yet -> manual -> first start/interim/final arrives late.
for(const first of ['sentence_start','interim','final']){
 store=fresh();store.submitText('副驾车窗开一半','text');const turns=new VoiceTurns();turns.begin(store.interactionVersion);store.selectWindow('RL');turns.bind('s');
 const event={session:'s',index:0};if(first!=='final')turns.observe(event);const version=turns.final(event);assert.notEqual(version,null);
 assert.equal(store.submitText('再开一点','voice','s:0',version!).status,'ignored');assert.equal(store.pendingAction,null);assert.equal(store.dialogueContext,null);assert.equal(store.windows.RL.target,0);
 assert.equal(turns.final(event),null);assert.equal(turns.final({session:'other',index:1}),null);
}
store=fresh();const turns=new VoiceTurns();turns.begin(store.interactionVersion);turns.bind('s');turns.observe({session:'s',index:0});store.selectWindow('RL');assert.equal(store.submitText('右车窗开一半','voice','s:0',turns.final({session:'s',index:0})!).status,'ignored');
// A new recording can answer an earlier question; stopped recordings retain the dialogue.
turns.begin(store.interactionVersion);turns.bind('s2');let version=turns.final({session:'s2',index:0})!;store.submitText('再开一点','voice','s2:0',version);assert.ok(store.pendingAction);turns.begin(store.interactionVersion);turns.bind('s3');version=turns.final({session:'s3',index:0})!;assert.equal(store.submitText('右前窗','voice','s3:0',version).status,'executed');assert.equal(store.windows.FR.target,.1);
const originalDeadline=store.dialogueContext!.expiresAt;assert.equal(store.submitText('右前窗','voice','s3:0',version).status,'ignored');assert.equal(store.dialogueContext!.expiresAt,originalDeadline);
// New sentence in one uninterrupted recording can continue; out-of-order older finals are ignored.
turns.begin(store.interactionVersion);turns.bind('s4');version=turns.final({session:'s4',index:1})!;store.submitText('关上吧','voice','s4:1',version);assert.equal(store.windows.FR.target,0);assert.equal(turns.final({session:'s4',index:0}),null);
// A stale result must not clear a newer text context or create a pending action.
store=fresh();const oldVersion=store.interactionVersion;store.selectWindow('RL');store.submitText('右后窗开一半','text');const newContext=store.dialogueContext;assert.equal(store.submitText('再开一点','voice','late-recording:0',oldVersion).status,'ignored');assert.deepEqual(store.dialogueContext,newContext);assert.equal(store.pendingAction,null);
// A named but unresolved position cannot reuse an older front passenger target.
store.submitText('后面的车窗开一半','text');assert.equal(store.dialogueContext,null);assert.ok(store.pendingAction);assert.equal(store.windows.FR.target,0);
// Same recording: question followed by a target-only reply executes once.
store=fresh();const continuous=new VoiceTurns();continuous.begin(store.interactionVersion);continuous.bind('continuous');store.submitText('再开一点','voice','continuous:0',continuous.final({session:'continuous',index:0})!);assert.ok(store.pendingAction);assert.equal(store.submitText('右前窗','voice','continuous:1',continuous.final({session:'continuous',index:1})!).status,'executed');assert.equal(store.windows.FR.target,.1);
// Bare side never chooses front or both windows. Repeated clarifications retain original deadline.
for(const [side,front,rear] of [['右','FR','RR'],['左','FL','RL']] as const){
  let s=fresh();s.submitText('开一半','text','ask',undefined,now);const expires=s.pendingAction!.expiresAt;
  for(let i=0;i<2;i++){const result=s.submitText(side+'车窗','text','side'+i,undefined,now+1000+i);assert.equal(result.status,'clarify');assert.ok(result.message.includes(side+'前窗'));assert.equal(s.pendingAction!.expiresAt,expires);assert.equal(s.lastCommand,null);assert.equal(s.dialogueContext,null);}
  assert.equal(s.submitText(side+'后窗','text','specific',undefined,now+2000).status,'executed');assert.equal(s.windows[rear].target,.5);assert.equal(s.windows[front].target,0);
  s=fresh();s.submitText(side+'车窗开一半','text','side-action',undefined,now);assert.equal(s.lastCommand,null);assert.ok(s.pendingAction);assert.equal(s.submitText('后面','text','back',undefined,now+1000).status,'executed');assert.equal(s.windows[rear].target,.5);
  s=fresh();s.submitText('副驾车窗开一半','text');s.submitText(side+'车窗再开一点','text');assert.equal(s.dialogueContext,null);assert.ok(s.pendingAction);const target=s.windows.FR.target;s.submitText(side+'车窗','text');assert.equal(s.windows.FR.target,target);assert.equal(s.dialogueContext,null);
  s=fresh();s.submitText('开一半','text','q',undefined,now);s.submitText(side+'车窗','text','side',undefined,now+59000);s.submitText(side+'后窗','text','expired',undefined,now+60000);assert.equal(s.pendingAction,null);assert.equal(s.lastCommand,null);
}
// Cancellation is a distinct intent, clears both states, is idempotent and never replays the old action.
for(const source of ['text','voice'] as const){
  let s=fresh();let v=s.interactionVersion;s.submitText('再开一点',source,'q',v);v=s.interactionVersion;
  s.submitText('右车窗',source,'partial',v);const targets=JSON.stringify(s.windows);
  v=s.interactionVersion;assert.equal(s.submitText('取消',source,'cancel',v).status,'cancelled');assert.equal(s.pendingAction,null);assert.equal(s.dialogueContext,null);
  v=s.interactionVersion;assert.equal(s.submitText('取消',source,'cancel',v).status,'ignored');assert.notEqual(s.submitText('右后窗',source,'after-cancel',v).status,'executed');assert.equal(JSON.stringify(s.windows),targets);
  s=fresh();s.submitText('副驾车窗开一半',source,'seed',s.interactionVersion);v=s.interactionVersion;
  assert.equal(s.submitText('请取消吧',source,'clear-context',v).status,'cancelled');assert.equal(s.dialogueContext,null);const command=s.lastCommand!.id;
  v=s.interactionVersion;s.submitText('左后窗',source,'position-only',v);assert.equal(s.lastCommand!.id,command);assert.equal(s.pendingAction,null);
  s.submitText('左后窗开一半',source,'fresh-action',s.interactionVersion);assert.equal(s.windows.RL.target,.5);
}
assert.equal(parseVehicleText('不要取消').ok,false);
const plural=parseVehicleText('右侧两个车窗开一半');assert.ok(plural.ok);assert.deepEqual(plural.targets,['FR','RR']);
// Original final-only consumption and motion reversal.
const finals=new FinalResults();assert.equal(finals.accept('x',{type:'interim',index:0}),null);assert.ok(finals.accept('x',{type:'final',index:0}));assert.equal(finals.accept('x',{type:'final',index:0}),null);
store=fresh();store.dispatch(makeCommand('text',['RR'],.5));store.tick(1);const before=store.windows.RR.current;store.setWindow('RR',0,'slider');assert.equal(store.windows.RR.current,before);store.tick(.01);assert.ok(store.windows.RR.current<before&&store.windows.RR.current>0);store.tick(5);assert.equal(store.lastCommand?.status,'done');const command=store.lastCommand!;assert.equal(store.dispatch(command),false);
console.log('PASS: parsing, continuation, realtime ±10pp/clamp, pending clarification, partial side replies, cancel, TTL, all manual paths, late first/final-only results, session fence, dedup, out-of-order final and reversal');
