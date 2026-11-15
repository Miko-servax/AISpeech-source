export type VoiceEvent = {type:string; session?:string; index?:number; text?:string; message?:string; startTimeMs?:number|null;level?:number;sentBytes?:number};
export function createMicrophone(onEvent:(event:VoiceEvent)=>void,options:{healthUrl?:string;asrUrl?:string;workletUrl?:string;startupTimeoutMs?:number}={}) {
  let socket:WebSocket|undefined,context:AudioContext|undefined,stream:MediaStream|undefined,node:AudioWorkletNode|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  let disposed=false,stopping=false,recording=false,run=0,sentBytes=0;
  let healthAbort:AbortController|undefined;
  function release(){recording=false;stream?.getTracks().forEach(t=>t.stop());stream=undefined;node?.disconnect();node=undefined;void context?.close();context=undefined;}
  function cancel(){run++;clearTimeout(timer);healthAbort?.abort();healthAbort=undefined;release();const old=socket;socket=undefined;old?.close();}
  function error(message:string){if(disposed)return;cancel();onEvent({type:'error',message});}
  async function start(){
    cancel();const generation=run;stopping=false;sentBytes=0;
    try{
      onEvent({type:'connecting'});
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前环境无法录音，请使用 localhost 或可信 HTTPS。');
      // Resume during the click gesture, before network/permission awaits lose user activation.
      const audio=new AudioContext();context=audio;const resumed=audio.resume();void resumed.catch(()=>{});
      timer=setTimeout(()=>error('录音启动超时，请检查麦克风权限、输入设备和语音后端后重试。'),options.startupTimeoutMs??15000);
      healthAbort=new AbortController();
      onEvent({type:'progress',message:(options.startupTimeoutMs??15000)>15000?'正在连接语音服务，免费服务首次唤醒可能需要约1分钟…':'正在检查语音服务…'});
      let state:{asrConfigured:boolean}|undefined;
      while(!state){
        try{const health=await fetch(options.healthUrl??'/api/health',{signal:healthAbort.signal});if([401,403,429].includes(health.status))throw new Error('语音服务拒绝连接或请求过于频繁，请稍后重试。');if(!health.ok)throw new TypeError('服务尚未就绪');const data=await health.json();if(!data||typeof data.asrConfigured!=='boolean')throw new TypeError('服务尚未就绪');state=data;}
        catch(e){if(disposed||generation!==run)return;if(!(options.startupTimeoutMs&&options.startupTimeoutMs>15000)||e instanceof Error&&!(e instanceof TypeError||e instanceof SyntaxError))throw new Error(e instanceof Error?e.message:'无法连接语音后端，请重试。');
          await new Promise<void>(resolve=>{const signal=healthAbort!.signal;const done=()=>{clearTimeout(retry);signal.removeEventListener('abort',done);resolve();};const retry=setTimeout(done,2000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
        }
        if(disposed||generation!==run)return;
      }
      if(!state.asrConfigured)throw new Error('语音服务尚未配置，请联系演示维护者。');
      if(disposed||generation!==run)return;
      onEvent({type:'progress',message:'正在请求麦克风权限，请留意浏览器的授权提示…'});
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(disposed||generation!==run){media.getTracks().forEach(t=>t.stop());return;}stream=media;
      stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(generation===run&&!stopping)error('麦克风已断开，请检查输入设备后重新录音。');};});
      onEvent({type:'progress',message:'正在启动音频采集…'});
      await resumed;if(disposed||generation!==run)return;
      await audio.audioWorklet.addModule(options.workletUrl??'/pcm-worklet.js');if(disposed||generation!==run)return;
      node=new AudioWorkletNode(audio,'pcm-recorder');node.onprocessorerror=()=>{if(generation===run)error('音频采集处理失败，请刷新页面后重试。');};
      const source=audio.createMediaStreamSource(stream);const mute=audio.createGain();mute.gain.value=0;source.connect(node).connect(mute).connect(audio.destination);
      const ws=new WebSocket(options.asrUrl??`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/asr`);socket=ws;
      onEvent({type:'progress',message:'正在连接语音识别…'});
      node.port.onmessage=e=>{if(generation!==run)return;if(e.data.type==='level')onEvent({type:'level',level:e.data.level,sentBytes});if(e.data.type==='pcm'&&recording&&ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>128000)return error('网络拥堵，已停止录音，请重试。');ws.send(e.data.data);sentBytes+=e.data.data.byteLength;}if(e.data.type==='stopped'){recording=false;release();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'end'}));}};
      ws.onmessage=e=>{if(disposed||generation!==run)return;let msg:VoiceEvent;try{msg=JSON.parse(e.data);}catch{return error('无效识别结果。');}
        if(msg.type==='ready'){clearTimeout(timer);recording=true;timer=setTimeout(stop,60000);}
        if(msg.type==='error'){error(msg.message||'语音识别失败。');return;}
        if(msg.type==='done'){clearTimeout(timer);release();}
        onEvent(msg);
      };
      ws.onerror=()=>{if(generation===run)error('语音后端连接失败，请检查服务是否运行。');};
      ws.onclose=()=>{if(generation===run&&!disposed){clearTimeout(timer);release();onEvent({type:'closed'});}};
    }catch(e){if(generation===run)error(e instanceof DOMException && e.name==='NotAllowedError' ? '麦克风权限未开启，请允许此页面使用麦克风后重试。' : e instanceof Error?e.message:'麦克风启动失败。');}
  }
  function stop(){if(stopping)return;stopping=true;clearTimeout(timer);if(!recording){cancel();onEvent({type:'closed'});return;}onEvent({type:'finishing'});node?.port.postMessage('stop');timer=setTimeout(()=>error('等待最终识别结果超时，请重试。'),10000);}
  return {start,stop,dispose(){disposed=true;cancel();}};
}
