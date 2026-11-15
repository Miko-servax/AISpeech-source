import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import * as T from 'three';
import ts from 'typescript';
import {meshStats,nodePolyfills} from './v8-release-lib.mjs';
nodePolyfills();
const bytes=readFileSync('public/models/v8-working.glb');
const manifest=JSON.parse(readFileSync('public/models/v8-working.manifest.json','utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.glb.sha256);
assert.ok(gunzipSync(readFileSync('public/models/v8-working.glb.gz')).equals(bytes));
const car=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
car.updateMatrixWorld(true);const stats=meshStats(car);
for(const key of ['meshes','triangles','transparentMeshes'])assert.equal(stats[key],manifest.after[key]);
for(const name of manifest.protectedNames)assert.ok(car.getObjectByName(name)?.isMesh,'Missing protected node: '+name);
const source=ts.transpile(readFileSync('src/config/v8-windows.ts','utf8'),{module:ts.ModuleKind.ESNext});
const {windowIds,windowConfig,fixedQuarterNodes,sampleTrack}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const quarters=fixedQuarterNodes.map(name=>{const mesh=car.getObjectByName(name);assert.ok(mesh);return {mesh,matrix:mesh.matrixWorld.clone()};});
for(const id of windowIds){
 const pane=car.getObjectByName(windowConfig[id].node);assert.ok(pane?.isMesh);pane.geometry.computeBoundingBox();
 const initial=pane.position.clone(),rotation=pane.quaternion.clone(),pivot=pane.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(pane.matrix);
 const opacity=(Array.isArray(pane.material)?pane.material:[pane.material]).map(m=>m.opacity);
 for(let step=0;step<=100;step++){
  const pose=sampleTrack(windowConfig[id].keyframes,step/100),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),T.MathUtils.degToRad(pose.rotationX));
  pane.quaternion.copy(q).multiply(rotation);pane.position.copy(initial).sub(pivot).applyQuaternion(q).add(pivot).add(new T.Vector3(...pose.offset));car.updateMatrixWorld(true);
  assert.ok(pane.visible&&pane.matrixWorld.elements.every(Number.isFinite));
  assert.deepEqual((Array.isArray(pane.material)?pane.material:[pane.material]).map(m=>m.opacity),opacity);
  for(const quarter of quarters)assert.ok(quarter.mesh.matrixWorld.equals(quarter.matrix));
 }
 pane.position.copy(initial);pane.quaternion.copy(rotation);car.updateMatrixWorld(true);
}
console.log('PASS: runtime GLB hash/gzip, manifest mesh counts, protected nodes, four 101-pose tracks and fixed quarters (no private source assets required)');
