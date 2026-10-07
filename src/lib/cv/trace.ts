// Compact binary storage for pose traces so sessions can be re-analysed (e.g. after the user
// corrects a stroke type) and replayed with a skeleton overlay without re-running the model.
//
// Layout (Float32): [version, landmarkCount, frameCount, then per frame: t, people,
//   per stored landmark: ix, iy, iv, wx, wy, wz]. Frames without world landmarks store NaN.

import { LANDMARK_COUNT, TRACE_LANDMARKS, type Point2, type Point3, type PoseFrame } from "./landmarks";

const VERSION = 1;
const PER_LM = 6;

export function encodeTrace(frames: PoseFrame[], maxFrames = 12_000): ArrayBuffer {
  // Downsample evenly if the session is very long.
  const step = frames.length > maxFrames ? frames.length / maxFrames : 1;
  const picked: PoseFrame[] = [];
  for (let i = 0; i < frames.length; i += step) picked.push(frames[Math.floor(i)]);
  const L = TRACE_LANDMARKS.length;
  const perFrame = 2 + L * PER_LM;
  const out = new Float32Array(3 + picked.length * perFrame);
  out[0] = VERSION;
  out[1] = L;
  out[2] = picked.length;
  let o = 3;
  for (const f of picked) {
    out[o++] = f.t;
    out[o++] = f.people;
    for (const idx of TRACE_LANDMARKS) {
      const p = f.image[idx];
      const w = f.world?.[idx];
      out[o++] = p?.x ?? NaN;
      out[o++] = p?.y ?? NaN;
      out[o++] = p?.v ?? 0;
      out[o++] = w?.x ?? NaN;
      out[o++] = w?.y ?? NaN;
      out[o++] = w?.z ?? NaN;
    }
  }
  return out.buffer;
}

export function decodeTrace(buf: ArrayBuffer): PoseFrame[] {
  const a = new Float32Array(buf);
  if (a.length < 3 || a[0] !== VERSION) throw new Error("Unsupported pose trace format");
  const L = a[1];
  const n = a[2];
  if (L !== TRACE_LANDMARKS.length) throw new Error("Pose trace landmark set mismatch");
  const frames: PoseFrame[] = [];
  let o = 3;
  for (let k = 0; k < n; k++) {
    const t = a[o++];
    const people = a[o++];
    const image: Point2[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, v: 0 }));
    const world: Point3[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
    let hasWorld = false;
    for (const idx of TRACE_LANDMARKS) {
      const ix = a[o++], iy = a[o++], iv = a[o++], wx = a[o++], wy = a[o++], wz = a[o++];
      image[idx] = { x: ix, y: iy, v: iv };
      if (Number.isFinite(wx)) {
        hasWorld = true;
        world[idx] = { x: wx, y: wy, z: wz, v: iv };
      }
    }
    frames.push({ t, people, image, world: hasWorld ? world : null });
  }
  return frames;
}

/** Nearest frame at or before time t (binary search). */
export function frameAt(frames: PoseFrame[], t: number): PoseFrame | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (t <= frames[0].t) return frames[0];
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (frames[m].t <= t) lo = m;
    else hi = m - 1;
  }
  return frames[lo];
}
