import * as T from 'three';import {load,baked} from './inspect.mjs';import {writeFileSync} from 'node:fs';
const root=load(); const patches=[];
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
for(const [id,side]of [['FL',-1],['FR',1]]){
 const name=`Door_${id}__V8_DoorCard_DoorFront${id[1]}`;const g=baked(root.getObjectByName(name)); const p=g.attributes.position,ix=g.index,out=[];let changed=0;
 function vertex(v){const original=v.clone(),z=Math.abs(v.z);const weight=smooth(38,44,v.x)*(1-smooth(62,68,v.x))*smooth(46,53,v.y);const depth=smooth(73.5,78.3,z);v.z=side*(z-3.8*weight*depth);if(v.distanceTo(original)>.0001)changed++;out.push(v.x,v.y,v.z);}
 function split(a,b,c,depth=0){const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a);if(Math.max(a.x,b.x,c.x)<38 || Math.min(a.x,b.x,c.x)>68 || Math.max(a.y,b.y,c.y)<46 || Math.max(Math.abs(a.z),Math.abs(b.z),Math.abs(c.z))<73.51 || Math.max(ab,bc,ca)<=4||depth>18){vertex(a.clone());vertex(b.clone());vertex(c.clone());return;}if(ab>=bc&&ab>=ca){const m=a.clone().lerp(b,.5);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(bc>=ca){const m=b.clone().lerp(c,.5);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=c.clone().lerp(a,.5);split(a,b,m,depth+1);split(m,b,c,depth+1);}}
 for(let i=0;i<ix.count;i+=3)split(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix.getX(i+k))));
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(out,3));geo.computeVertexNormals();patches.push({node:name,geometry:geo.toJSON(),modifiedVertexRecords:changed});
}
// Cut a real narrow channel through the sealed upper return of each door skin.
const slots=[];
for(const [id,side,x0,x1,y0,y1,z0,z1] of [
 ['FL',-1,-30.6,74.8,96.8,100,86.9,88.3],['FR',1,-30.6,74.8,96.8,100,86.9,88.3],
 ['RL',-1,-104.2,-39.7,98.9,101.1,86.8,87.7],['RR',1,-104.2,-39.7,98.9,101.1,86.8,87.7]]) {
 const name=`Door_${id}__Body_skin`,g=baked(root.getObjectByName(name)),p=g.attributes.position,n=g.attributes.normal,ix=g.index;
 const lo=[x0,y0,side<0?-z1:z0],hi=[x1,y1,side<0?-z0:z1],out=[],normals=[];
 const planes=[...lo.map((v,i)=>({axis:i,sign:1,value:v})),...hi.map((v,i)=>({axis:i,sign:-1,value:-v}))];
 const mix=(a,b,t)=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize()});
 function cut(poly,plane,inside){const res=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=plane.sign*a.p.getComponent(plane.axis)-plane.value,db=plane.sign*b.p.getComponent(plane.axis)-plane.value,aa=inside?da>=0:da<=0,bb=inside?db>=0:db<=0;if(aa)res.push(a);if(aa!==bb)res.push(mix(a,b,da/(da-db)));}return res;}
 function emit(poly){for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){out.push(...v.p.toArray());normals.push(...v.n.toArray());}}
 for(let i=0;i<ix.count;i+=3){let poly=[0,1,2].map(k=>({p:new T.Vector3().fromBufferAttribute(p,ix.getX(i+k)),n:new T.Vector3().fromBufferAttribute(n,ix.getX(i+k))}));const box=new T.Box3().setFromPoints(poly.map(v=>v.p));if(!box.intersectsBox(new T.Box3(new T.Vector3(...lo),new T.Vector3(...hi)))){emit(poly);continue;}for(const plane of planes){emit(cut(poly,plane,false));poly=cut(poly,plane,true);if(poly.length<3)break;}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(out,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));patches.push({node:name,geometry:geo.toJSON(),slot:{min:lo,max:hi}});slots.push({node:name,min:lo,max:hi});
}
// Physical upper inner-door panels: permanent geometry, independent of animation.
const additions=[];
for(const [id,x0,x1,z]of [['FL',-30.5,76,73.2],['FR',-30.5,76,73.2],['RL',-120,-31.5,76],['RR',-120,-31.5,76]]){
 const side=id.endsWith('L')?-1:1;const top=id.startsWith('F')?99:100.5;const g=new T.BufferGeometry().copy(new T.BoxGeometry(x1-x0,top-87.3,1.2));g.translate((x0+x1)/2,(top+87.3)/2,side*z);additions.push({node:`Working_${id}_InnerBelt`,geometry:g.toJSON(),color:0x303c38});
}
writeFileSync('model-review/v8-working/door-cavity.patch.json',JSON.stringify({version:1,sourceSha256:'56df7214c057bcde046b324078721f9e6cde761838a29ec086aed08efd35193c',coordinateSystem:'centimetres, original combined FBX world axes',patches,additions,slots}));console.log('Working patch:',patches.map(p=>({node:p.node,modifiedVertexRecords:p.modifiedVertexRecords})),additions.map(a=>a.node));
