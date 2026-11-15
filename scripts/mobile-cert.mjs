import {mkdirSync,existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {mobileConfig} from './mobile-config.mjs';
export function ensureMobileCertificate(config){
 const dir=resolve('.local-https');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 const file=name=>resolve(dir,name);
 const openssl=args=>{const result=spawnSync('openssl',args,{encoding:'utf8'});if(result.status!==0)throw new Error('OpenSSL证书操作失败：'+(result.error?.message??result.stderr?.slice(-400)));};
 if(existsSync(file('ca-key.pem'))!==existsSync(file('ca.pem')))throw new Error('测试CA文件不完整，请检查.local-https，不能自动替换手机已信任的CA');
 if(!existsSync(file('ca.pem'))){
  writeFileSync(file('ca.cnf'),'[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=AISpeech Local Test CA\nO=AISpeech Local Development\n[ca]\nbasicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
  openssl(['req','-x509','-newkey','rsa:3072','-nodes','-sha256','-days','365','-keyout',file('ca-key.pem'),'-out',file('ca.pem'),'-config',file('ca.cnf')]);chmodSync(file('ca-key.pem'),0o600);
 }
 const ca=new X509Certificate(readFileSync(file('ca.pem')));if(Date.parse(ca.validTo)<Date.now()+86400000)throw new Error('测试CA将到期，请重新准备CA并在手机更新信任');
 let leaf;try{leaf=new X509Certificate(readFileSync(file('server.pem')));}catch{}
 if(!leaf||!existsSync(file('server-key.pem'))||!leaf.checkIP(config.host)||Date.parse(leaf.validTo)<Date.now()+2*86400000||!leaf.verify(ca.publicKey)){
  writeFileSync(file('server.cnf'),`[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=${config.host}\nO=AISpeech Local Development\n[server]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${config.host},IP:127.0.0.1,DNS:localhost\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`);
  openssl(['req','-new','-newkey','rsa:2048','-nodes','-sha256','-keyout',file('server-key.pem'),'-out',file('server.csr'),'-config',file('server.cnf')]);chmodSync(file('server-key.pem'),0o600);
  openssl(['x509','-req','-in',file('server.csr'),'-CA',file('ca.pem'),'-CAkey',file('ca-key.pem'),'-CAcreateserial','-out',file('server.pem'),'-days','30','-sha256','-extfile',file('server.cnf'),'-extensions','server']);
 }
 openssl(['x509','-in',file('ca.pem'),'-outform','DER','-out',file('AISpeech-Local-CA.cer')]);
 const result={...config,cert:file('server.pem'),key:file('server-key.pem'),ca:file('ca.pem'),publicCA:file('AISpeech-Local-CA.cer'),caFingerprint:ca.fingerprint256};
 writeFileSync(file('connection.json'),JSON.stringify(result,null,2),{mode:0o600});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const c=ensureMobileCertificate(mobileConfig());console.log(JSON.stringify({origin:c.origin,publicCA:c.publicCA,fingerprint:c.caFingerprint},null,2));}
