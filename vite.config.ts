import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {modelGzip} from './scripts/serve-model-gzip.mjs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const privateModelAssets: Record<string,string> = {
  'virtual:v8-source-fbx': resolve('model-review/V8 Executive/v8_executive_01/V8-Executive.fbx'),
  'virtual:v8-cavity-patch': resolve('model-review/v8-working/door-cavity.patch.json'),
};
const hasModelSources = Object.values(privateModelAssets).every(existsSync);

export default defineConfig({
  define: {__V8_MODEL_SOURCES__: JSON.stringify(hasModelSources)},
  plugins: [vue(),{
    name:'optional-v8-model-sources',
    resolveId(id){if(id in privateModelAssets)return '\0'+id;},
    load(id){const asset=privateModelAssets[id.slice(1)];if(id.startsWith('\0')&&asset)return existsSync(asset)?`export {default} from ${JSON.stringify(asset+'?url')};`:'export default "";';},
  },{name:'model-gzip',configureServer(server){server.middlewares.use(modelGzip(resolve(server.config.root,'public')));},configurePreviewServer(server){server.middlewares.use(modelGzip(resolve(server.config.root,server.config.build.outDir)));}}],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
