// Continuous low-pass FIR resampling from actual device rate to 16kHz mono PCM16.
class PCMProcessor extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.base=0;this.next=24;this.packet=[];this.running=true;this.port.onmessage=e=>{if(e.data==='stop'){this.running=false;this.flush();this.port.postMessage({type:'stopped'});}};}
  flush(){if(this.packet.length){const level=Math.sqrt(this.packet.reduce((sum,value)=>sum+(value/32768)**2,0)/this.packet.length);this.port.postMessage({type:'level',level});const data=new ArrayBuffer(this.packet.length*2),view=new DataView(data);this.packet.forEach((v,i)=>view.setInt16(i*2,v,true));this.port.postMessage({type:'pcm',data},[data]);this.packet=[];}}
  process(inputs){if(!this.running)return true;const channels=inputs[0];if(!channels?.length)return true;const length=channels[0].length;for(let i=0;i<length;i++){let v=0;for(const c of channels)v+=c[i]||0;this.samples.push(v/channels.length);}const ratio=sampleRate/16000,cutoff=Math.min(.48,7600/sampleRate),radius=24;
    while(this.next+radius<this.base+this.samples.length){let value=0,weight=0;for(let k=Math.ceil(this.next-radius);k<=Math.floor(this.next+radius);k++){const d=k-this.next,x=2*cutoff*d,w=(Math.abs(x)<1e-8?1:Math.sin(Math.PI*x)/(Math.PI*x))*2*cutoff*(.5+.5*Math.cos(Math.PI*d/radius));value+=(this.samples[k-this.base]||0)*w;weight+=w;}value=Math.max(-1,Math.min(1,value/weight));this.packet.push(Math.round(value*(value<0?32768:32767)));this.next+=ratio;if(this.packet.length===3200)this.flush();}
    const discard=Math.max(0,Math.floor(this.next-radius)-this.base);if(discard){this.samples.splice(0,discard);this.base+=discard;}return true;
  }
}
registerProcessor('pcm-recorder',PCMProcessor);
