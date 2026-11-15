/** Public URLs only. This configuration must never contain credentials. */
export function apiEndpoints(base, pageOrigin) {
 const url=new URL(base?.trim()||'/api',pageOrigin);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('后端地址必须是不含凭据、查询参数的HTTP(S)地址。');
 if(new URL(pageOrigin).protocol==='https:'&&url.protocol!=='https:')throw new Error('HTTPS页面必须连接HTTPS后端。');
 url.pathname=url.pathname.replace(/\/+$/,'');
 const http=url.href.replace(/\/$/,'');const ws=new URL(http);ws.protocol=url.protocol==='https:'?'wss:':'ws:';
 return {health:http+'/health',intent:http+'/intent',asr:ws.href.replace(/\/$/,'')+'/asr',remote:url.origin!==new URL(pageOrigin).origin};
}
