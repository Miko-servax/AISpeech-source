import assert from 'node:assert/strict';
import {checkPublishCredentials} from './check-publish-credentials.mjs';
const app='1234567890', host=app+'-abcdef1234.ap-guangzhou.tencentscf.com';
const credentials=[{key:'TENCENT_APP_ID',value:app},{key:'TENCENT_SECRET_KEY',value:'test-secret-abcdef'},{key:'INTENT_API_KEY',value:'test-model-abcdef'}];
const scan=(text,hostname=host)=>checkPublishCredentials(Buffer.from(text),credentials,hostname,'test');
scan('https://'+host+'/api wss://'+host+'/api/asr');
assert.throws(()=>scan('https://'+host+'/api '+app));
assert.throws(()=>scan('https://'+app+'-other.ap-guangzhou.tencentscf.com'));
assert.throws(()=>scan(app,'example.com'));
assert.throws(()=>scan(app,app+'-abcdef1234.ap-guangzhou.tencentscf.com.attacker.invalid'));
for(const {key,value} of credentials.filter(item=>item.key!=='TENCENT_APP_ID')) {
  assert.throws(()=>scan('https://'+host+'/api '+value));
  assert.throws(()=>checkPublishCredentials(Buffer.from('https://'+host),[{key,value:app}],host,'test'));
}
console.log('PASS: exact public SCF host permits AppID only; standalone IDs and all keys remain blocked');
