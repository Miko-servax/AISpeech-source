/** Coalesces invalidations; the callback returns true while animation/damping remains active. */
export function renderLoop(draw:(now:number,dt:number)=>boolean,continuous=false,raf=requestAnimationFrame,cancel=cancelAnimationFrame){
 let frame=0,last:number|null=null,disposed=false,hidden=false;
 function request(){if(!disposed&&!hidden&&!frame)frame=raf(run);}
 function run(now:number){frame=0;if(disposed||hidden)return;const dt=last===null?0:Math.min(Math.max((now-last)/1000,0),.1);last=now;
  const active=draw(now,dt);if(active||continuous)request();else if(!frame)last=null;
 }
 return {invalidate:request,visibility(value:boolean){hidden=value;if(frame){cancel(frame);frame=0;}last=null;if(!hidden)request();},dispose(){disposed=true;if(frame)cancel(frame);frame=0;}};
}
