// Small, dependency-free vector helpers. All angles are in degrees.

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 extends Vec2 {
  z: number;
}

export const RAD = 180 / Math.PI;

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function mid<T extends Vec2>(a: T, b: T): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function mid3(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Interior angle at `b` formed by a-b-c, in [0, 180]. 180 = straight limb.
 * Works for 2D points (z ignored) or 3D points when all three have z.
 */
export function jointAngle(a: Vec2 | Vec3, b: Vec2 | Vec3, c: Vec2 | Vec3): number {
  const az = "z" in a ? a.z : 0;
  const bz = "z" in b ? b.z : 0;
  const cz = "z" in c ? c.z : 0;
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: az - bz };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: cz - bz };
  const n1 = Math.hypot(v1.x, v1.y, v1.z);
  const n2 = Math.hypot(v2.x, v2.y, v2.z);
  if (n1 < 1e-9 || n2 < 1e-9) return NaN;
  const cos = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (n1 * n2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * RAD;
}

/**
 * Tilt of the segment a→b from horizontal in image space, in (-90, 90].
 * Positive when b is higher in the image than a (image y grows downwards).
 */
export function lineTilt(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = a.y - b.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  let deg = Math.atan2(dy, dx) * RAD;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg;
}

/** Angle of the segment from `bottom` to `top` away from vertical, in [0, 180]. 0 = upright. */
export function leanFromVertical(bottom: Vec2, top: Vec2): number {
  const dx = top.x - bottom.x;
  const dy = bottom.y - top.y; // up is positive
  return Math.abs(Math.atan2(dx, dy) * RAD);
}

/**
 * Yaw of a left→right segment around the vertical axis from model 3D coordinates, in (-180, 180].
 * 0 = segment parallel to the image plane. Used as a *rotation estimate*, never a measurement.
 */
export function yaw3(left: Vec3, right: Vec3): number {
  return Math.atan2(right.z - left.z, right.x - left.x) * RAD;
}

/** Smallest signed difference between two angles in degrees, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function mean(xs: number[]): number {
  const f = xs.filter(Number.isFinite);
  return f.length ? f.reduce((s, x) => s + x, 0) / f.length : NaN;
}

export function median(xs: number[]): number {
  const f = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!f.length) return NaN;
  const m = Math.floor(f.length / 2);
  return f.length % 2 ? f[m] : (f[m - 1] + f[m]) / 2;
}

export function stdev(xs: number[]): number {
  const f = xs.filter(Number.isFinite);
  if (f.length < 2) return NaN;
  const m = mean(f);
  return Math.sqrt(f.reduce((s, x) => s + (x - m) ** 2, 0) / (f.length - 1));
}

/** Coefficient of variation (stdev / |mean|). NaN when undefined. */
export function cv(xs: number[]): number {
  const m = mean(xs);
  const s = stdev(xs);
  return Number.isFinite(m) && Number.isFinite(s) && Math.abs(m) > 1e-9 ? s / Math.abs(m) : NaN;
}

export function round(v: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
