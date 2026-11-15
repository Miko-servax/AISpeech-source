import {build} from 'esbuild';import{mkdir,unlink}from'node:fs/promises';
await mkdir('.cache/tests',{recursive:true});const path='.cache/tests/commands.mjs';
for(const entry of ['scripts/commands.test.ts','scripts/intent.test.ts','scripts/history.test.ts','scripts/batch.test.ts','scripts/request-language.test.ts','scripts/render-loop.test.ts']){try{await build({entryPoints:[entry],outfile:path,bundle:true,platform:'node',format:'esm',packages:'external'});await import('../'+path+'?entry='+encodeURIComponent(entry));}finally{await unlink(path).catch(()=>{});}
}
