import * as T from 'three';
// Shared by offline exporter and the FBX comparison path.
export function applyModelMaterials(car){
  const cache=new Map();const oldMaterials=new Set();
  car.traverse(o=>{if(!o.isMesh)return;
    const mats=(Array.isArray(o.material)?o.material:[o.material]).map(source=>{
      oldMaterials.add(source);const glass=/glass|lens|cover/i.test(source.name);
      const color=glass?new T.Color(0x477477):/Paint_silver/i.test(source.name)?new T.Color(0xa5afac):source.color??new T.Color(0xaaaaaa);
      const options={name:source.name,color,metalness:/chrome|aluminum/i.test(source.name)?.65:/silver/i.test(source.name)?.3:.12,roughness:glass?.15:/chrome/i.test(source.name)?.25:.48,transparent:glass,opacity:glass?.48:1,depthWrite:!glass,side:glass?T.DoubleSide:T.FrontSide};
      const key=JSON.stringify({...options,color:color.toArray()});
      if(!cache.has(key))cache.set(key,new T.MeshStandardMaterial(options));return cache.get(key);
    });o.material=mats.length===1?mats[0]:mats;
  });oldMaterials.forEach(m=>m.dispose());
}
