import {prepareBatch as validateBatch,validateBatchIntent,type BatchItem,type PreparedBatch} from '../../shared/batch.mjs';
import { validateIntent, clarificationCandidates, type IntentContext } from '../../shared/intent.mjs';
import type { ParseResult } from '../commands/vehicle-command';
import { defineStore } from 'pinia';
import { windowIds, type WindowId } from '../config/v8-windows';
import { makeCommand, parseVehicleText, type Operation, type VehicleCommand } from '../commands/vehicle-command';
export type IntentTicket={interactionVersion:number;dialogueRevision:number;deadline:number;inputAt:number;context:IntentContext};
export type HistoryEntry={id:string;source:string;text:string;message?:string;route?:string;elapsedMs?:number;model?:string;started:number;commandIds?:string[];targets:Partial<Record<WindowId,{value:number;itemId?:string;status:'moving'|'done'|'replaced'|'paused';ended?:number}>>};
export const DIALOGUE_TTL = 60_000;
export type DialogueResult = { status: 'executed' | 'clarify' | 'ignored' | 'cancelled'; message: string; id?: string };
export const useVehicleStore = defineStore('vehicle', {
  state: () => ({
    pendingBatch:null as {id:string;items:BatchItem[];text:string;expiresAt:number;source:'voice'|'text'}|null,
    sliderGroup: null as string|null,
    history: [] as HistoryEntry[],
    windows: Object.fromEntries(windowIds.map(id => [id, { current: 0, target: 0 }])) as Record<WindowId, { current: number; target: number }>,
    selected: 'FL' as WindowId, playing: false, seconds: 5, direction: 1,
    lastCommand: null as (VehicleCommand & { status: 'moving' | 'done' | 'interrupted'; baseCurrent?: number }) | null,
    commandIds: [] as string[], textIds: [] as string[], interactionVersion: 0, dialogueRevision: 0,
    dialogueContext: null as { target: WindowId; expiresAt: number } | null,
    pendingAction: null as { operation: Operation; expiresAt: number; text: string; candidates?: WindowId[] } | null,
  }),
  actions: {
    beginSlider(){this.sliderGroup=crypto.randomUUID();},
    endSlider(){this.sliderGroup=null;},
    record(entry:HistoryEntry){const old=this.history.find(x=>x.id===entry.id);if(old)Object.assign(old,entry,{started:old.started,text:old.text,targets:Object.keys(entry.targets).length?entry.targets:old.targets});else this.history.unshift(entry);this.history=this.history.slice(0,10);},
    clearDialogue() { this.dialogueRevision++; this.dialogueContext=null; this.pendingAction=null; this.pendingBatch=null; },
    expireDialogue(now=Date.now()) {
      if((this.pendingBatch&&now>=this.pendingBatch.expiresAt)||(this.dialogueContext && now>=this.dialogueContext.expiresAt)||(this.pendingAction && now>=this.pendingAction.expiresAt)) this.clearDialogue();
    },
    manualInteraction() { this.interactionVersion++; this.clearDialogue(); },
    selectWindow(id: WindowId) { this.manualInteraction(); this.selected=id; },
    submitText(text: string, source: 'voice' | 'text', id: string=crypto.randomUUID(), version?: number, now=Date.now()): DialogueResult {
      const blocked=this.beginInput(source,id,version,now);
      return blocked??this.resolveIntent(parseVehicleText(text),text,source,id,now);
    },
    beginInput(source:'voice'|'text',id:string,version?:number,now=Date.now()): DialogueResult|null {
      version ??= this.interactionVersion;
      if(this.textIds.includes(id))return {status:'ignored',message:'重复结果已忽略。'};
      this.textIds.push(id);if(this.textIds.length>500)this.textIds.shift();
      // Frozen at recording start, NOT at arrival of sentence_start/interim/final.
      if(source==='voice' && version!==this.interactionVersion)return {status:'ignored',message:'录音期间发生了手动或文字操作，本次语音结果已失效，请重新录音。'};
      if(source==='text')this.interactionVersion++; // Text can use context, but invalidates an older microphone session.
      this.expireDialogue(now);
      return null;
    },
    intentTicket(timeout:number,inputAt=Date.now()): IntentTicket {
      const context=this.contextSnapshot();
      return {interactionVersion:this.interactionVersion,dialogueRevision:this.dialogueRevision,inputAt,deadline:Math.min(Date.now()+timeout,context.active?.expiresAt??Infinity,context.pending?.expiresAt??Infinity,this.pendingBatch?.expiresAt??Infinity),context};
    },
    contextSnapshot(): IntentContext {
      return {active:this.dialogueContext?{...this.dialogueContext}:null,pending:this.pendingAction?{operation:{...this.pendingAction.operation},expiresAt:this.pendingAction.expiresAt,candidates:this.pendingAction.candidates?[...this.pendingAction.candidates]:null}:null};
    },
    commitIntent(raw:unknown,text:string,source:'voice'|'text',id:string,ticket:IntentTicket,now=Date.now()): DialogueResult {
      this.expireDialogue(now);
      if(now>=ticket.deadline||this.interactionVersion!==ticket.interactionVersion||this.dialogueRevision!==ticket.dialogueRevision)return {status:'ignored',message:'理解结果已过期或上下文已改变，请重新说明。'};
      if(raw&&typeof raw==='object'&&'items' in raw){
        const batch=validateBatchIntent(raw,text,ticket.context,now);
        if(batch.type==='unsupported'){this.clearDialogue();return {status:'clarify',message:'整句包含不支持的操作，请重新说明。'};}
        return this.resolveBatch(batch.items.map(({intent,clause})=>({targets:intent.target.ids,operation:intent.operation,candidates:intent.type==='clarify'?clarificationCandidates(intent,clause,{active:null,pending:null},now):undefined})),text,source,id,now);
      }
      const intent=validateIntent(raw,text,ticket.context);
      if(intent.type==='unsupported'){this.clearDialogue();return {status:'clarify',message:'当前不支持这条车窗表达，请重新说明。'};}
      if(intent.type==='clarify'&&intent.missing!=='target'){this.clearDialogue();return {status:'clarify',message:intent.missing==='amount'?'请明确目标开度。':'请明确车窗动作。'};}
      if(this.pendingBatch&&intent.target.source==='pending')return this.completePendingBatch({targets:intent.target.ids,operation:null,candidates:intent.target.candidates.length?intent.target.candidates:undefined},now);
      const operation=intent.operation??ticket.context.pending?.operation??null;
      if(intent.type==='clarify'&&!operation){this.clearDialogue();return {status:'clarify',message:'请明确车窗位置及动作。'};}
      const candidates=intent.type==='clarify'?clarificationCandidates(intent,text,ticket.context,now):intent.target.candidates;
      const result=this.resolveIntent({ok:true,targets:intent.target.ids,operation,candidates:candidates.length?candidates:undefined,unresolvedTarget:intent.type==='clarify'},text,source,id,now);
      if(this.pendingAction)this.pendingAction.expiresAt=Math.min(this.pendingAction.expiresAt,ticket.inputAt+DIALOGUE_TTL,ticket.context.pending?.expiresAt??Infinity);
      return result;
    },
    resolveIntent(parsed:ParseResult,text:string,source:'voice'|'text',id:string,now=Date.now()): DialogueResult {
      if(!parsed.ok){if(parsed.clearTarget)this.clearDialogue();return {status:'clarify',message:parsed.message};}
      if(parsed.items)return this.resolveBatch(parsed.items,text,source,id,now);
      if(this.pendingBatch&&!parsed.cancel&&(!parsed.operation||this.pendingBatch.items.some(item=>item.targets.length&&!item.operation)))return this.completePendingBatch(parsed,now);
      this.pendingBatch=null;
      this.dialogueRevision++;
      if(parsed.cancel){this.clearDialogue();return {status:'cancelled',message:'已取消待执行动作，并清空续接上下文。'};}
      if(parsed.unresolvedTarget)this.clearDialogue();
      if(parsed.candidates)this.dialogueContext=null;
      let targets=parsed.targets;
      let operation=parsed.operation;
      if(operation) {
        // A new action supersedes a pending question; never execute the old action too.
        this.pendingAction=null;
        if(!targets.length && this.dialogueContext)targets=[this.dialogueContext.target];
      } else {
        if(!this.pendingAction)return {status:'clarify',message:'没有待执行的动作，请同时说明车窗和动作。'};
        if(parsed.candidates){
          const previous=this.pendingAction.candidates;
          const candidates=previous?previous.filter(id=>parsed.candidates!.includes(id)):parsed.candidates;
          if(candidates.length!==1){
            if(candidates.length)this.pendingAction.candidates=candidates;
            return {status:'clarify',message:this.clarificationPrompt(candidates.length?candidates:previous)};
          }
          targets=candidates;
        }
        if(targets.length!==1)return {status:'clarify',message:'请指定一个车窗：左前、右前、左后或右后。'};
        operation=this.pendingAction.operation;
      }
      if(!targets.length){
        this.dialogueContext=null;
        this.pendingAction={operation,expiresAt:now+DIALOGUE_TTL,text,candidates:parsed.candidates};
        return {status:'clarify',message:this.clarificationPrompt(parsed.candidates)};
      }
      if(operation.kind==='relative' && targets.length!==1){this.clearDialogue();return {status:'clarify',message:'相对调整请指定一个车窗。'};}
      const command=makeCommand(source,targets,operation.kind==='absolute'?operation.value:0,text);command.id=id;command.operation=operation;
      this.dispatch(command,now);
      const done=this.lastCommand!;
      return {status:'executed',id,message:operation.kind==='relative'?`按当前开度 ${Math.round(done.baseCurrent!*100)}% 调整至 ${Math.round(done.openness*100)}%`:'指令已接受'};
    },
    prepareBatch(items:BatchItem[]):PreparedBatch {return validateBatch(items);},
    resolveBatch(items:BatchItem[],text:string,source:'voice'|'text',id:string,now=Date.now(),expiresAt=now+DIALOGUE_TTL):DialogueResult {
      let prepared:PreparedBatch;try{prepared=this.prepareBatch(items);}catch(error){this.clearDialogue();return {status:'clarify',message:error instanceof Error?error.message:'整批校验失败。'};}
      if(!prepared.ready){
        this.clearDialogue();this.pendingBatch={id,items:prepared.items,text,source,expiresAt};
        const item=prepared.items[prepared.missingIndex]!;
        this.pendingAction=item.operation?{operation:item.operation,text,expiresAt,candidates:item.candidates}:null;
        const message=`第${prepared.missingIndex+1}项：`+(item.targets.length?'请明确动作和幅度。':this.clarificationPrompt(item.candidates))+' 整批暂未执行。';
        this.record({id,source,text,started:now,targets:{},message});
        return {status:'clarify',id,message};
      }
      this.commitBatch(prepared,{id,source,text},now);
      return {status:'executed',id,message:'整批指令已接受'};
    },
    completePendingBatch(reply:BatchItem,now=Date.now()):DialogueResult {
      const pending=this.pendingBatch;if(!pending||now>=pending.expiresAt){this.clearDialogue();return {status:'clarify',message:'待执行批次已过期，请重新说明。'};}
      const items=pending.items.map(item=>({...item,targets:[...item.targets],candidates:item.candidates?[...item.candidates]:undefined}));
      const item=items.find(i=>!i.targets.length||!i.operation)!;
      const candidates=reply.targets.length?reply.targets:reply.candidates;
      if(candidates){const narrowed=item.candidates?item.candidates.filter(id=>candidates.includes(id)):candidates;
        if(!narrowed.length)return {status:'clarify',id:pending.id,message:'补充的位置与待执行范围不符，整批未执行。'};
        if(narrowed.length===1)item.targets=[narrowed[0]!];else item.candidates=[...narrowed];
      }
      if(!item.operation&&reply.operation)item.operation=reply.operation;
      return this.resolveBatch(items,pending.text,pending.source,pending.id,now,pending.expiresAt);
    },
    clarificationPrompt(candidates?: WindowId[]) {
      const side=candidates?.length===2&&candidates.every(id=>id.endsWith('R'))?'右':candidates?.length===2&&candidates.every(id=>id.endsWith('L'))?'左':null;
      return side?`是${side}前窗还是${side}后窗？待执行动作已保留，请补充前后位置，或说“取消”。`:'要操作哪个车窗？动作暂存60秒，请回答左前、右前、左后或右后，或说“取消”。';
    },
    dispatch(command: VehicleCommand, now=Date.now()) {
      return this.commitBatch(this.prepareBatch([{targets:command.targets,operation:command.operation??{kind:'absolute',value:command.openness}}]),command,now);
    },
    commitBatch(prepared:PreparedBatch,command:{id:string;source:VehicleCommand['source'];text?:string},now=Date.now()) {
      if(this.commandIds.includes(command.id))return false;
      const checked=this.prepareBatch(prepared.items);if(!checked.ready)throw new Error('批次尚未完整，不能执行。');
      // Snapshot all currents before writing any target. No await or partial dispatch here.
      const currents=Object.fromEntries(windowIds.map(id=>[id,this.windows[id].current])) as Record<WindowId,number>;
      const values=checked.items.flatMap((item,index)=>item.targets.map(id=>{
        const op=item.operation!;const value=op.kind==='absolute'?op.value:Math.max(0,Math.min(1,currents[id]+op.delta));
        return {id,value,itemId:`${command.id}:${index}`,baseCurrent:op.kind==='relative'?currents[id]:undefined};
      }));
      const targets=values.map(v=>v.id);
      const manual=['button','slider','playback'].includes(command.source);
      if(manual)this.manualInteraction();
      this.commandIds.push(command.id);if(this.commandIds.length>500)this.commandIds.shift();
      this.dialogueRevision++;this.playing=false;this.selected=targets[0]!;
      for(const entry of this.history)for(const id of targets){const target=entry.targets[id];if(target?.status==='moving'){target.status='replaced';target.ended=now;}}
      const historyId=command.source==='slider'&&this.sliderGroup?this.sliderGroup:command.id;
      const previous=this.history.find(e=>e.id===historyId);
      this.record({id:historyId,commandIds:[...(previous?.commandIds??[]),command.id],source:command.source,text:command.text||'手动车窗控制',started:now,targets:Object.fromEntries(values.map(v=>[v.id,{itemId:v.itemId,value:v.value,status:Math.abs(currents[v.id]-v.value)<.00001?'done':'moving',...(Math.abs(currents[v.id]-v.value)<.00001?{ended:now}:{})}]))});
      // A single state patch makes all targets observable together, including synchronous watchers.
      const nextWindows={...this.windows};for(const v of values)nextWindows[v.id]={...this.windows[v.id],target:v.value};
      this.windows=nextWindows;
      this.lastCommand={...command,targets,openness:values[0]!.value,operation:checked.items.length===1?checked.items[0]!.operation!:undefined,baseCurrent:values[0]!.baseCurrent,status:values.every(v=>Math.abs(currents[v.id]-v.value)<.00001)?'done':'moving'};
      this.pendingAction=null;this.pendingBatch=null;
      this.dialogueContext=!manual&&targets.length===1?{target:targets[0]!,expiresAt:now+DIALOGUE_TTL}:null;
      return true;
    },
    setWindow(id: WindowId,value: number,source: 'button'|'slider'='button'){this.dispatch(makeCommand(source,[id],value));},
    setAll(value: number){this.dispatch(makeCommand('button',[...windowIds],value));},
    togglePlayback(){
      if(this.playing){for(const entry of this.history)for(const target of Object.values(entry.targets))if(target.status==='moving'){target.status='paused';target.ended=Date.now();}this.manualInteraction();this.playing=false;for(const id of windowIds)this.windows[id].target=this.windows[id].current;if(this.lastCommand?.status==='moving')this.lastCommand.status='interrupted';return;}
      this.direction=windowIds.every(id=>this.windows[id].current>.99)?-1:1;
      this.dispatch(makeCommand('playback',[...windowIds],this.direction>0?1:0));this.playing=true;
    },
    tick(dt: number){
      this.expireDialogue();
      for(const id of windowIds){const w=this.windows[id],delta=w.target-w.current;if(Math.abs(delta)>.00000001)w.current+=Math.sign(delta)*Math.min(Math.abs(delta),dt/this.seconds);}
      for(const entry of this.history)for(const id of windowIds){const target=entry.targets[id];if(target?.status==='moving'&&Math.abs(this.windows[id].current-target.value)<.00001){target.status='done';target.ended=Date.now();}}
      if(this.lastCommand?.status==='moving'&&this.lastCommand.targets.every(id=>Math.abs(this.windows[id].current-this.windows[id].target)<.00001))this.lastCommand.status='done';
      if(this.playing&&windowIds.every(id=>Math.abs(this.windows[id].target-this.windows[id].current)<.00001)){this.direction*=-1;this.dispatch(makeCommand('playback',[...windowIds],this.direction>0?1:0));this.playing=true;}
    },
  },
});
