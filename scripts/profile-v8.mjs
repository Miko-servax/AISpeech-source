// Offline asset baseline: no changes to source model, cavity geometry or motion.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
globalThis.window={URL,innerWidth:1,innerHeight:1};
const modelPath='model-review/V8 Executive/v8_executive_01/V8-Executive.fbx';
const patchPath='model-review/v8-working/door-cavity.patch.json';
const model=readFileSync(modelPath),patchBytes=readFileSync(patchPath);
const asset=(path,bytes)=>({path,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,brotliBytes:brotliCompressSync(bytes).length,sha256:createHash('sha256').update(bytes).digest('hex')});
const start=performance.now();const car=new FBXLoader().parse(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength),'');const fbxParseMs=performance.now()-start;
function stats(root){
 const geometries=new Set(),materials=new Set();const meshes=[];let bytes=0;
 root.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry;geometries.add(g);const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(m=>materials.add(m));
 const triangles=(g.index?g.index.count:g.attributes.position.count)/3;
 const draws=Array.isArray(mesh.material)?g.groups.filter(group=>mats[group.materialIndex]?.visible).length:1;
 const transparentGroups=Array.isArray(mesh.material)?g.groups.filter(group=>/glass|lens|cover/i.test(mats[group.materialIndex]?.name??'')).length:(/glass|lens|cover/i.test(mats[0]?.name??'')?1:0);
 meshes.push({name:mesh.name,vertices:g.attributes.position.count,triangles,indexed:!!g.index,groups:g.groups.length,materialSlots:mats.length,estimatedDrawCalls:draws+transparentGroups,transparentGroups});
 });
 const arrays=new Set();for(const g of geometries){for(const attr of [...Object.values(g.attributes),...(g.index?[g.index]:[])]){const array=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;if(!arrays.has(array)){arrays.add(array);bytes+=array.byteLength;}}}
 return {meshCount:meshes.length,geometryCount:geometries.size,uniqueSourceMaterials:materials.size,materialSlots:meshes.reduce((s,m)=>s+m.materialSlots,0),vertices:meshes.reduce((s,m)=>s+m.vertices,0),triangles:meshes.reduce((s,m)=>s+m.triangles,0),nonIndexedMeshes:meshes.filter(m=>!m.indexed).length,geometryArrayBytes:bytes,estimatedDrawCallsBeforeCulling:meshes.reduce((s,m)=>s+m.estimatedDrawCalls,0),transparentMaterialGroups:meshes.reduce((s,m)=>s+m.transparentGroups,0),largestMeshes:[...meshes].sort((a,b)=>b.triangles-a.triangles).slice(0,15),windowMeshes:meshes.filter(m=>m.name.startsWith('DoorGlass_')),meshes};
}
const original=stats(car);const parseStart=performance.now();const patch=JSON.parse(patchBytes);const jsonParseMs=performance.now()-parseStart;
const applyStart=performance.now();const loader=new T.BufferGeometryLoader();const changes=[];
for(const item of patch.patches){const mesh=car.getObjectByName(item.node);const before=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;mesh.geometry=loader.parse(item.geometry);changes.push({node:item.node,beforeTriangles:before,afterTriangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3});}
for(const item of patch.additions){const mesh=new T.Mesh(loader.parse(item.geometry),new T.MeshStandardMaterial());mesh.name=item.node;car.add(mesh);}
const patchGeometryMs=performance.now()-applyStart;const working=stats(car);
// Stable repeated CPU measurements; they do not represent browser/mobile load time.
const repeats=[];for(let i=0;i<3;i++){const t=performance.now();new FBXLoader().parse(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength),'');const parseMs=performance.now()-t;const j=performance.now();JSON.parse(patchBytes);repeats.push({fbxParseMs:parseMs,patchJSONParseMs:performance.now()-j});}
const report={generatedAt:new Date().toISOString(),kind:'offline-asset-baseline',environment:{node:process.version,platform:process.platform,arch:process.arch},assets:[asset(modelPath,model),asset(patchPath,patchBytes)],cpuTiming:{firstFBXParseMs:fbxParseMs,patchJSONParseMs:jsonParseMs,patchGeometryMs,repeats,note:'Local Node CPU timings; no HTTP, WebGL, GPU upload or mobile emulation. Compression sizes are potential payloads, not observed HTTP transfers.'},original,working,patch:{replacements:patch.patches.length,additions:patch.additions.length,changes},renderConfiguration:{pixelRatioCap:2,antialias:true,material:'MeshStandardMaterial per mesh/material slot',directionalLights:3,hemisphereLights:1,shadows:false,continuousRAF:true,glass:{transparent:true,doubleSided:true,forceSinglePass:false},drawCallEstimateNote:'Before frustum culling, using current material replacement rules; excludes floor/grid, hit meshes, highlights and debug; actual calls require renderer.info.'}};
mkdirSync('.cache/performance',{recursive:true});writeFileSync('.cache/performance/v8-assets-baseline.json',JSON.stringify(report,null,2));
const compact=({meshes,...rest})=>rest;
console.log(JSON.stringify({...report,original:compact(original),working:compact(working)},null,2));
