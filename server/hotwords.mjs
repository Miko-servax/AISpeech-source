import {readFileSync}from'node:fs';
export function loadHotwords(path=new URL('./config/asr-hotwords.json',import.meta.url)){
  const rows=JSON.parse(readFileSync(path,'utf8'));
  if(!Array.isArray(rows)||rows.length>128)throw new Error('ASR热词配置无效');
  const seen=new Set();return rows.map(row=>{if(typeof row.word!=='string'||!row.word||row.word.length>30||/[\s,|]/.test(row.word)||!Number.isInteger(row.weight)||row.weight<1||row.weight>10||seen.has(row.word))throw new Error('ASR热词格式无效（普通权重1至10）');seen.add(row.word);return `${row.word}|${row.weight}`;}).join(',');
}
