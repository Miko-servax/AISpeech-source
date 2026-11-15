import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {request as tlsRequest} from 'node:https';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {X509Certificate} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {preview} from 'vite';
import {createAsrServer} from '../server/asr.mjs';
const ca=readFileSync('.local-https/ca.pem'),cert=readFileSync('.local-https/server.pem'),key=readFileSync('.local-https/server-key.pem');
assert.ok(new X509Certificate(cert).checkIP('127.0.0.1'));assert.ok(new X509Certificate(cert).verify(new X509Certificate(ca).publicKey));
const proposal={type:'command',target:{source:'explicit',ids:['RR'],candidates:[]},operation:{kind:'absolute',value:.5},missing:null};
let modelCalls=0,audioBytes=0;
const model=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));assert.equal(req.headers.authorization,'Bearer test-only');assert.equal(body.model,'mock-model');modelCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(proposal)}}]}));});model.listen(0,'127.0.0.1');await once(model,'listening');
const upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');upstream.on('connection',ws=>{ws.send(JSON.stringify({code:0}));ws.on('message',(data,binary)=>{if(binary){audioBytes+=data.length;return;}ws.send(JSON.stringify({code:0,result:{slice_type:2,index:0,voice_text_str:'右后窗开一半'}}));ws.send(JSON.stringify({code:0,final:1}));});});
const env={TENCENT_APP_ID:'123',TENCENT_SECRET_ID:'mock',TENCENT_SECRET_KEY:'mock',INTENT_ENABLED:'true',INTENT_ENDPOINT:`http://127.0.0.1:${model.address().port}`,INTENT_MODEL:'mock-model',INTENT_API_KEY:'test-only',ALLOWED_ORIGINS:''};
const backend=createAsrServer(env,{connect:()=>new WebSocket(`ws://127.0.0.1:${upstream.address().port}`)});backend.listen(0,'127.0.0.1');await once(backend,'listening');
let app;
try{
 app=await preview({configFile:'vite.config.ts',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:false,https:{cert,key},proxy:{'/api':{target:`http://127.0.0.1:${backend.address().port}`,ws:true}}}});
 const origin=`https://127.0.0.1:${app.httpServer.address().port}`;env.ALLOWED_ORIGINS=origin;
 const call=(path,options={},data)=>new Promise((resolve,reject)=>{const req=tlsRequest(origin+path,{ca,...options},res=>{const parts=[];res.on('data',d=>parts.push(d));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));});req.on('error',reject);req.end(data);});
 assert.equal((await call('/')).status,200);assert.deepEqual(JSON.parse((await call('/api/health')).body),{ok:true,asrConfigured:true});
 const response=await call('/api/intent',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'}},JSON.stringify({requestId:'tls-model',text:'右后床开一半',context:{active:null,pending:null}}));assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body).intent,proposal);assert.equal(modelCalls,1);
 assert.equal((await call('/api/intent',{method:'POST',headers:{Origin:'https://not-allowed.invalid'}},'{}')).status,403);
 const ws=new WebSocket(origin.replace('https:','wss:')+'/api/asr',{ca,origin});const events=[];ws.on('message',data=>{const event=JSON.parse(data);events.push(event);if(event.type==='ready'){ws.send(Buffer.alloc(6400));ws.send(JSON.stringify({type:'end'}));}});await once(ws,'close');assert.equal(audioBytes,6400);assert.ok(events.some(e=>e.type==='final'));assert.equal(events.at(-1).type,'done');
 const gzip=await call('/models/v8-working.glb',{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});assert.equal(gzip.headers['content-encoding'],'gzip');assert.ok(Number(gzip.headers['content-length'])>1000);
 for(const path of ['/.local-https/ca-key.pem','/server/.env.local','/@fs/Users/pukeyang/Documents/AISpeech/.local-https/server-key.pem']){const response=await call(path);assert.ok(!response.body.toString().includes('PRIVATE KEY'));assert.ok(!response.body.toString().includes('TENCENT_SECRET_KEY='));}
 mkdirSync('.cache/mobile',{recursive:true});writeFileSync('.cache/mobile/https-proxy-test.json',JSON.stringify({generatedAt:new Date().toISOString(),tlsVerified:true,httpProxy:true,wssAudioBytes:audioBytes,finalEvents:events.filter(e=>e.type==='final').length,modelCalls,gzip:true,secretsNotServed:true,note:'All cloud services mocked; no real audio/ASR/model API called.'},null,2));
 console.log('PASS: trusted TLS validation, HTTPS same-origin model/health, WSS audio/final, origin rejection, GLB gzip, secret-file isolation (mock cloud services)');
}finally{app?.httpServer.close();backend.close();model.close();upstream.close();}
