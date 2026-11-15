import assert from 'node:assert/strict';
import {classifyText,validateIntent} from '../shared/intent.mjs';
import {splitClauses,validateBatchIntent} from '../shared/batch.mjs';
import {parseVehicleText} from '../src/commands/vehicle-command';
import {useVehicleStore} from '../src/stores/vehicle';
import {createPinia,setActivePinia} from 'pinia';
const cases:[string,string,string][]=[
 ['能不能帮我把前排开一半、后排关上','model_fallback','executed'],
 ['可不可以帮我把前排开一半、后排关上好吗？','model_fallback','executed'],
 ['帮我把左前车窗打开好吗','matched','executed'],
 ['能不能控制前排车窗','non_imperative','clarify'],
 ['能不能帮我看看前排车窗开没开','non_imperative','clarify'],
 ['帮我看看右后窗关了吗','non_imperative','clarify'],
 ['前排车窗现在开了吗','non_imperative','clarify'],
 ['前排车窗开没开','non_imperative','clarify'],
 ['不要把前排开一半、后排关上','negated','clarify'],
 ['能不能帮我不要打开前排车窗','negated','clarify'],
 ['前排开一半、后排不要关上','negated','clarify'],
];
for(const [text,reason,status]of cases){
 setActivePinia(createPinia());const store=useVehicleStore();const parsed=parseVehicleText(text);
 assert.equal(classifyText(text),reason,text);
 const result=store.submitText(text,'text');assert.equal(result.status,status,text);
 if(status==='clarify'){assert.equal(store.lastCommand,null);assert.ok(Object.values(store.windows).every(w=>w.target===0));}
 else if(text.includes('前排'))assert.deepEqual(Object.values(store.windows).map(w=>w.target),[.5,.5,0,0]);
 console.log(JSON.stringify({text,classifyText:reason,parseReason:parsed.reason,ok:parsed.ok,...(parsed.ok?{items:parsed.items??[{targets:parsed.targets,operation:parsed.operation}]}:{}),result:result.status}));
}
for(const text of ['左前、右前车窗开一半','主驾、副驾车窗开一半','打开左前、右前车窗']){
 assert.deepEqual(splitClauses(text),[text]);assert.equal(classifyText(text),'model_fallback');assert.equal(parseVehicleText(text).reason,'model_fallback');
 assert.doesNotThrow(()=>validateIntent({type:'command',target:{source:'explicit',ids:['FL','FR'],candidates:[]},operation:{kind:'absolute',value:text.includes('一半')?.5:1},missing:null},text,{active:null,pending:null}));
 console.log(JSON.stringify({text,clauses:splitClauses(text),classifyText:classifyText(text)}));
}
assert.deepEqual(splitClauses('左前、右前车窗开一半、后排车窗关上'),['左前、右前车窗开一半','后排车窗关上']);
assert.deepEqual(splitClauses('左前，右前车窗开一半，后排车窗关上'),['左前，右前车窗开一半','后排车窗关上']);
const raw='能不能帮我把前排玻璃落到一半、后排玻璃收好好吗？';const clauses=splitClauses(raw);
const result={type:'command',items:clauses.map((clause,index)=>({clause,intent:{type:'command',target:{source:'explicit',ids:index?['RL','RR']:['FL','FR'],candidates:[]},operation:{kind:'absolute',value:index?0:.5},missing:null}}))};
assert.doesNotThrow(()=>validateBatchIntent(result,raw,{active:null,pending:null}));
console.log('PASS: execution requests, capability/state/negative fences, contextual enumeration delimiters and model request clauses');
