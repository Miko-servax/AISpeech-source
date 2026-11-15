export function allowedOrigins(env){return (env.ALLOWED_ORIGINS||'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean);}
/** Apply CORS before routing so error responses are also readable by the allowed page. */
export function cors(req,res,env){
 const origin=req.headers.origin;
 res.setHeader('Vary','Origin');
 if(origin&&!allowedOrigins(env).includes(origin)){res.writeHead(403).end(JSON.stringify({message:'请求来源不允许'}));return false;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 if(req.method!=='OPTIONS')return true;
 const method=req.url==='/api/intent'?'POST':req.url==='/api/health'?'GET':null;
 const headers=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
 if(!origin||req.headers['access-control-request-method']!==method||headers.some(h=>h!=='content-type')){res.writeHead(403).end('{}');return false;}
 res.setHeader('Access-Control-Allow-Methods',method);res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204).end();return false;
}
/** A process-wide safeguard, not a billing cap or identity check. */
export function requestBudget(maximum,now=Date.now){let started=now(),count=0;return ()=>{const time=now();if(time-started>=60000){started=time;count=0;}if(count>=maximum)return false;count++;return true;};}
