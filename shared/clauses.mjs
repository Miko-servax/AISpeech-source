// Strip only explicit service-request wrappers; retain the requested content for safety checks.
export function requestContent(raw){
  let text=raw.trim();
  if(/了吗|了么|了没有|有没有|是不是|是否|多少|状态|支持|具备|查看|查询|看看|确认|开没开|关没关|开了没|关了没/.test(text))return text;
  const wrapper=/^(?:能不能|能否|可不可以|可以|能)(?:请)?(?:帮我|帮忙|替我|麻烦你)/;
  const explicit=wrapper.test(text)||/^(?:请|麻烦|帮我|帮忙)/.test(text);
  if(wrapper.test(text))text=text.replace(wrapper,'帮我');
  if(explicit)text=text.replace(/(?:好吗|好不好|可以吗|行吗|吗)[？?。！!]*$/,'').replace(/[？?]+$/,'');
  return text;
}
// Split actions, not enumerated window names. Keep each clause's original text for model evidence.
export function splitClauses(raw){
  const separators=[...raw.matchAll(/[，,、；;]|并且|同时|以及|顺便/g)];
  const parts=[];let start=0;
  for(const separator of separators){parts.push({start,end:separator.index,text:raw.slice(start,separator.index)});start=separator.index+separator[0].length;}
  parts.push({start,end:raw.length,text:raw.slice(start)});
  const action=/开|关|升|降|落|收|抬|挪|低|高|透|留|合/;
  const clauses=[];let groupStart=0;
  for(let i=0;i<parts.length;i++){
    const group=raw.slice(groupStart,parts[i].end).trim();
    if(i===parts.length-1||action.test(group)&&action.test(parts[i+1].text)){
      if(group)clauses.push(group);
      groupStart=parts[i+1]?.start??raw.length;
    }
  }
  return clauses.length>1&&clauses.every(part=>action.test(part))?clauses:[raw.trim()];
}
