import {existsSync,lstatSync,mkdirSync,readFileSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';

// Export reviewed, version-controlled application files, never private Git history.
// Stage intended new files before running this command. No network operations.
const destination=resolve('.cache/public-source/site');
const excluded=[
  'model-review/V8 Executive/v8_executive_01/V8-Executive.fbx',
  'model-review/v8-working/door-cavity.patch.json',
  'PUBLIC-SOURCE-MANIFEST.json',
];
const tracked=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});
if(tracked.status!==0)throw new Error('Run from a Git checkout with reviewed files staged.');
const credentials=new Set();
for(const values of [process.env,...['.env.local','server/.env.local'].filter(existsSync).map(path=>parseEnv(readFileSync(path,'utf8')))]){
  for(const key of ['TENCENT_APP_ID','TENCENT_SECRET_ID','TENCENT_SECRET_KEY','INTENT_API_KEY'])if(values[key]?.length>=8)credentials.add(values[key]);
}
const files=[],contents=new Map();
for(const path of [...new Set(tracked.stdout.split('\0').filter(Boolean))].sort()){
  if(excluded.includes(path))continue;
  if(path.split('/').some(part=>['.git','.cache','.local-https','node_modules','delivery','dist','dist-pages'].includes(part))||
    (basename(path).startsWith('.env')&&!basename(path).endsWith('.example'))||
    /\.(?:fbx|blend|zip|dmg|pem|key|crt|cer|csr|p12|pfx|log|local|tsbuildinfo)$/i.test(path))throw new Error('Excluded public source path: '+path);
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>95*1024*1024)throw new Error('Unexpected public source file: '+path);
  const bytes=readFileSync(path),text=bytes.toString('utf8');
  if(/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n/m.test(text))throw new Error('Private key found: '+path);
  if(/\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKID[A-Za-z0-9]{28,}|sk-[A-Za-z0-9_-]{24,})\b/.test(text))throw new Error('Potential credential found (value withheld): '+path);
  for(const value of credentials)if(bytes.includes(Buffer.from(value)))throw new Error('Configured credential found (value withheld): '+path);
  files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mode:stat.mode&0o777});contents.set(path,bytes);
}
for(const path of ['src/App.vue','server/asr.mjs','server/intent.mjs','shared/batch.mjs','package-lock.json','README.md','public/models/v8-working.glb','licenses/V8-MODEL-LICENSE.txt','public/licenses/V8-MODEL-LICENSE.txt']){
  if(!files.some(file=>file.path===path))throw new Error('Required application file missing: '+path);
}
if(!readFileSync('licenses/V8-MODEL-LICENSE.txt').equals(readFileSync('public/licenses/V8-MODEL-LICENSE.txt')))throw new Error('Model license differs');
rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});
for(const file of files){const target=resolve(destination,file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,contents.get(file.path));chmodSync(target,file.mode);}
writeFileSync(resolve(destination,'PUBLIC-SOURCE-MANIFEST.json'),JSON.stringify({generatedAt:new Date().toISOString(),privateHistoryIncluded:false,authoringGeometryIncluded:false,configuredCredentialsAbsent:true,excluded,files},null,2)+'\n');
console.log(JSON.stringify({directory:destination,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),authoringGeometryIncluded:false,configuredCredentialsAbsent:true},null,2));
