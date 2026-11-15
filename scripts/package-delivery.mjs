import {existsSync,lstatSync,readdirSync,readFileSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,relative,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const root=resolve('.');const stamp=new Date().toISOString().replace(/[:.]/g,'-');const base=resolve('.cache','delivery-'+stamp),output=resolve('delivery',stamp);mkdirSync(base,{recursive:true});
const secrets=new Set();for(const values of [process.env,...['server/.env.local','.env.local'].filter(existsSync).map(p=>parseEnv(readFileSync(p,'utf8')))])for(const key of ['TENCENT_SECRET_ID','TENCENT_SECRET_KEY','INTENT_API_KEY'])if(values[key]?.length>=8)secrets.add(values[key]);
function inspect(name,data){
 const parts=name.split('/');if(parts.some(p=>['node_modules','.git','.cache','.local-https','delivery'].includes(p))||/\.(pem|key|crt|cer|csr|srl|der|p12|pfx|jks|keystore|log|tsbuildinfo)$/i.test(name)||basename(name)==='.DS_Store'||(basename(name).startsWith('.env')&&!basename(name).endsWith('.example'))||name.endsWith('.local'))throw new Error('Excluded delivery path: '+name);
 if(/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n/m.test(data.toString('utf8')))throw new Error('Private key found: '+name);
 for(const secret of secrets)if(data.includes(Buffer.from(secret)))throw new Error('Configured credential found in '+name+' (value withheld)');
}
function copy(from,to,baseDir){const stat=lstatSync(from);if(stat.isSymbolicLink())throw new Error('Symlink is not permitted: '+from);if(stat.isDirectory()){for(const name of readdirSync(from))copy(resolve(from,name),resolve(to,name),baseDir);return;}const name=relative(baseDir,to).split('\\').join('/');const data=readFileSync(from);inspect(name,data);mkdirSync(dirname(to),{recursive:true});writeFileSync(to,data);}
function add(from,to,baseDir){copy(resolve(from),resolve(baseDir,to),baseDir);}
function generated(path,data,baseDir){const bytes=Buffer.from(data);inspect(path,bytes);mkdirSync(dirname(resolve(baseDir,path)),{recursive:true});writeFileSync(resolve(baseDir,path),bytes);}
const pkg=JSON.parse(readFileSync('package.json'));const lock=JSON.parse(readFileSync('package-lock.json'));
if(!readFileSync('public/licenses/V8-MODEL-LICENSE.txt').equals(readFileSync('model-review/V8 Executive/v8_executive_01/LICENSE.txt')))throw new Error('Model license differs from original');
const licenseDir=resolve(base,'licenses');mkdirSync(licenseDir,{recursive:true});copyFileSync('public/licenses/V8-MODEL-LICENSE.txt',resolve(licenseDir,'V8-MODEL-LICENSE.txt'));copyFileSync('public/licenses/V8-MODEL-NOTICE.txt',resolve(licenseDir,'V8-MODEL-NOTICE.txt'));
for(const path of Object.keys(lock.packages).filter(p=>p.startsWith('node_modules/')&&existsSync(p))){for(const name of readdirSync(path).filter(n=>/^licen[cs]e(?:\..*)?$/i.test(n))){const source=resolve(path,name);if(lstatSync(source).isFile())copyFileSync(source,resolve(licenseDir,path.replace(/^node_modules\//,'').replaceAll('/','__')+'--'+name));}}
const runtime=resolve(base,'aispeech-runtime');mkdirSync(runtime,{recursive:true});
for(const file of ['index.html','pcm-worklet.js'])add('dist/'+file,'frontend/'+file,runtime);
add('dist/assets','frontend/assets',runtime);add('dist/models','frontend/models',runtime);add('dist/licenses','frontend/licenses',runtime);
for(const file of ['server/asr.mjs','server/intent.mjs','server/hotwords.mjs','server/public-access.mjs','server/config/asr-hotwords.json'])add(file,'backend/'+file,runtime);
for(const file of readdirSync('shared').filter(n=>n.endsWith('.mjs')))add('shared/'+file,'backend/shared/'+file,runtime);
const backendPkg={name:'aispeech-backend',version:pkg.version,private:true,type:'module',engines:pkg.engines,scripts:{start:'node server/asr.mjs'},dependencies:{ws:pkg.dependencies.ws}};
const backendLock={name:backendPkg.name,version:backendPkg.version,lockfileVersion:3,requires:true,packages:{'':{name:backendPkg.name,version:backendPkg.version,dependencies:backendPkg.dependencies,engines:backendPkg.engines},'node_modules/ws':lock.packages['node_modules/ws']}};
generated('backend/package.json',JSON.stringify(backendPkg,null,2)+'\n',runtime);generated('backend/package-lock.json',JSON.stringify(backendLock,null,2)+'\n',runtime);
add('deploy','deploy',runtime);for(const file of readdirSync('docs').filter(n=>n.endsWith('.md')))add('docs/'+file,'docs/'+file,runtime);add('README.md','README.md',runtime);copy(licenseDir,resolve(runtime,'licenses'),runtime);
const source=resolve(base,'aispeech-source');mkdirSync(source,{recursive:true});
for(const file of ['package.json','package-lock.json','.env.example','.gitignore','.nvmrc','.editorconfig','tsconfig.json','vite.config.ts','index.html','README.md','render.yaml'])if(existsSync(file))add(file,file,source);
for(const dir of ['src','public','shared','scripts','docs','deploy'])add(dir,dir,source);
for(const file of ['asr.mjs','intent.mjs','hotwords.mjs','public-access.mjs','.env.example','config/asr-hotwords.json'])add('server/'+file,'server/'+file,source);
const original='model-review/V8 Executive/v8_executive_01/';for(const file of ['V8-Executive.fbx','LICENSE.txt','README.txt','SHA256SUMS.txt','technical-details.json','Previews'])if(existsSync(original+file))add(original+file,original+file,source);
for(const file of readdirSync('model-review/v8-working').filter(n=>/\.(mjs|ts|json|md)$/.test(n)))add('model-review/v8-working/'+file,'model-review/v8-working/'+file,source);
copy(licenseDir,resolve(source,'licenses'),source);
mkdirSync(output,{recursive:true});const results=[];
for(const dir of [runtime,source]){
 const files=[];function walk(path){for(const name of readdirSync(path)){const full=resolve(path,name);if(lstatSync(full).isDirectory())walk(full);else{const data=readFileSync(full);const name=relative(dir,full).split('\\').join('/');inspect(name,data);files.push({path:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}}}walk(dir);
 if(!files.some(f=>f.path==='licenses/V8-MODEL-LICENSE.txt'))throw new Error('Model license missing');
 generated('DELIVERY-MANIFEST.json',JSON.stringify({generatedAt:new Date().toISOString(),type:basename(dir),credentialValueScan:true,files},null,2),dir);
 const archive=resolve(output,basename(dir)+'.tar.gz');const tar=spawnSync('tar',['-czf',archive,'-C',base,basename(dir)],{encoding:'utf8'});if(tar.status!==0)throw new Error('Archive creation failed');
 const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});if(listing.status!==0)throw new Error('Archive verification failed');
 for(const path of listing.stdout.split('\n').filter(Boolean)){if(path.includes('/.env.local')||path.includes('/.local-https/')||path.includes('/node_modules/')||path.includes('/.cache/'))throw new Error('Excluded file in archive');}
 const archiveBytes=readFileSync(archive);results.push({archive:relative(root,archive),files:files.length,bytes:archiveBytes.length,sha256:createHash('sha256').update(archiveBytes).digest('hex')});
}
writeFileSync(resolve(output,'SHA256SUMS.txt'),results.map(r=>r.sha256+'  '+basename(r.archive)).join('\n')+'\n');writeFileSync(resolve(output,'package-report.json'),JSON.stringify({generatedAt:new Date().toISOString(),checks:{allowlist:true,noSymlinks:true,noPrivateKeys:true,configuredCredentialsAbsent:true,modelLicensePresent:true,archiveListingChecked:true},results},null,2));
rmSync(base,{recursive:true,force:true});
console.log(JSON.stringify({output:relative(root,output),results},null,2));
