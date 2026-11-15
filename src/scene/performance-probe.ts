import type {WebGLRenderer} from 'three';
/** Opt-in local diagnostics. Reporting timer never wakes the WebGL render loop. */
export function performanceProbe(host:HTMLElement,renderer:WebGLRenderer,config:Record<string,string>={}){
 if(!new URLSearchParams(location.search).has('perf'))return {enabled:false,mark(_name:string){},markView(_view:string){},loaded(){},frame(_now:number,_cpu:number,_moving:boolean,_continuing?:boolean,_camera?:boolean){},dispose(){}};
 const started=performance.now(),timings:Record<string,number>={};let readyAt=0,last=0,continuing=false,renderedFrames=0,lastFrameAt=0,view='perspective';
 const samples:{gap:number;cpu:number;moving:boolean;camera:boolean}[]=[];
 const resetClock=()=>{last=0;continuing=false;};document.addEventListener('visibilitychange',resetClock);
 const panel=document.createElement('details');panel.id='v8-performance-panel';panel.style.cssText='position:absolute;right:8px;top:8px;width:min(320px,95%);max-height:45%;overflow:auto;overscroll-behavior:contain;background:#ffffffed;font:11px sans-serif;padding:8px;z-index:5;pointer-events:auto';
 const summary=document.createElement('summary');summary.textContent='性能记录 · 点击展开';panel.appendChild(summary);
 const label=document.createElement('label');label.textContent='设备型号 ';const device=document.createElement('input');device.placeholder='例如 iPhone 15 / Android机型';device.style.cssText='width:100%;font-size:16px';label.appendChild(device);panel.appendChild(label);
 const reset=document.createElement('button');reset.textContent='重置采样';reset.onclick=()=>{samples.length=0;last=0;continuing=false;renderedFrames=0;lastFrameAt=0;};panel.appendChild(reset);
 const save=document.createElement('button');save.textContent='导出测量JSON';save.style.cssText='margin:6px 0';panel.appendChild(save);
 const pre=document.createElement('pre');pre.id='v8-performance';pre.setAttribute('aria-label','性能测量数据');pre.style.cssText='white-space:pre-wrap;font:10px monospace;margin:0';panel.appendChild(pre);host.appendChild(panel);
 save.onclick=()=>{const value=JSON.parse(pre.textContent||'{}');value.deviceLabel=device.value;value.exportedAt=new Date().toISOString();const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='v8-phone-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

 const percentile=(a:number[],p:number)=>{const sorted=[...a].sort((a,b)=>a-b);return sorted.length?Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]! *100)/100:null;};
 const mark=(name:string)=>{timings[name]=Math.round((performance.now()-started)*100)/100;};
 function report(){
  const summarize=(rows:typeof samples)=>({averageActiveFPS:rows.some(s=>s.gap>0)?Math.round(rows.filter(s=>s.gap>0).length*10000/rows.reduce((sum,s)=>sum+s.gap,0))/10:null,frames:rows.length,rafGapP50Ms:percentile(rows.filter(s=>s.gap>0).map(s=>s.gap),.5),rafGapP95Ms:percentile(rows.filter(s=>s.gap>0).map(s=>s.gap),.95),cpuP95Ms:percentile(rows.map(s=>s.cpu),.95),over33ms:rows.filter(s=>s.gap>33.34).length,over50ms:rows.filter(s=>s.gap>50).length});
  const resources=performance.getEntriesByType('resource').filter((r:PerformanceEntry)=>/\.glb|fbx|door-cavity/.test(r.name)&&['fetch','xmlhttprequest'].includes((r as PerformanceResourceTiming).initiatorType)).map(r=>{const t=r as PerformanceResourceTiming;return {url:new URL(t.name).pathname,durationMs:Math.round(t.duration),transferSize:t.transferSize,encodedBodySize:t.encodedBodySize,decodedBodySize:t.decodedBodySize};});
  pre.textContent=JSON.stringify({kind:'browser-render-profile',config,view,device:{userAgent:navigator.userAgent,platform:navigator.platform,touchPoints:navigator.maxTouchPoints,secureContext:window.isSecureContext,microphoneAvailable:!!navigator.mediaDevices?.getUserMedia},readyMs:timings.ready??null,timings,elapsedMs:Math.round(performance.now()-started),renderedFrames,lastFrameAgeMs:lastFrameAt?Math.round(performance.now()-lastFrameAt):null,viewport:{width:host.clientWidth,height:host.clientHeight,dpr:devicePixelRatio,renderPixelRatio:renderer.getPixelRatio(),bufferWidth:renderer.domElement.width,bufferHeight:renderer.domElement.height},drawCalls:renderer.info.render.calls,submittedTriangles:renderer.info.render.triangles,geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,programCount:renderer.info.programs?.length,idle:summarize(samples.filter(s=>!s.moving&&!s.camera)),camera:summarize(samples.filter(s=>s.camera&&!s.moving)),moving:summarize(samples.filter(s=>s.moving)),resources,note:'Device browser measurement; CPU duration is not GPU time. Static scenes pause drawing. Measure averageActiveFPS while rotating or animating; export the JSON after each scenario.'},null,2);
 }
 const timer=setInterval(report,1000);
 return {enabled:true,mark,markView(next:string){view=next;samples.length=0;last=0;},loaded(){readyAt=performance.now();mark('ready');samples.length=0;last=0;report();},frame(now:number,cpu:number,moving:boolean,keepAlive=false,camera=false){
  if(!readyAt)return;if(!('firstFrame' in timings))mark('firstFrame');
  const gap=last&&continuing?now-last:0;continuing=keepAlive;if(document.visibilityState==='visible')samples.push({gap,cpu:performance.now()-cpu,moving,camera});last=now;lastFrameAt=performance.now();renderedFrames++;if(samples.length>1800)samples.shift();
 },dispose(){clearInterval(timer);document.removeEventListener('visibilitychange',resetClock);panel.remove();}};
}
