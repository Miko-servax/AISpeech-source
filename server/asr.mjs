import {loadHotwords} from './hotwords.mjs';
import {intentHandler} from './intent.mjs';
import { createServer } from 'node:http';
import { createHmac, randomUUID, randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';
import {allowedOrigins,cors,requestBudget} from './public-access.mjs';
export function signedUrl(env, voiceId) {
  const timestamp = Math.floor(Date.now()/1000);
  const params = { engine_model_type:env.TENCENT_ASR_ENGINE || '16k_zh', expired:timestamp+300, needvad:1, nonce:randomInt(1,1000000000), secretid:env.TENCENT_SECRET_ID, timestamp, voice_format:1, voice_id:voiceId, filter_empty_result:0, hotword_list:loadHotwords() };
  const entries=Object.entries(params).sort(([a],[b])=>a.localeCompare(b));
  const path=`asr.cloud.tencent.com/asr/v2/${env.TENCENT_APP_ID}`;
  const signature=createHmac('sha1',env.TENCENT_SECRET_KEY).update(path+'?'+entries.map(([k,v])=>`${k}=${v}`).join('&')).digest('base64');
  return 'wss://'+path+'?'+new URLSearchParams([...entries.map(([k,v])=>[k,String(v)]),['signature',signature]]);
}
export function createAsrServer(env=process.env, { connect = url => new WebSocket(url,{handshakeTimeout:10000}) } = {}) {
  const configured=()=>['TENCENT_APP_ID','TENCENT_SECRET_ID','TENCENT_SECRET_KEY'].every(k=>Boolean(env[k]?.trim()));
  const handleIntent=intentHandler(env);
  const modelBudget=requestBudget(30),asrBudget=requestBudget(20);let models=0;
  const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(!cors(req,res,env))return;if(req.url==='/api/intent'){
    if(req.method==='POST'){if(models>=4||!modelBudget()){res.writeHead(429).end(JSON.stringify({message:'体验请求较多，请稍后重试。'}));return;}models++;let released=false;const release=()=>{if(!released){released=true;models--;}};res.once('close',release);res.once('finish',release);}
    void handleIntent(req,res);return;}if(req.url==='/api/health'){res.end(JSON.stringify({ok:true,asrConfigured:configured()}));}else{res.writeHead(404).end('{}');}});
  const wss=new WebSocketServer({noServer:true,maxPayload:64000});let active=0;
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/api/asr'||!allowedOrigins(env).includes(req.headers.origin)||active>=4){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    if(!asrBudget()){socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',client=>{
    active++;let upstream,ready=false,ended=false,finished=false,total=0;const session=randomUUID();const seen=new Set();const started=new Set();
    const send=data=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
    const timer=setTimeout(()=>fail('本次录音已超时，请重新开始。'),65000);
    function fail(message){send({type:'error',message});client.close(1000);upstream?.close();}
    client.on('close',()=>{active--;clearTimeout(timer);upstream?.close();});client.on('error',()=>upstream?.close());
    if(!configured()){fail('后端尚未配置腾讯云 ASR 密钥，请先填写 server/.env.local 并重启后端。');return;}
    try{upstream=connect(signedUrl(env,session));}catch{fail('ASR热词或连接配置无效，请检查后端配置。');return;}
    upstream.on('error',()=>fail('无法连接腾讯云语音服务，请检查网络与后端配置。'));
    upstream.on('message',data=>{
      let msg;try{msg=JSON.parse(data.toString());}catch{fail('语音服务返回了无效数据。');return;}
      if(msg.code!==0){fail(`腾讯云 ASR 返回错误 ${msg.code}，请检查密钥、开通状态或余额。`);return;}
      if(!ready){ready=true;send({type:'ready',session});}
      if(msg.result){const r=msg.result;if(!Number.isInteger(r.index)||r.index<0)return fail('语音服务返回了无效句子序号。');if(!started.has(r.index)){started.add(r.index);send({type:'sentence_start',session,index:r.index,startTimeMs:r.start_time??null});}if(r.slice_type===2){const key=String(r.index);if(!seen.has(key)){seen.add(key);send({type:'final',session,index:r.index,text:r.voice_text_str??''});}}else send({type:'interim',session,index:r.index,text:r.voice_text_str??''});}
      if(msg.final===1){finished=true;send({type:'done',session});client.close(1000);}
    });
    upstream.on('close',()=>{if(client.readyState===WebSocket.OPEN&&!finished)fail('语音连接提前结束，请重试。');});
    client.on('message',(data,isBinary)=>{
      if(ended)return;
      if(isBinary){if(!ready)return fail('录音连接尚未就绪。');total+=data.length;if(total>32000*60)return fail('录音最多60秒，请分次说出指令。');if(upstream.bufferedAmount>128000)return fail('网络发送拥堵，请重试。');upstream.send(data,{binary:true});}
      else{let msg;try{msg=JSON.parse(data.toString());}catch{return fail('无效录音请求。');}if(msg.type==='end'&&ready){ended=true;upstream.send(JSON.stringify({type:'end'}));}else fail('无效录音请求。');}
    });
  });
  server.on('shutdown',()=>{for(const client of wss.clients){client.send(JSON.stringify({type:'error',message:'语音服务正在更新，请稍后重新录音。'}));client.close(1012);}server.closeAllConnections();});
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||8787),host=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 const server=createAsrServer();server.listen(port,host,()=>console.log(`ASR backend listening on ${host}:${port}`));
 const stop=()=>{server.emit('shutdown');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
