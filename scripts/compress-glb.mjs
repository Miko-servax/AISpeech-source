import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
// Lossless EXT_meshopt_compression; no filters/quantization, index order retained.
export async function compressGLB(glb){
 await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
 const jsonLength=glb.readUInt32LE(12);const json=JSON.parse(glb.subarray(20,20+jsonLength).toString());const bin=glb.subarray(28+jsonLength);let offset=0;const chunks=[];
 for(let i=0;i<json.bufferViews.length;i++){
  const view=json.bufferViews[i];const accessor=json.accessors.find(a=>a.bufferView===i);if(!accessor)throw new Error('Unsupported non-accessor view');
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type];const componentBytes={5126:4,5125:4,5123:2}[accessor.componentType];const stride=view.byteStride??components*componentBytes;
  if(view.byteLength<accessor.count*stride||view.byteLength-accessor.count*stride>3)throw new Error('Unsupported accessor view');
  view.byteLength=accessor.count*stride;
  const mode=view.target===34963?'INDICES':'ATTRIBUTES';const original=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const encoded=MeshoptEncoder.encodeGltfBuffer(original,accessor.count,stride,mode);
  const decoded=new Uint8Array(original.length);MeshoptDecoder.decodeGltfBuffer(decoded,accessor.count,stride,encoded,mode);
  if(!Buffer.from(decoded).equals(original))throw new Error('Lossless roundtrip failed');
  view.buffer=1;view.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:encoded.length,byteStride:stride,count:accessor.count,mode}};
  const padded=Buffer.alloc((encoded.length+3)&~3);padded.set(encoded);chunks.push(padded);offset+=padded.length;
 }
 json.buffers=[{byteLength:offset},{byteLength:bin.length,extensions:{EXT_meshopt_compression:{fallback:true}}}];json.extensionsUsed=[...(json.extensionsUsed??[]),'EXT_meshopt_compression'];json.extensionsRequired=[...(json.extensionsRequired??[]),'EXT_meshopt_compression'];
 const text=Buffer.from(JSON.stringify(json));const jsonChunk=Buffer.alloc((text.length+3)&~3,32);jsonChunk.set(text);const data=Buffer.concat(chunks);const out=Buffer.alloc(28+jsonChunk.length+data.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonChunk.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(out,20);out.writeUInt32LE(data.length,20+jsonChunk.length);out.writeUInt32LE(0x004e4942,24+jsonChunk.length);data.copy(out,28+jsonChunk.length);return out;
}
