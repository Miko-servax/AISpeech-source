import {existsSync,statSync,createReadStream} from 'node:fs';
import {resolve} from 'node:path';
// Mirrors gzip_static hosting for local dev/production preview. Other assets use Vite defaults.
export function modelGzip(root){return (req,res,next)=>{
 const accepted=/(?:^|,)\s*gzip\s*(?:;\s*q=([0-9.]+))?/i.exec(req.headers['accept-encoding']??'');
 if(!['GET','HEAD'].includes(req.method)||req.url?.split('?')[0]!=='/models/v8-working.glb'||!accepted||accepted[1]!==undefined&&Number(accepted[1])===0)return next();
 const file=resolve(root,'models/v8-working.glb.gz');if(!existsSync(file))return next();const stat=statSync(file);const etag='"'+stat.size+'-'+stat.mtimeMs+'"';
 res.setHeader('Vary','Accept-Encoding');res.setHeader('Cache-Control','no-cache');res.setHeader('ETag',etag);
 if(req.headers['if-none-match']===etag){res.statusCode=304;res.end();return;}
 res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',stat.size);
 if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
};}
