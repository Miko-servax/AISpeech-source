import * as T from 'three';
import patchUrl from 'virtual:v8-cavity-patch';
type SavedGeometry = Parameters<T.BufferGeometryLoader['parse']>[0];
type CavityPatch = {patches:{node:string;geometry:SavedGeometry}[];additions:{node:string;geometry:SavedGeometry;color:number}[]};
/** Applies saved geometry only to the loaded working instance. Source FBX is untouched. */
export async function applyCavity(car: T.Group) {
  const response = await fetch(patchUrl);
  if (!response.ok) throw new Error('Cavity working copy failed to load');
  const patch: CavityPatch = await response.json();
  const loader = new T.BufferGeometryLoader();
  for (const item of patch.patches) {
    const mesh = car.getObjectByName(item.node) as T.Mesh;
    if (!mesh?.isMesh) throw new Error('门腔节点缺失：' + item.node);
    const previous=mesh.geometry;
    mesh.geometry = loader.parse(item.geometry as Parameters<typeof loader.parse>[0]);
    previous.dispose();
    mesh.position.set(0,0,0); mesh.quaternion.identity(); mesh.scale.set(1,1,1);
  }
  for (const item of patch.additions) {
    const mesh = new T.Mesh(loader.parse(item.geometry as Parameters<typeof loader.parse>[0]), new T.MeshStandardMaterial({color:item.color,roughness:0.7}));
    mesh.name = item.node; car.add(mesh);
  }
  car.updateMatrixWorld(true);
}
