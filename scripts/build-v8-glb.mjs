import {compressGLB} from './compress-glb.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {loadWorking,meshStats,protectedMesh,nodePolyfills,sourcePath,patchPath} from './v8-release-lib.mjs';
nodePolyfills();const root=loadWorking();const before=meshStats(root);const protectedNames=[];const groups=new Map();
root.traverse(o=>{if(!o.isMesh)return;if(protectedMesh(o)){protectedNames.push(o.name);return;}if(Array.isArray(o.material)||o.children.length)return;const key=o.material.uuid+'|'+Object.keys(o.geometry.attributes).sort().join();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
// Only static opaque meshes merge. Door/window cavities and all transparent objects keep their nodes.
const merged=[];let groupIndex=0;const inverse=new T.Matrix4().copy(root.matrixWorld).invert();
for(const meshes of groups.values())if(meshes.length>1){
 const geometries=meshes.map(mesh=>{const g=mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));return g.index?g.toNonIndexed():g;});
 const geometry=mergeGeometries(geometries,false);if(!geometry)throw new Error('Static merge failed');const mesh=new T.Mesh(geometry,meshes[0].material);mesh.name='StaticOpaque_'+groupIndex++;mesh.userData.sourceNodes=meshes.map(m=>m.name);root.add(mesh);merged.push({node:mesh.name,sourceNodes:mesh.userData.sourceNodes});meshes.forEach(m=>m.removeFromParent());
}
// Exact full-attribute indexing: no tolerance, no position/normal/UV quantization, no face removal.
root.traverse(mesh=>{if(!mesh.isMesh||mesh.geometry.index)return;const g=mesh.geometry;const entries=Object.entries(g.attributes);const unique=new Map();const remap=[];const indices=[];
 for(let i=0;i<g.attributes.position.count;i++){
  const key=entries.flatMap(([,a])=>Array.from({length:a.itemSize},(_,c)=>a.array[i*a.itemSize+c])).join(',');let index=unique.get(key);if(index===undefined){index=unique.size;unique.set(key,index);remap.push(i);}indices.push(index);
 }
 const out=new T.BufferGeometry();for(const [name,a]of entries){const data=new a.array.constructor(remap.length*a.itemSize);remap.forEach((old,i)=>{for(let c=0;c<a.itemSize;c++)data[i*a.itemSize+c]=a.array[old*a.itemSize+c];});out.setAttribute(name,new T.BufferAttribute(data,a.itemSize,a.normalized));}
 out.setIndex(indices);out.groups=g.groups.map(group=>({...group}));mesh.geometry=out;g.dispose();
});
const after=meshStats(root);if(before.triangles!==after.triangles)throw new Error('Triangle count changed');
const plain=Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false,trs:true}));
const buffer=await compressGLB(plain);
mkdirSync('public/models',{recursive:true});writeFileSync('public/models/v8-working.glb',buffer);writeFileSync('public/models/v8-working.glb.gz',gzipSync(buffer));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const report={generatedAt:new Date().toISOString(),source:{path:sourcePath,sha256:hash(sourcePath)},patch:{path:patchPath,sha256:hash(patchPath)},glb:{path:'public/models/v8-working.glb',bytes:buffer.length,uncompressedGLBBytes:plain.length,gzipBytes:gzipSync(buffer).length,sha256:hash('public/models/v8-working.glb')},before,after,protectedNames,merged,note:'Centimetres retained; runtime root scale remains .01. Exact indexing only; no decimation. All transparent and door/glass/wheel/brake nodes retained.'};
writeFileSync('public/models/v8-working.manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify({before,after,glb:report.glb,protectedNodes:protectedNames.length,mergedGroups:merged.length},null,2));
