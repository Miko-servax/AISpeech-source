import { parseVehicleText, RuleReason } from './vehicle-command';
import type { DialogueResult, IntentTicket, useVehicleStore } from '../stores/vehicle';
import type { IntentContext } from '../../shared/intent.mjs';
type Input={text:string;source:'voice'|'text';id:string;version?:number;inputAt?:number};
type Task={input:Input;generation:number;resolve:(r:DialogueResult)=>void};
export type IntentRequest={requestId:string;text:string;context:IntentContext};
export type Transport=(request:IntentRequest,signal:AbortSignal)=>Promise<unknown>;
export class IntentController {
  private generation=0; private queue:Task[]=[];private running:Task|null=null;private abort:AbortController|null=null;private waiting=false;private disposed=false;
  private submitted=new Set<string>();
  constructor(private store:ReturnType<typeof useVehicleStore>,private transport:Transport,private timeout=3500,private onState:(s:string)=>void=()=>{}){}
  isBusy(){return this.running!==null;}
  /** Called by synchronous store watchers, not by network response arrival. */
  stateChanged(){if(this.waiting)this.invalidate('上下文已改变，已丢弃等待中的理解结果。');}
  invalidate(message='请求已失效，请重新说明。'){
    this.generation++;this.waiting=false;this.abort?.abort();this.abort=null;
    const tasks=[...(this.running?[this.running]:[]),...this.queue];this.running=null;this.queue=[];
    for(const task of tasks)task.resolve({status:'ignored',message});this.onState(message);
  }
  submit(input:Input):Promise<DialogueResult>{
    if(this.disposed||this.submitted.has(input.id))return Promise.resolve({status:'ignored',message:'重复或已关闭的输入已忽略。'});
    this.submitted.add(input.id);if(this.submitted.size>500)this.submitted.delete(this.submitted.values().next().value!);
    if(input.source==='voice'&&input.version!==this.store.interactionVersion)return Promise.resolve({status:'ignored',message:'录音期间发生了手动或文字操作，请重新录音。'});
    const parsed=parseVehicleText(input.text);
    if(input.source==='text'||parsed.ok&&parsed.cancel)this.invalidate(parsed.ok&&parsed.cancel?'已取消等待中的模型理解。':'已由文字输入替换。');
    return new Promise(resolve=>{this.queue.push({input:{...input,inputAt:input.inputAt??Date.now()},generation:this.generation,resolve});void this.pump();});
  }
  private async pump(){
    if(this.running||this.disposed)return;const task=this.queue.shift();if(!task)return;this.running=task;
    const {input}=task;let timer:ReturnType<typeof setTimeout>|undefined;let ticket:IntentTicket|undefined;
    try{
      const blocked=this.store.beginInput(input.source,input.id,input.version);
      if(blocked){task.resolve(blocked);return;}
      const parsed=parseVehicleText(input.text);
      if(parsed.reason!==RuleReason.ModelFallback){this.onState(`规则处理：${parsed.reason}`);task.resolve(this.store.resolveIntent(parsed,input.text,input.source,input.id));return;}
      ticket=this.store.intentTicket(this.timeout,input.inputAt);const abort=new AbortController();this.abort=abort;this.waiting=true;this.onState('模型理解中…');
      const expired:DialogueResult={status:'ignored',message:'理解超时或上下文过期，请重新说明。'};
      // Race explicitly: an adapter ignoring AbortSignal must still never commit late.
      const remaining=Math.max(0,ticket.deadline-Date.now());
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error(expired.message));},remaining);});
      const reply=await Promise.race([this.transport({requestId:input.id,text:input.text,context:ticket.context},abort.signal),timeout]);
      if(task.generation!==this.generation||this.disposed)return;
      this.waiting=false;
      const outcome=this.store.commitIntent(reply,input.text,input.source,input.id,ticket);
      if(outcome.status==='ignored'&&this.store.interactionVersion===ticket.interactionVersion&&this.store.dialogueRevision===ticket.dialogueRevision)this.store.clearDialogue();
      task.resolve(outcome);this.onState(outcome.status==='ignored'?'理解结果已失效':'模型结果已校验');
    }catch(error){if(task.generation===this.generation){this.waiting=false;const stale=ticket&&(this.store.interactionVersion!==ticket.interactionVersion||this.store.dialogueRevision!==ticket.dialogueRevision);if(!stale)this.store.clearDialogue();task.resolve({status:stale?'ignored':'clarify',message:stale?'理解结果已失效，请重新说明。':error instanceof Error?error.message:'理解失败，请重新说明。'});this.onState('理解未执行');}}
    finally{clearTimeout(timer);if(this.running===task){this.running=null;this.waiting=false;this.abort=null;void this.pump();}}
  }
  dispose(){this.disposed=true;this.invalidate();}
}
export const createIntentTransport=(observe:(id:string,meta:{model?:string;elapsedMs?:number})=>void=()=>{},endpoint='/api/intent'):Transport=>async(request,signal)=>{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal});
  let data;try{data=await response.json();}catch{throw new Error('模型服务暂时不可用，免费服务可能正在唤醒，请稍后重试。');}if(!response.ok)throw new Error(data.message||'模型理解服务不可用，请使用明确指令。');
  if(data.meta)observe(request.requestId,data.meta);
  if(data.requestId!==request.requestId)throw new Error('理解结果与当前请求不匹配。');return data.intent;
};

export const requestIntent=createIntentTransport();
