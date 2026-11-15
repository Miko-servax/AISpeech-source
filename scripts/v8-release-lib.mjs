import {readFileSync,existsSync} from 'node:fs';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {applyModelMaterials} from '../src/scene/model-materials.mjs';
export const sourcePath='model-review/V8 Executive/v8_executive_01/V8-Executive.fbx';
export const patchPath='model-review/v8-working/door-cavity.patch.json';
export function loadWorking(){
 if(!existsSync(sourcePath)||!existsSync(patchPath))throw new Error('原始FBX/门腔几何不随公开源码分发。普通运行使用public/models中的GLB；几何重建需取得授权源资产，见README。');
 globalThis.window={URL};const bytes=readFileSync(sourcePath);const root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');applyModelMaterials(root);
 const patch=JSON.parse(readFileSync(patchPath));const loader=new T.BufferGeometryLoader();
 for(const item of patch.patches){const mesh=root.getObjectByName(item.node);const old=mesh.geometry;mesh.geometry=loader.parse(item.geometry);old.dispose();mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);}
 for(const item of patch.additions){const mesh=new T.Mesh(loader.parse(item.geometry),new T.MeshStandardMaterial({color:item.color,roughness:.7}));mesh.name=item.node;root.add(mesh);}
 root.updateMatrixWorld(true);return root;
}
export function meshStats(root){const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});return {meshes:meshes.length,triangles:meshes.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3,0),vertices:meshes.reduce((n,o)=>n+o.geometry.attributes.position.count,0),transparentMeshes:meshes.filter(o=>(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transparent)).length};}
export function protectedMesh(o){return /^Door|^Glass|wheel|tire|tyre|brake/i.test(o.name)||(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transparent);}
export function nodePolyfills(){
 globalThis.ProgressEvent??=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
 globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onloadend?.();});}};
}
