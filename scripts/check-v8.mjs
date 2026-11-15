import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createPinia, setActivePinia } from 'pinia';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as T from 'three';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })).toString('base64');
const configUrl = moduleUrl(readFileSync('src/config/v8-windows.ts','utf8'));
const { windowConfig, windowIds, fixedQuarterNodes, sampleTrack } = await import(configUrl);
const batchUrl = new URL('../shared/batch.mjs',import.meta.url).href;
const sharedUrl = new URL('../shared/intent.mjs',import.meta.url).href;
const commandUrl = moduleUrl(readFileSync('src/commands/vehicle-command.ts','utf8').replaceAll("'../../shared/intent.mjs'",JSON.stringify(sharedUrl)).replaceAll("'../../shared/batch.mjs'",JSON.stringify(batchUrl)).replaceAll("'../config/v8-windows'",JSON.stringify(configUrl)));
const storeUrl = moduleUrl(readFileSync('src/stores/vehicle.ts','utf8').replaceAll("'../../shared/intent.mjs'",JSON.stringify(sharedUrl)).replaceAll("'../../shared/batch.mjs'",JSON.stringify(batchUrl)).replaceAll("'pinia'",JSON.stringify(import.meta.resolve('pinia'))).replaceAll("'../config/v8-windows'",JSON.stringify(configUrl)).replaceAll("'../commands/vehicle-command'",JSON.stringify(commandUrl)));
const { useVehicleStore } = await import(storeUrl); setActivePinia(createPinia()); const store = useVehicleStore();
store.setWindow('RR',0.5); for(let i=0;i<50;i++)store.tick(0.05); assert.ok(Math.abs(store.windows.RR.current-0.5)<1e-9); assert.equal(store.windows.FL.current,0);
store.setWindow('RR',0);store.tick(0.05); assert.ok(store.windows.RR.current<0.5&&store.windows.RR.current>0.48);
store.togglePlayback();store.tick(0.1);store.togglePlayback();const paused=store.windows.RR.current;store.tick(1);assert.equal(store.windows.RR.current,paused);
store.setAll(1);for(let i=0;i<100;i++)store.tick(0.05);for(const id of windowIds)assert.ok(Math.abs(store.windows[id].current-1)<1e-9);
globalThis.window={URL,innerWidth:1,innerHeight:1};
const path='model-review/V8 Executive/v8_executive_01/V8-Executive.fbx';const bytes=readFileSync(path);const sha=createHash('sha256').update(bytes).digest('hex');
const checksums=readFileSync('model-review/V8 Executive/v8_executive_01/SHA256SUMS.txt','utf8');assert.ok(checksums.toLowerCase().includes(sha),'Original FBX must match author checksum');
const car=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');car.updateMatrixWorld(true);
const patch=JSON.parse(readFileSync('model-review/v8-working/door-cavity.patch.json','utf8'));const loader=new T.BufferGeometryLoader();for(const item of patch.patches){const m=car.getObjectByName(item.node);m.geometry=loader.parse(item.geometry);m.position.set(0,0,0);m.quaternion.identity();m.scale.set(1,1,1);}car.updateMatrixWorld(true);
const quarters=fixedQuarterNodes.map(name=>{const o=car.getObjectByName(name);assert.ok(o);return {o,matrix:o.matrixWorld.clone()};});
for(const id of windowIds){const mesh=car.getObjectByName(windowConfig[id].node);assert.ok(mesh instanceof T.Mesh);mesh.geometry.computeBoundingBox();const initial=mesh.position.clone(),rot=mesh.quaternion.clone(),pivot=mesh.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(mesh.matrix);const original=mesh.matrixWorld.clone();let last;
for(let i=0;i<=100;i++){const pose=sampleTrack(windowConfig[id].keyframes,i/100);const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),T.MathUtils.degToRad(pose.rotationX));mesh.quaternion.copy(q).multiply(rot);mesh.position.copy(initial).sub(pivot).applyQuaternion(q).add(pivot).add(new T.Vector3(...pose.offset));car.updateMatrixWorld(true);assert.ok(mesh.visible);assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));if(i===0)assert.ok(mesh.matrixWorld.equals(original));if(last)assert.ok(mesh.position.distanceTo(last)<1);last=mesh.position.clone();for(const fixed of quarters)assert.ok(fixed.o.matrixWorld.equals(fixed.matrix));}
const card=car.getObjectByName(`Door_${id}__V8_DoorCard_Door${id[0]==='F'?'Front':'Rear'}${id[1]}`); if(card){const box=new T.Box3().setFromObject(card,true); const pos=mesh.geometry.attributes.position;let inside=0;for(let i=0;i<pos.count;i++){const v=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);if(box.containsPoint(v))inside++;}console.log(id,'pane vertices inside door-card bounding box',inside,'/',pos.count);}
console.log(id,'full-open bounds (cm)',new T.Box3().setFromObject(mesh, true).min.toArray(),new T.Box3().setFromObject(mesh, true).max.toArray());mesh.position.copy(initial);mesh.quaternion.copy(rot);}
console.log('PASS: independent state, interrupted motion, pause, all-open, 101 rigid poses/window, fixed quarters, original FBX SHA256',sha);
console.log('These checks do not certify collision-free door cavities or all-view visibility.');
