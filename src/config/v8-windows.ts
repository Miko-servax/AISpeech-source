/** Original combined FBX coordinates: centimetres, +X front, +Y up, -Z left.
 * Rotation is around the closed pane's world bounding-box centre, in degrees.
 * Candidate rigid paths for visual inspection; no engineering rail is supplied.
 */
export type WindowId = 'FL' | 'FR' | 'RL' | 'RR';
export type Keyframe = { open: number; offset: [number, number, number]; rotationX: number };
export const windowIds: WindowId[] = ['FL', 'FR', 'RL', 'RR'];
const frontTrack: Keyframe[] = [
  { open: 0, offset: [0, 0, 0], rotationX: 0 },
  { open: 0.1, offset: [0.6, -5.7, 0], rotationX: -1.5 },
  { open: 0.2, offset: [0.6, -11.4, 0], rotationX: -2.5 },
  { open: 0.3, offset: [0.6, -17.1, 0], rotationX: -3.5 },
  { open: 0.4, offset: [0.6, -22.8, 0], rotationX: -5 },
  { open: 0.5, offset: [0.6, -28.5, 0], rotationX: -6 },
  { open: 0.6, offset: [0.6, -34.2, -2.25], rotationX: -7.2 },
  { open: 0.7, offset: [0.6, -39.9, -2.75], rotationX: -8.9 },
  { open: 0.8, offset: [0.6, -45.6, -2.75], rotationX: -10.1 },
  { open: 0.9, offset: [0.6, -51.3, -2.5], rotationX: -11.8 },
  { open: 1, offset: [0.6, -57.0, -2.5], rotationX: -12.0 },
];
const rearTrack: Keyframe[] = [
  { open: 0, offset: [0, 0, 0], rotationX: 0 },
  { open: 0.1, offset: [0, -5.5, 0], rotationX: -2 },
  { open: 0.2, offset: [0, -11, 0], rotationX: -3.5 },
  { open: 0.3, offset: [0, -16.5, 0], rotationX: -5.5 },
  { open: 0.4, offset: [0, -22, 0], rotationX: -7 },
  { open: 0.5, offset: [0, -27.5, 0], rotationX: -9 },
  { open: 0.6, offset: [0, -33, 0], rotationX: -10.7 },
  { open: 0.7, offset: [0, -38.5, 0], rotationX: -12.4 },
  { open: 0.8, offset: [0, -44.0, 0], rotationX: -14.6 },
  { open: 0.9, offset: [0, -49.5, 0], rotationX: -16.3 },
  { open: 1, offset: [0, -55.0, 0], rotationX: -18 },
];
const mirror = (keys: Keyframe[]): Keyframe[] => keys.map(k => ({ ...k, offset: [k.offset[0], k.offset[1], -k.offset[2]], rotationX: -k.rotationX }));
export const windowConfig = {
  FL: { label: '左前 · 主驾', node: 'DoorGlass_FL__Front_door_glass', keyframes: frontTrack },
  FR: { label: '右前 · 副驾', node: 'DoorGlass_FR__Front_door_glass001', keyframes: mirror(frontTrack) },
  RL: { label: '左后', node: 'DoorGlass_RL__Rear_door_glass', keyframes: rearTrack },
  RR: { label: '右后', node: 'DoorGlass_RR__Rear_door_glass001', keyframes: mirror(rearTrack) },
} satisfies Record<WindowId, { label: string; node: string; keyframes: Keyframe[] }>;
export const fixedQuarterNodes = ['DoorGlass_RL__Quarter_glass', 'DoorGlass_RR__Quarter_glass001'];
export function sampleTrack(keys: Keyframe[], open: number) {
  const p = Math.max(0, Math.min(1, open));
  const b = keys.findIndex(k => k.open >= p);
  if (b <= 0) return keys[0]!;
  const a = keys[b - 1]!, z = keys[b]!, t = (p - a.open) / (z.open - a.open);
  return { open: p, offset: a.offset.map((v, i) => v + (z.offset[i]! - v) * t) as Keyframe['offset'], rotationX: a.rotationX + (z.rotationX - a.rotationX) * t };
}
