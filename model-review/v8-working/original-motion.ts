/** Original combined FBX coordinates: centimetres, +X front, +Y up, -Z left.
 * Rotation is around the closed pane's world bounding-box centre, in degrees.
 * Candidate rigid paths for visual inspection; no engineering rail is supplied.
 */
export type WindowId = 'FL' | 'FR' | 'RL' | 'RR';
export type Keyframe = { open: number; offset: [number, number, number]; rotationX: number };
export const windowIds: WindowId[] = ['FL', 'FR', 'RL', 'RR'];
const track = (side: number): Keyframe[] => [
  { open: 0, offset: [0, 0, 0], rotationX: 0 },
  { open: 0.25, offset: [0, -11.5, 0], rotationX: side * 4 },
  { open: 0.5, offset: [0, -23, 0], rotationX: side * 8 },
  { open: 0.75, offset: [0, -34.5, 0], rotationX: side * 13 },
  { open: 1, offset: [0, -46, 0], rotationX: side * 17 },
];
export const windowConfig = {
  FL: { label: '左前 · 主驾', node: 'DoorGlass_FL__Front_door_glass', keyframes: track(-1) },
  FR: { label: '右前 · 副驾', node: 'DoorGlass_FR__Front_door_glass001', keyframes: track(1) },
  RL: { label: '左后', node: 'DoorGlass_RL__Rear_door_glass', keyframes: track(-1) },
  RR: { label: '右后', node: 'DoorGlass_RR__Rear_door_glass001', keyframes: track(1) },
} satisfies Record<WindowId, { label: string; node: string; keyframes: Keyframe[] }>;
export const fixedQuarterNodes = ['DoorGlass_RL__Quarter_glass', 'DoorGlass_RR__Quarter_glass001'];
export function sampleTrack(keys: Keyframe[], open: number) {
  const p = Math.max(0, Math.min(1, open));
  const b = keys.findIndex(k => k.open >= p);
  if (b <= 0) return keys[0]!;
  const a = keys[b - 1]!, z = keys[b]!, t = (p - a.open) / (z.open - a.open);
  return { open: p, offset: a.offset.map((v, i) => v + (z.offset[i]! - v) * t) as Keyframe['offset'], rotationX: a.rotationX + (z.rotationX - a.rotationX) * t };
}
