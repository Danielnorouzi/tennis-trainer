// Per-frame movement features computed from (smoothed) pose landmarks.
//
// Units: image coordinates are aspect-corrected (x multiplied by width/height) so angles are not
// distorted by non-square frames. Lengths are expressed in *torso lengths* (mid-shoulder to
// mid-hip) so numbers are comparable between players and camera distances.
//
// Every value here is either a 2D measurement in the image plane (perspective applies!) or an
// estimate from MediaPipe's monocular 3D "world" landmarks. Callers must label them accordingly.

import { LM, type Point2, type Point3, type PoseFrame } from "./landmarks";
import {
  angleDiff, dist2, dist3, jointAngle, leanFromVertical, lineTilt, median, mid, mid3, yaw3, type Vec2,
} from "./geometry";
import type { Handedness } from "../tennis/types";

export const VIS_THRESHOLD = 0.5;

export interface Visibility {
  /** mean visibility of shoulders, hips */
  core: number;
  arms: number;
  legs: number;
  feet: number;
  overall: number;
  /** fraction of the key landmarks that are inside the frame with good visibility */
  inFrame: number;
}

export interface FeatureFrame {
  t: number;
  valid: boolean;
  vis: Visibility;
  people: number;
  /** torso length in aspect-corrected image units (median-stabilised) */
  torso: number;
  /** body height as a fraction of frame height (nose to lowest foot point) */
  bodyHeightFrac: number;
  /** bounding box of the body in normalised image coords */
  bbox: { x0: number; y0: number; x1: number; y1: number };

  domElbow: number;
  nonDomElbow: number;
  leftKnee: number;
  rightKnee: number;
  /** most flexed knee (smallest interior angle) */
  minKnee: number;
  trunkLean: number;
  shoulderTilt: number;
  hipTilt: number;
  /** projected shoulder width / torso length (2D). Shrinks when the player turns side-on to a front/rear camera. */
  shoulderWidthRatio: number;

  /** model-estimated yaw of the shoulder line (deg), NaN without world landmarks */
  shoulderYaw: number;
  hipYaw: number;
  /** shoulder yaw minus hip yaw (deg) — a rough "separation" estimate */
  separation: number;

  /** dominant wrist relative to hip centre, in torso lengths (x right, y up, image plane) */
  domWrist: Vec2;
  nonDomWrist: Vec2;
  /** (shoulder y - wrist y) / torso: >0 means the wrist is above the dominant shoulder */
  domWristHeight: number;
  nonDomWristHeight: number;
  domWristAboveHead: boolean;
  nonDomWristAboveHead: boolean;
  domElbowHeight: number;
  /**
   * Model-estimated offset of the dominant wrist along the player's own left↔right axis, in
   * shoulder widths. >0 = on the dominant ("forehand") side, <0 = across the body.
   */
  sideProj: number;

  /** ankle distance / shoulder distance (world estimate when available, 2D otherwise) */
  stanceWidth: number;
  stanceMethod: "estimated_3d" | "measured_2d";
  /** hip centre in normalised image coords */
  com: Vec2;
  /** horizontal offset of the head from the centre of the feet, in torso lengths */
  headOverBase: number;

  /** filled by FeatureTracker: dominant wrist speed in torso lengths / second */
  wristSpeed: number;
  /** filled by FeatureTracker: hip-centre horizontal speed in torso lengths / second */
  comSpeedX: number;
  /** filled by FeatureTracker: hip-centre vertical position relative to its rolling median (torso, up +) */
  comLift: number;
}

const avgVis = (pts: Point2[], idx: number[]) => idx.reduce((s, i) => s + (pts[i]?.v ?? 0), 0) / idx.length;

function inFrameFraction(pts: Point2[], idx: number[]): number {
  let ok = 0;
  for (const i of idx) {
    const p = pts[i];
    if (p && p.v >= VIS_THRESHOLD && p.x >= 0.01 && p.x <= 0.99 && p.y >= 0.01 && p.y <= 0.99) ok += 1;
  }
  return ok / idx.length;
}

const KEY = [
  LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist,
  LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
];

export function visibility(pts: Point2[]): Visibility {
  const core = avgVis(pts, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]);
  const arms = avgVis(pts, [LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist]);
  const legs = avgVis(pts, [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle]);
  const feet = avgVis(pts, [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot]);
  return { core, arms, legs, feet, overall: avgVis(pts, KEY), inFrame: inFrameFraction(pts, KEY) };
}

export interface FeatureContext {
  handedness: Handedness;
  /** frame width / height */
  aspect: number;
}

function sidesFor(h: Handedness) {
  return h === "right"
    ? { sh: LM.rightShoulder, el: LM.rightElbow, wr: LM.rightWrist, oSh: LM.leftShoulder, oEl: LM.leftElbow, oWr: LM.leftWrist }
    : { sh: LM.leftShoulder, el: LM.leftElbow, wr: LM.leftWrist, oSh: LM.rightShoulder, oEl: LM.rightElbow, oWr: LM.rightWrist };
}

/** Compute the per-frame features (without the velocity fields, which need history). */
export function computeFrameFeatures(frame: PoseFrame, ctx: FeatureContext, torsoHint?: number): FeatureFrame {
  const a = ctx.aspect;
  const P = frame.image.map((p) => ({ x: p.x * a, y: p.y, v: p.v }));
  const W = frame.world;
  const s = sidesFor(ctx.handedness);
  const vis = visibility(frame.image);

  const shMid = mid(P[LM.leftShoulder], P[LM.rightShoulder]);
  const hipMid = mid(P[LM.leftHip], P[LM.rightHip]);
  const torsoRaw = dist2(shMid, hipMid);
  const torso = torsoHint && Number.isFinite(torsoHint) ? torsoHint : torsoRaw;
  const valid = vis.core >= VIS_THRESHOLD && torso > 0.02;

  const ys = [LM.nose, LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot, LM.leftWrist, LM.rightWrist]
    .map((i) => frame.image[i]);
  const xsAll = KEY.map((i) => frame.image[i]).filter((p) => p.v > 0.3);
  const yTop = Math.min(...ys.filter((p) => p.v > 0.3).map((p) => p.y), frame.image[LM.nose].y);
  const yFeet = Math.max(...[LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot].map((i) => frame.image[i].y));
  const bbox = {
    x0: Math.min(...xsAll.map((p) => p.x), 1),
    x1: Math.max(...xsAll.map((p) => p.x), 0),
    y0: yTop,
    y1: yFeet,
  };

  const knee = (hip: number, k: number, ank: number) => jointAngle(P[hip], P[k], P[ank]);
  const leftKnee = knee(LM.leftHip, LM.leftKnee, LM.leftAnkle);
  const rightKnee = knee(LM.rightHip, LM.rightKnee, LM.rightAnkle);

  const rel = (p: Point2): Vec2 => ({ x: (p.x - hipMid.x) / torso, y: (hipMid.y - p.y) / torso });
  const domSh = P[s.sh];
  const height = (wr: Point2, sh: Point2) => (sh.y - wr.y) / torso;

  let shoulderYaw = NaN;
  let hipYaw = NaN;
  let sideProj = NaN;
  let stanceWidth = NaN;
  let stanceMethod: FeatureFrame["stanceMethod"] = "measured_2d";
  if (W) {
    shoulderYaw = yaw3(W[LM.leftShoulder], W[LM.rightShoulder]);
    hipYaw = yaw3(W[LM.leftHip], W[LM.rightHip]);
    const shW = dist3(W[LM.leftShoulder], W[LM.rightShoulder]);
    if (shW > 0.05) {
      // axis pointing from the non-dominant shoulder to the dominant shoulder (player's own frame)
      const ax = { x: W[s.sh].x - W[s.oSh].x, y: 0, z: W[s.sh].z - W[s.oSh].z };
      const n = Math.hypot(ax.x, ax.z) || 1;
      const c = mid3(W[LM.leftShoulder], W[LM.rightShoulder]);
      const w: Point3 = W[s.wr];
      sideProj = ((w.x - c.x) * ax.x + (w.z - c.z) * ax.z) / n / shW;
      stanceWidth = dist3(W[LM.leftAnkle], W[LM.rightAnkle]) / shW;
      stanceMethod = "estimated_3d";
    }
  }
  if (!Number.isFinite(stanceWidth)) {
    const shW2 = dist2(P[LM.leftShoulder], P[LM.rightShoulder]);
    stanceWidth = shW2 > 1e-3 ? dist2(P[LM.leftAnkle], P[LM.rightAnkle]) / shW2 : NaN;
  }

  const feetMid = mid(P[LM.leftAnkle], P[LM.rightAnkle]);

  return {
    t: frame.t,
    valid,
    vis,
    people: frame.people,
    torso,
    bodyHeightFrac: Math.max(0, yFeet - yTop),
    bbox,
    domElbow: jointAngle(P[s.sh], P[s.el], P[s.wr]),
    nonDomElbow: jointAngle(P[s.oSh], P[s.oEl], P[s.oWr]),
    leftKnee,
    rightKnee,
    minKnee: Math.min(leftKnee, rightKnee),
    trunkLean: leanFromVertical(hipMid, shMid),
    shoulderTilt: lineTilt(P[LM.leftShoulder], P[LM.rightShoulder]),
    hipTilt: lineTilt(P[LM.leftHip], P[LM.rightHip]),
    shoulderWidthRatio: dist2(P[LM.leftShoulder], P[LM.rightShoulder]) / torso,
    shoulderYaw,
    hipYaw,
    separation: Number.isFinite(shoulderYaw) && Number.isFinite(hipYaw) ? angleDiff(shoulderYaw, hipYaw) : NaN,
    domWrist: rel(P[s.wr]),
    nonDomWrist: rel(P[s.oWr]),
    domWristHeight: height(P[s.wr], domSh),
    nonDomWristHeight: height(P[s.oWr], P[s.oSh]),
    domWristAboveHead: P[s.wr].y < P[LM.nose].y,
    nonDomWristAboveHead: P[s.oWr].y < P[LM.nose].y,
    domElbowHeight: (domSh.y - P[s.el].y) / torso,
    sideProj,
    stanceWidth,
    stanceMethod,
    com: { x: hipMid.x / a, y: hipMid.y },
    headOverBase: (P[LM.nose].x - feetMid.x) / torso,
    wristSpeed: 0,
    comSpeedX: 0,
    comLift: 0,
  };
}

/**
 * Streams PoseFrames into FeatureFrames, adding velocities. The same class is used for live
 * camera frames and for offline video processing so both paths produce identical numbers.
 */
export class FeatureTracker {
  private torsoHistory: number[] = [];
  private prev: FeatureFrame | null = null;
  private speedEma = 0;
  private comYHistory: number[] = [];

  constructor(private ctx: FeatureContext) {}

  setContext(ctx: Partial<FeatureContext>): void {
    this.ctx = { ...this.ctx, ...ctx };
  }

  reset(): void {
    this.torsoHistory = [];
    this.prev = null;
    this.speedEma = 0;
    this.comYHistory = [];
  }

  /** Current stabilised torso length (median of recent valid frames). */
  get torso(): number {
    return median(this.torsoHistory);
  }

  push(frame: PoseFrame): FeatureFrame {
    const raw = computeFrameFeatures(frame, this.ctx);
    if (raw.valid) {
      this.torsoHistory.push(raw.torso);
      if (this.torsoHistory.length > 45) this.torsoHistory.shift();
    }
    const torso = this.torso;
    const f = Number.isFinite(torso) ? computeFrameFeatures(frame, this.ctx, torso) : raw;

    const prev = this.prev;
    if (prev && f.valid && prev.valid) {
      const dt = (f.t - prev.t) / 1000;
      if (dt > 0 && dt < 0.25) {
        const v = Math.hypot(f.domWrist.x - prev.domWrist.x, f.domWrist.y - prev.domWrist.y) / dt;
        // light EMA: keeps the peak but removes single-frame landmark jumps
        this.speedEma = 0.55 * v + 0.45 * this.speedEma;
        f.wristSpeed = this.speedEma;
        f.comSpeedX = ((f.com.x - prev.com.x) * this.ctx.aspect) / f.torso / dt;
      } else {
        this.speedEma = 0;
      }
    } else {
      this.speedEma *= 0.5;
      f.wristSpeed = this.speedEma;
    }
    if (f.valid) {
      this.comYHistory.push(f.com.y);
      if (this.comYHistory.length > 60) this.comYHistory.shift();
      f.comLift = (median(this.comYHistory) - f.com.y) / f.torso;
    }
    this.prev = f;
    return f;
  }
}
