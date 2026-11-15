import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import * as T from 'three';
import ts from 'typescript';
import {loadWorking,meshStats,nodePolyfills,protectedMesh,sourcePath,patchPath} from './v8-release-lib.mjs';
nodePolyfills();const original=loadWorking();const bytes=readFileSync('public/models/v8-working.glb');
assert.ok(gunzipSync(readFileSync('public/models/v8-working.glb.gz')).equals(bytes),'gzip payload must match GLB');
const started=performance.now();const loaded=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
const parseMs=performance.now()-started;const manifest=JSON.parse(readFileSync('public/models/v8-working.manifest.json'));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');assert.equal(hash(sourcePath),manifest.source.sha256);assert.equal(hash(patchPath),manifest.patch.sha256);assert.equal(hash('public/models/v8-working.glb'),manifest.glb.sha256);
assert.equal(meshStats(loaded).triangles,meshStats(original).triangles);assert.equal(meshStats(loaded).transparentMeshes,meshStats(original).transparentMeshes);
const decodeAttributes=g=>{const p=g.attributes.position;const count=g.index?.count??p.count;const array=new Float32Array(count*3);for(let i=0;i<count;i++)for(let c=0;c<3;c++)array[i*3+c]=p.array[(g.index?g.index.getX(i):i)*3+c];return Buffer.from(array.buffer);};
const relative=(o,root)=>new T.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
original.updateMatrixWorld(true);loaded.updateMatrixWorld(true);let preserved=0;
for(const name of manifest.protectedNames){const a=original.getObjectByName(name),b=loaded.getObjectByName(name);assert.ok(a&&b,name);assert.ok(decodeAttributes(a.geometry).equals(decodeAttributes(b.geometry)),name+' positions changed');
 const m=relative(a,original);const n=b.matrixWorld; // GLTF scene contains the exported FBX root.
 assert.ok(m.elements.every((v,i)=>Math.abs(v-n.elements[i])<1e-6),name+' matrix');assert.equal(b.material.transparent,a.material.transparent,name);assert.ok(Math.abs(b.material.opacity-a.material.opacity)<1e-8);assert.equal(b.material.side,a.material.side);preserved++;
}
// Merged static batches also preserve every triangle position and contributor order.
let mergedVerified=0;loaded.traverse(mesh=>{if(!mesh.isMesh||!mesh.userData.sourceNodes)return;
 const expected=mesh.userData.sourceNodes.map(name=>{const source=original.getObjectByName(name);const geometry=source.geometry.clone().applyMatrix4(relative(source,original));return decodeAttributes(geometry);});
 assert.ok(Buffer.concat(expected).equals(decodeAttributes(mesh.geometry)),mesh.name+' merged triangles changed');mergedVerified++;
});assert.equal(mergedVerified,manifest.merged.length);
const configCode=ts.transpile(readFileSync('src/config/v8-windows.ts','utf8'),{module:ts.ModuleKind.ESNext});const {windowConfig,windowIds,fixedQuarterNodes,sampleTrack}=await import('data:text/javascript;base64,'+Buffer.from(configCode).toString('base64'));
const quarters=fixedQuarterNodes.map(name=>({mesh:loaded.getObjectByName(name),matrix:loaded.getObjectByName(name).matrixWorld.clone()}));
for(const id of windowIds){const a=original.getObjectByName(windowConfig[id].node),b=loaded.getObjectByName(windowConfig[id].node);a.geometry.computeBoundingBox();b.geometry.computeBoundingBox();assert.ok(a.geometry.boundingBox.equals(b.geometry.boundingBox));const pivot=b.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(b.matrix);const initial=b.position.clone(),rot=b.quaternion.clone();
 for(let step=0;step<=100;step++){const pose=sampleTrack(windowConfig[id].keyframes,step/100);const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),T.MathUtils.degToRad(pose.rotationX));b.quaternion.copy(q).multiply(rot);b.position.copy(initial).sub(pivot).applyQuaternion(q).add(pivot).add(new T.Vector3(...pose.offset));loaded.updateMatrixWorld(true);assert.ok(b.matrixWorld.elements.every(Number.isFinite));for(const quarter of quarters)assert.ok(quarter.mesh.matrixWorld.equals(quarter.matrix));}b.position.copy(initial);b.quaternion.copy(rot);
}
const times=[parseMs];for(let i=0;i<3;i++){const t=performance.now();await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');times.push(performance.now()-t);}
mkdirSync('.cache/performance',{recursive:true});writeFileSync('.cache/performance/v8-release-validation.json',JSON.stringify({generatedAt:new Date().toISOString(),meshStats:meshStats(loaded),protectedNodesVerified:preserved,mergedGroupsVerified:mergedVerified,posesPerWindow:101,localNodeGLBParseMs:times,note:'Node parse timings, not browser/mobile. Protected triangle positions and node transforms match; source and patch hashes unchanged.'},null,2));
console.log('PASS: lossless GLB load, unchanged triangle count, all '+preserved+' protected nodes/transparent meshes, four 101-pose tracks, fixed quarters, source fingerprints. Node parse ms:',times.map(n=>Math.round(n)));
