import {readFileSync} from 'node:fs';
import * as T from 'three';import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
globalThis.window={URL,innerWidth:1,innerHeight:1};
export function load(){const b=readFileSync('model-review/V8 Executive/v8_executive_01/V8-Executive.fbx');const root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');root.updateMatrixWorld(true);return root;}
export function baked(mesh){const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));g.computeBoundingBox();return g;}
if(process.argv[1].endsWith('/inspect.mjs')){const root=load();for(const name of ['Door_FL__V8_DoorCard_DoorFrontL','Door_RL__V8_DoorCard_DoorRearL','DoorGlass_FL__Front_door_glass','DoorGlass_RL__Rear_door_glass']){const g=baked(root.getObjectByName(name)),p=g.attributes.position;console.log(name,'verts',p.count,'bounds',g.boundingBox.min.toArray(),g.boundingBox.max.toArray());if(p.count<200)console.log(Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]));}}
