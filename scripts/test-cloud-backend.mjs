import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {WebSocket} from 'ws';
import {createAsrServer} from '../server/asr.mjs';
import {apiEndpoints} from '../shared/api-endpoints.mjs';
import {requestBudget} from '../server/public-access.mjs';
const origin='https://miko-servax.github.io';
assert.deepEqual(apiEndpoints('https://demo.onrender.com/api/',origin),{health:'https://demo.onrender.com/api/health',intent:'https://demo.onrender.com/api/intent',asr:'wss://demo.onrender.com/api/asr',remote:true});
assert.equal(apiEndpoints('',origin).health,origin+'/api/health');
assert.equal(apiEndpoints('/api','http://localhost:5173').asr,'ws://localhost:5173/api/asr');
for(const invalid of ['https://user:pass@demo.invalid/api','https://demo.invalid/api?key=bad','https://demo.invalid/api#key','http://demo.invalid/api','javascript:alert(1)'])assert.throws(()=>apiEndpoints(invalid,origin));
let time=0;const budget=requestBudget(2,()=>time);assert.equal(budget(),true);assert.equal(budget(),true);assert.equal(budget(),false);time=60000;assert.equal(budget(),true);
const proposal={type:'command',target:{source:'explicit',ids:['RR'],candidates:[]},operation:{kind:'absolute',value:.5},missing:null};let modelCalls=0;
const model=createServer(async(req,res)=>{for await(const chunk of req){}modelCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(proposal)}}]}));});
model.listen(0,'127.0.0.1');await once(model,'listening');
const backend=createAsrServer({ALLOWED_ORIGINS:' '+origin+' ',INTENT_ENABLED:'true',INTENT_ENDPOINT:`http://127.0.0.1:${model.address().port}`,INTENT_MODEL:'mock',INTENT_API_KEY:'test-only',INTENT_TIMEOUT_MS:'1000'});
backend.listen(0,'127.0.0.1');await once(backend,'listening');const base=`http://127.0.0.1:${backend.address().port}`;
try{
 for(const [path,method] of [['/api/health','GET'],['/api/intent','POST']]){const r=await fetch(base+path,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'content-type'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-methods'),method);assert.equal(r.headers.get('vary'),'Origin');}
 const denied=await fetch(base+'/api/intent',{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid','Access-Control-Request-Method':'POST'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
 const badHeader=await fetch(base+'/api/intent',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'}});assert.equal(badHeader.status,403);
 const health=await fetch(base+'/api/health',{headers:{Origin:origin}});assert.equal(health.status,200);assert.equal(health.headers.get('access-control-allow-origin'),origin);
 const response=await fetch(base+'/api/intent',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId:'cors-test',text:'右后床开一半',context:{active:null,pending:null}})});assert.equal(response.status,200);assert.deepEqual((await response.json()).intent,proposal);assert.equal(modelCalls,1);
 const failure=await fetch(base+'/api/intent',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'no-json'});assert.equal(failure.status,400);assert.equal(failure.headers.get('access-control-allow-origin'),origin);
 const client=new WebSocket(base.replace('http:','ws:')+'/api/asr',{origin});const [data]=await once(client,'message');assert.equal(JSON.parse(data).type,'error');await once(client,'close');
 const rejected=new WebSocket(base.replace('http:','ws:')+'/api/asr',{origin:'https://untrusted.invalid'});rejected.on('error',()=>{});const [_,r]=await once(rejected,'unexpected-response');assert.equal(r.statusCode,403);r.resume();rejected.terminate();
 for(let i=0;i<28;i++)assert.equal((await fetch(base+'/api/intent',{method:'POST',headers:{Origin:origin},body:'invalid'})).status,400);
 const limited=await fetch(base+'/api/intent',{method:'POST',headers:{Origin:origin},body:'invalid'});assert.equal(limited.status,429);assert.equal(limited.headers.get('access-control-allow-origin'),origin);assert.equal(modelCalls,1);
 console.log('PASS: public endpoint validation, CORS preflight/health/model/error, exact Origin, WS allow/deny and request budget; cloud services mocked');
}finally{backend.close();model.close();}
