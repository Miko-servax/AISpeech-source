<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { IntentController, createIntentTransport } from '../commands/intent-controller';
import {parseVehicleText,RuleReason} from '../commands/vehicle-command';
import { useVehicleStore } from '../stores/vehicle';
import { VoiceTurns } from '../voice/voice-turns';
import { windowConfig } from '../config/v8-windows';
import { FinalResults } from '../voice/final-results';
import { createMicrophone } from '../voice/microphone';
import {staticPreview,apiBase,assetUrl} from '../config/runtime';
import {apiEndpoints} from '../../shared/api-endpoints.mjs';
const api=apiEndpoints(apiBase,location.origin);
const props=defineProps<{ready:boolean}>();const store=useVehicleStore();const input=ref('');const transcript=ref('');const hint=ref('点击麦克风开始，结束时再次点击。');const phase=ref('idle');const finalResults=new FinalResults();const active= computed(()=>['connecting','ready','finishing'].includes(phase.value));
const audioLevel=ref(0);const sentBytes=ref(0);
const resultId=ref('');const issue=ref('');const detail=ref('');const turns=new VoiceTurns();let session='';let finalCount=0;
const understanding=ref('规则优先');const busy=ref(false);let displayVersion=0;
const configuredTimeout=Number(import.meta.env.VITE_INTENT_TIMEOUT_MS||12000);
const metadata=new Map<string,{model?:string;elapsedMs?:number}>();
const transport=staticPreview?async()=>{throw new Error('在线预览暂未开放 AI 理解，请使用明确指令，例如“右后窗开一半”。');}:createIntentTransport((id,meta)=>metadata.set(id,meta),api.intent);
const controller=new IntentController(store,transport,Number.isFinite(configuredTimeout)?Math.max(100,Math.min(30000,configuredTimeout)):12000,state=>{understanding.value=state;busy.value=controller.isBusy();});
watch(()=>[store.interactionVersion,store.dialogueRevision],()=>controller.stateChanged(),{flush:'sync'});
async function execute(text:string,source:'text'|'voice',id=crypto.randomUUID() as string,version?:number){
  const display=++displayVersion;transcript.value=text;issue.value='';detail.value='';resultId.value='';busy.value=true;
  const started=Date.now();
  const outcome=await controller.submit({text,source,id,version});
  store.record({id:outcome.id||id,source,text,started,targets:{},message:outcome.message,route:parseVehicleText(text).reason===RuleReason.ModelFallback?(staticPreview?'AI 理解暂未开放':'模型理解'):'规则处理',model:metadata.get(id)?.model,elapsedMs:Date.now()-started});
  metadata.delete(id);
  if(display!==displayVersion)return;
  busy.value=controller.isBusy();resultId.value=outcome.id||'';
  issue.value=outcome.status==='executed'?'':outcome.message;
  detail.value=outcome.status==='executed'?outcome.message:'';
}
const microphone=createMicrophone(event=>{
  if(event.type==='progress')hint.value=event.message||'正在连接…';
  if(event.type==='level'){audioLevel.value=event.level||0;sentBytes.value=event.sentBytes||0;}
  if(event.type==='connecting'){audioLevel.value=0;sentBytes.value=0;controller.invalidate('新录音已开始，旧理解请求失效。');displayVersion++;turns.begin(store.interactionVersion);phase.value='connecting';hint.value='正在连接并请求麦克风…';transcript.value='';issue.value='';resultId.value='';finalCount=0;}
  if(event.type==='ready'){session=event.session!;turns.bind(session);phase.value='ready';hint.value='正在聆听，请说出车窗指令。';}
  if(event.type==='sentence_start')turns.observe(event);
  if(event.type==='interim' && event.session===session){turns.observe(event);transcript.value=event.text||'';}
  if(event.type==='final' && event.session===session){const accepted=finalResults.accept(session,event);if(accepted){const version=turns.final(event);if(version!==null){finalCount++;execute(accepted.text,'voice',accepted.id,version);}}}
  if(event.type==='finishing'){phase.value='finishing';hint.value='录音已停止，等待最终识别结果…';}
  if(event.type==='done'){phase.value='idle';hint.value=finalCount?'本次识别结束。':'没有听清，请靠近麦克风重新说一次。';}
  if(event.type==='error'){controller.invalidate('录音连接中断，请重新说明。');phase.value='error';hint.value=event.message?.includes('错误 6001')?'腾讯云ASR当前账号不支持境外后端调用；AI文字控车仍可使用。':event.message||'语音识别失败，请重试。';}
  if(event.type==='closed'&&phase.value!=='error'){phase.value='idle';}
},{healthUrl:api.health,asrUrl:api.asr,workletUrl:assetUrl('pcm-worklet.js'),startupTimeoutMs:api.remote?90000:15000});
const current=computed(()=>store.lastCommand?.id===resultId.value?store.lastCommand:null);
const record=computed(()=>store.history.find(e=>e.id===resultId.value));
const targetText=computed(()=>record.value?Object.entries(record.value.targets).map(([id,target])=>windowConfig[id as keyof typeof windowConfig].label+' → '+Math.round(target!.value*100)+'%').join('、')||'—':'—');
const contextText=computed(()=>store.dialogueContext ? windowConfig[store.dialogueContext.target].label : '无，请先明确目标');
const pendingText=computed(()=>store.pendingAction ? (store.pendingAction.operation.kind==='relative' ? `按回复时当前开度${store.pendingAction.operation.delta>0?'增加':'减少'}10个百分点` : `设置为${Math.round(store.pendingAction.operation.value*100)}%`)+'，等待单窗位置' : '无');
const feedback=computed(()=>issue.value || (record.value?Object.values(record.value.targets).map(t=>({moving:'正在执行',done:'已完成',replaced:'已被后续操作替换',paused:'已暂停'}[t.status])).filter((s,i,a)=>a.indexOf(s)===i).join(' · '):'') || (current.value ? {moving:'指令已接受，车窗运动中',done:'执行完成，已到达目标开度',interrupted:'已暂停'}[current.value.status] : resultId.value ? '已被后续操作替换' : '等待有效指令'));
onBeforeUnmount(()=>{controller.dispose();microphone.dispose();});
</script>
<template>
  <section class="voice-panel" aria-label="语音与文字控车">
    <h3>{{staticPreview?'交互体验':'语音控车'}}</h3><button class="primary" :disabled="staticPreview || !props.ready || phase==='finishing'" @click="active ? microphone.stop() : microphone.start()">{{staticPreview?'语音体验暂未开放':phase==='ready'?'■ 停止录音':phase==='connecting'?'取消连接':phase==='finishing'?'等待最终结果…':'● 点击说话' }}</button>
    <p role="status">{{staticPreview?'在线预览可旋转车模、独立调窗，也可输入文字指令。语音与 AI 理解暂未开放。':hint}}</p><div v-if="phase==='ready'" class="audio-meter"><meter min="0" max="0.2" :value="audioLevel" aria-label="麦克风输入音量"></meter><span>{{audioLevel>0.005?'已检测到声音':'输入音量很低，请检查麦克风'}}</span></div><details><summary>理解详情</summary><p>{{ understanding }}</p><p v-if="active">已发送音频 {{Math.round(sentBytes/1024)}} KB</p></details><p v-if="store.dialogueContext">继续操作：{{ contextText }} · 60秒有效</p><p v-if="store.pendingAction">等待补充位置：{{ pendingText }}</p><button v-if="busy || store.pendingAction || store.pendingBatch || store.dialogueContext" :disabled="!busy && !store.pendingAction && !store.pendingBatch && !store.dialogueContext" @click="execute('取消','text')">取消本次对话</button><p class="voice-example">例如：副驾车窗开一半 → 再开一点 → 关上吧。左右按车辆自身方向；只说左／右车窗会追问前后位置；可说“取消”清空待执行动作和续接目标。</p>
    <details><summary>使用文字输入</summary><form @submit.prevent="execute(input,'text')"><label for="command-text">文字输入</label><div class="text-command"><input id="command-text" v-model="input" maxlength="120" placeholder="副驾后面的车窗开一半"><button :disabled="!props.ready || !input.trim()">执行</button></div></form></details>
    <dl v-if="transcript || issue" class="voice-result" aria-live="polite"><dt>识别／输入文本</dt><dd>{{ transcript || '—' }}</dd><dt>目标车窗</dt><dd>{{ targetText }}</dd><dt>执行结果</dt><dd>{{ feedback }}<span v-if="current && detail"><br>{{ detail }}</span></dd></dl>
  </section>
</template>
<style scoped>
.audio-meter{display:flex;align-items:center;gap:8px;font-size:11px;color:#587365}.audio-meter meter{width:80px}.voice-panel{border-top:1px solid #dce4df;padding-top:18px;margin-top:20px}.voice-panel h3{font-size:15px;margin:0}.voice-panel label{font-size:11px}.voice-example{font-size:10px}.text-command{display:flex;gap:6px;margin-top:7px}.text-command input{min-width:0;flex:1;border:1px solid #ccd8d0;border-radius:6px;padding:10px;font-size:11px;background:white}.text-command button{font-size:11px;padding:7px}.voice-result{font-size:11px;background:#eef3f0;border-radius:7px;padding:12px}.voice-result dt{color:#72857b;margin-top:8px}.voice-result dt:first-child{margin-top:0}.voice-result dd{margin:4px 0;line-height:1.6;overflow-wrap:anywhere}
</style>
