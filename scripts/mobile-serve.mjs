import {readFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {preview} from 'vite';
import {createAsrServer} from '../server/asr.mjs';
import {mobileConfig} from './mobile-config.mjs';
import {ensureMobileCertificate} from './mobile-cert.mjs';
if(existsSync('server/.env.local'))process.loadEnvFile('server/.env.local');
const c=ensureMobileCertificate(mobileConfig());
const allowed=[...(process.env.ALLOWED_ORIGINS||'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean),c.origin];
const backend=createAsrServer({...process.env,ALLOWED_ORIGINS:[...new Set(allowed)].join(',')});
const certificate=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 if(req.url==='/AISpeech-Local-CA.cer'){res.writeHead(200,{'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="AISpeech-Local-CA.cer"'});res.end(req.method==='HEAD'?undefined:readFileSync(c.publicCA));return;}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<meta name="viewport" content="width=device-width"><h1>AISpeech 手机联调</h1><p><a href="/AISpeech-Local-CA.cer">下载本项目测试CA证书</a></p><p>安装并信任后访问 <a href="${c.origin}/?perf=1">HTTPS测试页面</a></p><p>iPhone：设置→已下载描述文件→安装，再到通用→关于本机→证书信任设置，启用AISpeech Local Test CA。Android：安全→加密与凭据→安装CA证书。</p><p>只安装CA公钥证书，不需要私钥。SHA256：${c.caFingerprint}</p>`);
});
const sockets=new Set();const track=server=>server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});track(backend);track(certificate);
let app;
async function listen(server,port,host){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
async function close(){for(const socket of sockets)socket.destroy();await Promise.allSettled([new Promise(r=>backend.close(r)),new Promise(r=>certificate.close(r)),app?new Promise(r=>app.httpServer.close(r)):Promise.resolve()]);}
try{
 await listen(backend,c.apiPort,'127.0.0.1');await listen(certificate,c.certPort,c.host);
 app=await preview({configFile:'vite.config.ts',preview:{host:c.host,port:c.httpsPort,strictPort:true,https:{cert:readFileSync(c.cert),key:readFileSync(c.key)},proxy:{'/api':{target:`http://127.0.0.1:${c.apiPort}`,ws:true}}}});
 track(app.httpServer);
 console.log(`手机页面：${c.origin}/\n性能记录：${c.origin}/?perf=1\n首次证书安装：http://${c.host}:${c.certPort}/\n后台：127.0.0.1:${c.apiPort}（不对局域网开放）\nCA SHA256：${c.caFingerprint}`);
 process.once('SIGINT',()=>{void close().then(()=>process.exit(0));});process.once('SIGTERM',()=>{void close().then(()=>process.exit(0));});
}catch(error){console.error('手机入口启动失败：'+error.message);await close();process.exitCode=1;}
