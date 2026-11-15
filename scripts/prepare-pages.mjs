import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {loadEnv} from 'vite';
import {pagesApiBase} from '../shared/public-deployment.mjs';

// This is a public application build, not an export of the source model library.
const destination=resolve('.cache/github-pages/site');
rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});
const credentials=[];
for(const values of [process.env,...['.env.local','server/.env.local'].filter(existsSync).map(file=>parseEnv(readFileSync(file,'utf8')))]){
 for(const key of ['TENCENT_APP_ID','TENCENT_SECRET_ID','TENCENT_SECRET_KEY','INTENT_API_KEY'])if(values[key]?.length>=8)credentials.push(values[key]);
}
const files=[];
const apiBase=(process.env.VITE_API_BASE_URL??loadEnv('pages',process.cwd(),'VITE_').VITE_API_BASE_URL??pagesApiBase).trim();
if(apiBase&&!/^https:\/\/[^/?#@]+(?:\/[^?#]*)?$/.test(apiBase))throw new Error('Public backend URL must be HTTPS and contain no credentials or query');
function add(path,data){
 const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
 if(/(?:^|\/)\.(?:env|git)|\.(?:fbx|blend|pem|key|crt|cer|log|map)$/i.test(path))throw new Error('Private/source file cannot be published: '+path);
 if(/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n/m.test(bytes.toString('utf8')))throw new Error('Private key found: '+path);
 for(const value of credentials)if(bytes.includes(Buffer.from(value)))throw new Error('Configured credential found (value withheld): '+path);
 mkdirSync(dirname(resolve(destination,path)),{recursive:true});writeFileSync(resolve(destination,path),bytes);
 files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
function copy(path){const source=resolve('dist-pages',path);if(!lstatSync(source).isFile())throw new Error('Expected a regular file: '+path);add(path,readFileSync(source));}
copy('index.html');
copy('pcm-worklet.js');
for(const file of readdirSync('dist-pages/assets'))if(/\.(js|css)$/.test(file))copy('assets/'+file);
copy('models/v8-working.glb');
for(const file of ['V8-MODEL-LICENSE.txt','V8-MODEL-NOTICE.txt'])copy('licenses/'+file);
if(!readFileSync(resolve(destination,'licenses/V8-MODEL-LICENSE.txt')).equals(readFileSync('licenses/V8-MODEL-LICENSE.txt')))throw new Error('Model license changed');
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
for(const dependency of Object.keys(lock.packages).filter(path=>path.startsWith('node_modules/')&&existsSync(path))){
 for(const file of readdirSync(dependency).filter(file=>/^licen[cs]e(?:\..*)?$/i.test(file))){const path=resolve(dependency,file);if(lstatSync(path).isFile())add('licenses/third-party/'+dependency.replace(/^node_modules\//,'').replaceAll('/','__')+'--'+basename(file),readFileSync(path));}
}
add('.nojekyll','');
add('README.md',`# V8 智能车窗 · 在线预览\n\n访问 https://miko-servax.github.io/AISpeech-demo/\n\n[完整应用源码与部署文档](https://github.com/Miko-servax/AISpeech-source)（Vue前端、Node后端、测试及发布用GLB）。此仓库仅保存编译后的页面。\n\n支持旋转、四窗独立升降、按钮/滑块与明确文字指令、连续追问和并行复合指令。${apiBase?'语音和AI请求发往独立HTTPS后端，云服务密钥仅留在后端；目前AI文字控车已验证，腾讯ASR境外调用限制6001尚待解决，语音未完成验收。':'语音与AI所需后端尚未连接。'}\n\nV8 Executive 原作者 GTV Lab，应用工作副本未减面。原始授权和来源保留于 licenses/，依赖许可证保留于 licenses/third-party/。模型仅随本应用展示；不得作为独立资产或资源库再分发。\n\n本仓库不含后端凭据、源模型库、本机证书或临时测试记录。\n`);
const report={builtAt:new Date().toISOString(),mode:apiBase?'connected-preview':'static-preview',backendEnabled:Boolean(apiBase),modelLicensePresent:true,configuredCredentialsAbsent:true,files};
writeFileSync(resolve(destination,'DEPLOYMENT-MANIFEST.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:destination,files:files.length,bytes:files.reduce((total,file)=>total+file.bytes,0),configuredCredentialsAbsent:true,originalModelFilesExcluded:true,modelLicensePresent:true},null,2));
