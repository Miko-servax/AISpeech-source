import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
const code=transformSync(readFileSync('src/voice/microphone.ts','utf8'),{loader:'ts',format:'cjs'}).code;
function setup(fetchImpl=async()=>({ok:true,json:async()=>({asrConfigured:true})}),options={}){
 const events=[],calls=[],timers=new Map(),delays=new Map(),urls=[];let node,socket;let sequence=0;
 class Audio {
  state='running';destination={};audioWorklet={addModule:async url=>{urls.push(url);}};
  resume(){calls.push('resume');return Promise.resolve();} close(){this.state='closed';return Promise.resolve();}
  createMediaStreamSource(){return {connect:n=>n};}createGain(){return {gain:{value:1},connect:()=>{}};}
 }
 class Worklet {port={postMessage:()=>{}};constructor(){node=this;}connect(n){return n;}disconnect(){} }
 class Socket {static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(url){socket=this;this.url=url;}send(data){this.sent.push(data);}close(){this.readyState=3;}}
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,AudioContext:Audio,AudioWorkletNode:Worklet,WebSocket:Socket,AbortController,DOMException,location:{protocol:'http:',host:'localhost:5173'},
 navigator:{mediaDevices:{getUserMedia:async()=>{calls.push('permission');return {getTracks:()=>[{stop(){}}],getAudioTracks:()=>[]};}}},
 fetch:(...args)=>{calls.push('health');urls.push(args[0]);return fetchImpl(...args);},setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,fn);delays.set(id,ms);return id;},clearTimeout:id=>timers.delete(id)});
 return {microphone:module.exports.createMicrophone(e=>events.push(e),options),events,calls,timers,delays,urls,get node(){return node;},get socket(){return socket;}};
}
const live=setup();await live.microphone.start();assert.deepEqual(live.calls.slice(0,2),['resume','health']);
live.socket.onmessage({data:JSON.stringify({type:'ready',session:'test'})});
live.node.port.onmessage({data:{type:'pcm',data:new ArrayBuffer(6400)}});
live.node.port.onmessage({data:{type:'level',level:.04}});
assert.equal(live.events.at(-1).sentBytes,6400);assert.equal(live.events.at(-1).level,.04);
live.socket.onmessage({data:JSON.stringify({type:'final',session:'test',index:0,text:'右后窗开一半'})});assert.equal(live.events.at(-1).type,'final');
live.node.onprocessorerror();assert.equal(live.events.at(-1).type,'error');assert.match(live.events.at(-1).message,/采集/);live.microphone.dispose();
let resolveHealth;const stalled=setup(()=>new Promise(resolve=>resolveHealth=resolve));const pending=stalled.microphone.start();
[...stalled.timers.values()][0]();assert.equal(stalled.events.at(-1).type,'error');assert.match(stalled.events.at(-1).message,/启动超时/);
resolveHealth({ok:true,json:async()=>({asrConfigured:true})});await pending;assert.ok(!stalled.calls.includes('permission'));stalled.microphone.dispose();
console.log('PASS: gesture-time audio resume, input level/sent bytes, final forwarding, worklet failure and stalled-start cleanup');
let attempts=0;const remote=setup(async()=>++attempts===1?{ok:false,status:503}:{ok:true,json:async()=>({asrConfigured:true})},{healthUrl:'https://example.invalid/api/health',asrUrl:'wss://example.invalid/api/asr',workletUrl:'/AISpeech-demo/pcm-worklet.js',startupTimeoutMs:90000});
const waking=remote.microphone.start();for(let i=0;i<8;i++)await Promise.resolve();const retry=[...remote.timers.keys()].find(id=>remote.delays.get(id)===2000);assert.ok(retry);remote.timers.get(retry)();await waking;assert.equal(attempts,2);assert.equal(remote.socket.url,'wss://example.invalid/api/asr');assert.ok(remote.urls.includes('/AISpeech-demo/pcm-worklet.js'));assert.ok(remote.events.some(e=>/唤醒/.test(e.message||'')));remote.microphone.dispose();
console.log('PASS: cross-origin backend URLs, same-origin Pages Worklet and retry after free-service cold start');
const cancelled=setup(async()=>({ok:false,status:503}),{startupTimeoutMs:90000});const cancelledStart=cancelled.microphone.start();for(let i=0;i<8;i++)await Promise.resolve();cancelled.microphone.stop();await cancelledStart;assert.ok(!cancelled.calls.includes('permission'));assert.equal(cancelled.events.at(-1).type,'closed');assert.equal(cancelled.timers.size,0);cancelled.microphone.dispose();
const forbidden=setup(async()=>({ok:false,status:403}),{startupTimeoutMs:90000});await forbidden.microphone.start();assert.equal(forbidden.events.at(-1).type,'error');assert.ok(!forbidden.calls.includes('permission'));forbidden.microphone.dispose();
console.log('PASS: cancelling cold-start retry leaves no timer/permission request, and forbidden Origins fail without retry');
