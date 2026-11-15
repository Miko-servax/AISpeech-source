import assert from 'node:assert/strict';
import {renderLoop} from '../src/scene/render-loop';
let next=1;const queue=new Map<number,FrameRequestCallback>();const raf=(cb:FrameRequestCallback)=>{const id=next++;queue.set(id,cb);return id;};const cancel=(id:number)=>{queue.delete(id);};
const step=(now:number)=>{const jobs=[...queue.values()];queue.clear();jobs.forEach(cb=>cb(now));};
let frames=0;let damping=0;let dt=0;
const loop=renderLoop((_now,delta)=>{frames++;dt=delta;return damping-->0;},false,raf,cancel);
loop.invalidate();loop.invalidate();assert.equal(queue.size,1);step(100);assert.equal(frames,1);assert.equal(queue.size,0);assert.equal(dt,0);
damping=3;loop.invalidate();for(let i=0;i<4;i++)step(200+i*16);assert.equal(queue.size,0);assert.equal(frames,5);
loop.visibility(true);loop.invalidate();assert.equal(queue.size,0);loop.visibility(false);step(5000);assert.equal(dt,0);assert.equal(queue.size,0);
loop.invalidate();loop.dispose();assert.equal(queue.size,0);loop.invalidate();assert.equal(queue.size,0);
// Changing presentation frequency does not change one second of animation progress.
for(const fps of [30,60]){let current=0;const animation=renderLoop((_now,delta)=>{current=Math.min(1,current+delta);return current<1;},false,raf,cancel);animation.invalidate();for(let i=0;i<=fps;i++)step(i*1000/fps);assert.ok(Math.abs(current-1)<1e-8);animation.dispose();}
console.log('PASS: demand rendering coalesces, settles damping/idle, resumes without time jumps, disposes, and preserves 30/60Hz animation duration');

const {createPinia,setActivePinia}=await import('pinia');
const {useVehicleStore}=await import('../src/stores/vehicle');
const {watchDialogueExpiry}=await import('../src/scene/dialogue-expiry');
setActivePinia(createPinia());const store=useVehicleStore();const stopExpiry=watchDialogueExpiry(store);
store.dialogueContext={target:'FR',expiresAt:Date.now()+20};
store.pendingAction={operation:{kind:'absolute',value:.5},text:'waiting',expiresAt:Date.now()+20};
store.pendingBatch={id:'idle-expiry',items:[{targets:[],operation:{kind:'absolute',value:.5}}],source:'voice',text:'waiting',expiresAt:Date.now()+20};
await new Promise(resolve=>setTimeout(resolve,40));assert.equal(store.dialogueContext,null);assert.equal(store.pendingAction,null);assert.equal(store.pendingBatch,null);stopExpiry();
console.log('PASS: active/pending/batch expiry fires while no render frames run');
