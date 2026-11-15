import {watch} from 'vue';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {performanceProbe} from './performance-probe';
import {renderLoop} from './render-loop';
import {watchDialogueExpiry} from './dialogue-expiry';
import {assetUrl,modelReviewEnabled} from '../config/runtime';
import {fixedQuarterNodes,sampleTrack,windowConfig,windowIds,type WindowId} from '../config/v8-windows';
import type {useVehicleStore} from '../stores/vehicle';
type Quality='high'|'balanced'|'low';
export function createV8(host:HTMLElement,store:ReturnType<typeof useVehicleStore>,status:(text:string,ready?:boolean)=>void){
 const query=new URLSearchParams(location.search);const baseline=modelReviewEnabled&&query.has('baseline');const useFBX=modelReviewEnabled&&(baseline||query.get('asset')==='fbx');const continuous=query.get('loop')==='continuous';
 const quality:Quality=['high','balanced','low'].includes(query.get('quality')??'')?query.get('quality') as Quality:matchMedia('(pointer:coarse)').matches?'balanced':'high';
 const cap={high:2,balanced:1.25,low:1}[quality];
 const renderer=new T.WebGLRenderer({antialias:quality!=='low'});renderer.setPixelRatio(Math.min(devicePixelRatio,cap));renderer.setClearColor(0xe9eeed);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;host.appendChild(renderer.domElement);
 const probe=performanceProbe(host,renderer,{asset:useFBX?'fbx':'glb',quality,loop:continuous?'continuous':'demand'});
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.01,100);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.2;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;controls.target.set(-.15,.85,0);camera.position.set(6,3.2,-6);
 scene.add(new T.HemisphereLight(0xffffff,0x677c79,2.8));for(const [x,y,z,p]of [[3,5,-4,3],[-4,3,3,2],[0,4,1,1.5]]){const light=new T.DirectionalLight(0xffffff,p);light.position.set(x!,y!,z!);scene.add(light);}
 const floor=new T.Mesh(new T.CircleGeometry(8,80),new T.MeshStandardMaterial({color:0xdce3e1,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);const grid=new T.GridHelper(14,28,0xc4cecb,0xd5ddda);grid.position.y=-.01;scene.add(grid);
 const panes=new Map<WindowId,{mesh:T.Mesh;pivot:T.Vector3;initial:T.Vector3;rotation:T.Quaternion;outline:T.LineSegments;open:number;highlight:boolean}>();
 const hits:T.Mesh[]=[];let car:T.Group|undefined,stopped=false,debug=false,debugScene:T.Scene|undefined,debugPane:T.Mesh|undefined,viewName='perspective';
 let motionConfig=windowConfig;const q=new T.Quaternion(),axis=new T.Vector3(1,0,0),offset=new T.Vector3();
 const moving=()=>windowIds.some(id=>Math.abs(store.windows[id].target-store.windows[id].current)>.00001);
 const loop=renderLoop((now,dt)=>{
  if(stopped)return false;const cpu=performance.now();const wasMoving=moving();
  if(panes.size===4&&(wasMoving||store.playing))store.tick(dt);
  for(const [id,p]of panes){const open=store.windows[id].current;const highlight=store.selected===id||Math.abs(store.windows[id].target-open)>.0001;
   if(open!==p.open){const pose=sampleTrack(motionConfig[id].keyframes,open);q.setFromAxisAngle(axis,T.MathUtils.degToRad(pose.rotationX));p.mesh.quaternion.copy(q).multiply(p.rotation);p.mesh.position.copy(p.initial).sub(p.pivot).applyQuaternion(q).add(p.pivot).add(offset.fromArray(pose.offset));p.open=open;}
   if(highlight!==p.highlight){p.outline.visible=highlight;p.highlight=highlight;}
  }
  if(debugPane){const source=panes.get('FL')!.mesh;debugPane.position.copy(source.position);debugPane.quaternion.copy(source.quaternion);}
  const damping=controls.update();renderer.render(debug&&debugScene?debugScene:scene,camera);const keepAlive=moving()||store.playing||damping;probe.frame(now,cpu,wasMoving,keepAlive,damping);
  return keepAlive;
 },continuous);
 const invalidate=()=>loop.invalidate();controls.addEventListener('change',invalidate);controls.addEventListener('start',invalidate);controls.addEventListener('end',invalidate);
 // Watch only visual state; history/transcript changes do not wake the renderer.
 const stopVisual=watch(()=>[store.selected,store.playing,...windowIds.flatMap(id=>[store.windows[id].target,store.windows[id].current])],invalidate,{flush:'sync'});
 const stopExpiry=watchDialogueExpiry(store);
 const visibility=()=>{store.expireDialogue();loop.visibility(document.hidden);};document.addEventListener('visibilitychange',visibility);loop.visibility(document.hidden);
 const resize=()=>{const {width,height}=host.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio,cap));renderer.setSize(width,height);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();invalidate();};const observer=new ResizeObserver(resize);observer.observe(host);window.addEventListener('resize',resize);resize();
 const pointerDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};let down=[0,0];
 const pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0]!,e.clientY-down[1]!)>5)return;const r=renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.layers.set(1);ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(hits,false)[0];if(hit)store.selectWindow(hit.object.userData.windowId);};renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
 const abort=new AbortController();
 async function bytes(url:string){const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw new Error(`模型请求失败 ${response.status}`);return response.arrayBuffer();}
 async function load(){
  try{
   let object:T.Group;status('正在加载车模…');
   if(import.meta.env.MODE!=='pages'&&__V8_MODEL_SOURCES__&&useFBX){const [{FBXLoader},{default:url},{applyCavity},{applyModelMaterials}]=await Promise.all([import('three/addons/loaders/FBXLoader.js'),import('virtual:v8-source-fbx'),import('./apply-cavity'),import('./model-materials.mjs')]);probe.mark('loaderReady');const buffer=await bytes(url);probe.mark('downloaded');object=new FBXLoader().parse(buffer,'');applyModelMaterials(object);probe.mark('parsed');if(!baseline)await applyCavity(object);else motionConfig=(await import('../../model-review/v8-working/original-motion')).windowConfig;probe.mark('cavityReady');
   }else{probe.mark('loaderReady');const buffer=await bytes(assetUrl('models/v8-working.glb'));probe.mark('downloaded');object=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'')).scene;probe.mark('parsed');}
   if(stopped){disposeObject(object);return;}car=object;car.scale.setScalar(.01);scene.add(car);car.updateMatrixWorld(true);
   for(const name of [...windowIds.map(id=>windowConfig[id].node),...fixedQuarterNodes])if(!car.getObjectByName(name))throw new Error('模型节点缺失：'+name);
   car.traverse(o=>{if(o instanceof T.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.transparent)material.depthWrite=false;});
   for(const id of windowIds){const mesh=car.getObjectByName(windowConfig[id].node) as T.Mesh;mesh.geometry.computeBoundingBox();const pivot=mesh.geometry.boundingBox!.getCenter(new T.Vector3()).applyMatrix4(mesh.matrix);const outline=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,30),new T.LineBasicMaterial({color:0x00a38d}));outline.visible=false;mesh.add(outline);panes.set(id,{mesh,pivot,initial:mesh.position.clone(),rotation:mesh.quaternion.clone(),outline,open:NaN,highlight:false});
    const hit=new T.Mesh(mesh.geometry,new T.MeshBasicMaterial({side:T.DoubleSide,colorWrite:false,depthWrite:false}));hit.position.copy(mesh.position);hit.quaternion.copy(mesh.quaternion);hit.scale.copy(mesh.scale);hit.userData.windowId=id;hit.layers.set(1);car.add(hit);hits.push(hit);
   }
   probe.loaded();status('车模已就绪',true);if(debug)void ensureDebug();invalidate();
  }catch(error){if(!stopped)status('模型初始化失败：'+String(error));}
 }
 void load();
 async function ensureDebug(){if(debugScene||!car)return;debugScene=new T.Scene();debugScene.background=new T.Color(0xe9eeed);debugScene.add(new T.HemisphereLight(0xffffff,0x879b94,3));const dg=new T.Group();dg.scale.setScalar(.01);const card=car.getObjectByName('Door_FL__V8_DoorCard_DoorFrontL') as T.Mesh;const dc=card.clone();dc.material=new T.MeshBasicMaterial({color:0x657b73,wireframe:true});dg.add(dc);const source=panes.get('FL')!.mesh;debugPane=new T.Mesh(source.geometry,new T.MeshBasicMaterial({color:0x168d9a,side:T.DoubleSide}));debugPane.position.copy(source.position);debugPane.quaternion.copy(source.quaternion);dg.add(debugPane);debugScene.add(dg);
  if(baseline){const collisions=await import('../../model-review/v8-working/baseline-collisions.json');if(stopped)return;const points=collisions.default.FL['100'].find(r=>r.name.includes('DoorCard'))?.points??[];const geometry=new T.SphereGeometry(.006),material=new T.MeshBasicMaterial({color:0xe33365,depthTest:false});for(const point of points.filter((_,i)=>i%4===0)){const dot=new T.Mesh(geometry,material);dot.position.fromArray(point).multiplyScalar(.01);dot.renderOrder=10;debugScene.add(dot);}}
  invalidate();
 }
 function view(which:string){viewName=which;probe.markView(which);debug=which==='mesh-front';if(debug){void ensureDebug();controls.target.set(.22,.77,-.8);camera.position.set(.65,1.05,-2);}else if(which==='inside-front'||which==='inside-rear'){const x=which==='inside-front'?.25:-.72;controls.target.set(x,.88,-.8);camera.position.set(x-.3,1.25,.1);}else{controls.target.set(-.15,.9,0);const positions:Record<string,number[]>={perspective:[6,3.2,-6],left:[0,1.65,-7],right:[0,1.65,7],rear:[-6,2.5,-4],top:[0,7,.01]};camera.position.fromArray(positions[which]??positions.perspective!);}controls.update();invalidate();}
 function disposeObject(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 return {view,invalidate,dispose(){stopped=true;abort.abort();loop.dispose();probe.dispose();stopVisual();stopExpiry();observer.disconnect();window.removeEventListener('resize',resize);controls.removeEventListener('change',invalidate);controls.removeEventListener('start',invalidate);controls.removeEventListener('end',invalidate);controls.dispose();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);disposeObject(scene);if(debugScene)disposeObject(debugScene);renderer.dispose();renderer.domElement.remove();}};
}
