// Synthetic, fully-licensed pose traces for tests. A simple 3D stick figure is animated through
// ready → unit turn → backswing → forward swing → finish → recovery, then projected
// orthographically into a 16:9 image, the way a camera in front of the player would see it.
// Ground-truth contact times are returned so tests can check segmentation accuracy.

import { LANDMARK_COUNT, LM, unmirrorPose, type Point2, type Point3, type PoseFrame } from "../../src/lib/cv/landmarks";

type V3 = [number, number, number];

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.cos(Math.PI * x)) / 2);
const lerp3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const rotY = (p: V3, deg: number): V3 => {
  const r = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(r) + p[2] * Math.sin(r), p[1], -p[0] * Math.sin(r) + p[2] * Math.cos(r)];
};

interface Pose3 {
  pts: Map<number, V3>;
}

const READY_WRIST: V3 = [-0.12, -0.1, -0.3];
const BACKSWING: V3 = [-0.8, -0.1, 0.3];
const CONTACT: V3 = [-0.25, -0.05, -0.45];
const FINISH: V3 = [0.25, -0.45, -0.05];

/** Position along backswing → contact → finish, parameterised by 2D arc length. */
function swingPath(u: number): V3 {
  const l1 = Math.hypot(CONTACT[0] - BACKSWING[0], CONTACT[1] - BACKSWING[1]);
  const l2 = Math.hypot(FINISH[0] - CONTACT[0], FINISH[1] - CONTACT[1]);
  const k = l1 / (l1 + l2);
  return u <= k ? lerp3(BACKSWING, CONTACT, u / k) : lerp3(CONTACT, FINISH, (u - k) / (1 - k));
}

/** Arc-length fraction at which the contact point is reached (for ground truth). */
export function contactFraction(): number {
  const l1 = Math.hypot(CONTACT[0] - BACKSWING[0], CONTACT[1] - BACKSWING[1]);
  const l2 = Math.hypot(FINISH[0] - CONTACT[0], FINISH[1] - CONTACT[1]);
  return l1 / (l1 + l2);
}

export interface SynthOptions {
  reps?: number;
  fps?: number;
  /** seconds between swing starts */
  period?: number;
  /** degrees of knee "sink" during loading (0 = straight legs) */
  kneeBend?: number;
  /** shoulder turn at end of preparation */
  turnDeg?: number;
  /** if true, the turn happens during the forward swing instead of preparation */
  lateTurn?: boolean;
  /** visibility for all landmarks */
  visibility?: number;
  /** move feet below the frame */
  feetOutOfFrame?: boolean;
  handedness?: "right" | "left";
  /** add a second person count */
  people?: number;
  /** seed for deterministic jitter (0 = none) */
  jitter?: number;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646 - 0.5;
  };
}

function poseAt(tInRep: number, o: Required<SynthOptions>): Pose3 {
  // timeline (s): ready 0–0.8, prep 0.8–1.45, swing 1.45–1.95, recovery 1.95–2.65
  const prepU = smooth((tInRep - 0.8) / 0.65);
  const swingTau = (tInRep - 1.45) / 0.5;
  const swingU = smooth(swingTau);
  const recU = smooth((tInRep - 1.95) / 0.7);

  let wrist: V3;
  if (tInRep < 1.45) wrist = lerp3(READY_WRIST, BACKSWING, prepU);
  else if (tInRep < 1.95) wrist = swingPath(swingU);
  else wrist = lerp3(FINISH, READY_WRIST, recU);

  // trunk yaw: unit turn during prep (or late, during the swing), unwind through the finish
  const turn = o.turnDeg;
  let yaw: number;
  if (o.lateTurn) {
    if (tInRep < 1.45) yaw = turn * 0.2 * prepU;
    else if (tInRep < 1.6) yaw = turn * (0.2 + 0.8 * smooth((tInRep - 1.45) / 0.15));
    else if (tInRep < 1.95) yaw = turn - (turn + 20) * smooth((tInRep - 1.6) / 0.35);
    else yaw = -20 * (1 - recU);
  } else {
    if (tInRep < 1.45) yaw = turn * prepU;
    else if (tInRep < 1.95) yaw = turn - (turn + 20) * swingU;
    else yaw = -20 * (1 - recU);
  }
  const loadAmt = tInRep < 1.45 ? prepU : tInRep < 1.95 ? 1 - swingU : 0;
  const sink = (o.kneeBend / 30) * 0.09 * loadAmt;

  const pts = new Map<number, V3>();
  const torso = (p: V3, k = 1) => rotY([p[0], p[1] + sink, p[2]], yaw * k);
  pts.set(LM.nose, torso([0, -0.75, -0.08]));
  pts.set(LM.leftShoulder, torso([0.2, -0.5, 0]));
  pts.set(LM.rightShoulder, torso([-0.2, -0.5, 0]));
  pts.set(LM.leftHip, torso([0.12, 0, 0], 0.5));
  pts.set(LM.rightHip, torso([-0.12, 0, 0], 0.5));
  const rs = pts.get(LM.rightShoulder)!;
  const w: V3 = [wrist[0], wrist[1] + sink, wrist[2]];
  pts.set(LM.rightWrist, w);
  pts.set(LM.rightElbow, [(rs[0] + w[0]) / 2 - 0.05, (rs[1] + w[1]) / 2 + 0.08, (rs[2] + w[2]) / 2]);
  const ls = pts.get(LM.leftShoulder)!;
  const lw = torso([0.3, -0.2, -0.25]);
  pts.set(LM.leftWrist, lw);
  pts.set(LM.leftElbow, [(ls[0] + lw[0]) / 2 + 0.05, (ls[1] + lw[1]) / 2 + 0.08, (ls[2] + lw[2]) / 2]);
  // legs: knees move forward (toward camera) as the player sinks
  const kneeZ = -0.35 * (sink / 0.09) * 0.5;
  for (const [hip, knee, ank, heel, foot, x] of [
    [LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftFoot, 0.18],
    [LM.rightHip, LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightFoot, -0.18],
  ] as const) {
    const h = pts.get(hip)!;
    pts.set(knee, [(h[0] + x) / 2, 0.45, kneeZ]);
    pts.set(ank, [x, 0.9, 0]);
    pts.set(heel, [x, 0.95, 0.06]);
    pts.set(foot, [x, 0.97, -0.12]);
  }
  return { pts };
}

export function synthForehands(opts: SynthOptions = {}): { frames: PoseFrame[]; contacts: number[] } {
  const o: Required<SynthOptions> = {
    reps: 3, fps: 30, period: 3.2, kneeBend: 25, turnDeg: 70, lateTurn: false, visibility: 0.95,
    feetOutOfFrame: false, handedness: "right", people: 1, jitter: 0, ...opts,
  };
  const aspect = 16 / 9;
  const scale = 0.33;
  const r = rng(o.jitter);
  const frames: PoseFrame[] = [];
  const contacts: number[] = [];
  const total = o.reps * o.period + 0.5;
  for (let rep = 0; rep < o.reps; rep++) {
    // contact ≈ when the arc-length parameter hits the contact fraction
    const tau = Math.acos(1 - 2 * contactFraction()) / Math.PI;
    contacts.push((rep * o.period + 1.45 + tau * 0.5) * 1000);
  }
  for (let i = 0; i <= total * o.fps; i++) {
    const t = i / o.fps;
    const rep = Math.floor(t / o.period);
    const tIn = rep < o.reps ? t - rep * o.period : 99;
    const pose = poseAt(tIn, o);
    const image: Point2[] = [];
    const world: Point3[] = [];
    for (let k = 0; k < LANDMARK_COUNT; k++) {
      const p = pose.pts.get(k) ?? pose.pts.get(LM.nose)!;
      const j = o.jitter ? r() * 0.004 : 0;
      let y = 0.42 + p[1] * scale + j;
      if (o.feetOutOfFrame) y += 0.35;
      const isFoot = [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot].includes(k as never);
      const v = o.feetOutOfFrame && isFoot ? 0.1 : o.visibility;
      image.push({ x: 0.5 + (p[0] * scale) / aspect + j, y, v });
      world.push({ x: p[0], y: p[1], z: p[2], v });
    }
    frames.push({ t: t * 1000, image, world, people: o.people });
  }
  if (o.handedness === "left") return { frames: frames.map(unmirrorPose), contacts };
  return { frames, contacts };
}

/** A simple flat serve: toss arm rises above the head, hitting arm drives up to a high contact. */
export function synthServes(reps = 2, fps = 30): { frames: PoseFrame[]; contacts: number[] } {
  const aspect = 16 / 9;
  const scale = 0.33;
  const frames: PoseFrame[] = [];
  const contacts: number[] = [];
  const period = 4;
  for (let rep = 0; rep < reps; rep++) contacts.push((rep * period + 2.0) * 1000);
  for (let i = 0; i <= (reps * period + 0.5) * fps; i++) {
    const t = i / fps;
    const rep = Math.floor(t / period);
    const tIn = rep < reps ? t - rep * period : 99;
    const toss = smooth((tIn - 0.6) / 0.6) * (1 - smooth((tIn - 1.75) / 0.3));
    const load = smooth((tIn - 0.8) / 0.7) * (1 - smooth((tIn - 1.6) / 0.3));
    // hitting wrist: from waist, back behind the shoulder (trophy), then up fast to contact above head
    let rw: V3;
    if (tIn < 1.6) rw = lerp3([-0.25, -0.1, 0], [-0.35, -0.55, 0.25], smooth((tIn - 0.8) / 0.8));
    else if (tIn < 2.2) {
      const u = smooth((tIn - 1.6) / 0.8);
      rw = u < 0.5 ? lerp3([-0.35, -0.55, 0.25], [-0.15, -1.25, -0.1], u * 2) : lerp3([-0.15, -1.25, -0.1], [0.2, -0.2, -0.3], (u - 0.5) * 2);
    } else rw = lerp3([0.2, -0.2, -0.3], [-0.25, -0.1, 0], smooth((tIn - 2.2) / 0.6));
    const sink = 0.08 * load;
    const pts = new Map<number, V3>([
      [LM.nose, [0, -0.75 + sink, -0.08]],
      [LM.leftShoulder, [0.2, -0.5 + sink, 0]],
      [LM.rightShoulder, [-0.2, -0.5 + sink, 0]],
      [LM.leftHip, [0.12, sink, 0]],
      [LM.rightHip, [-0.12, sink, 0]],
      [LM.rightWrist, [rw[0], rw[1] + sink, rw[2]]],
      [LM.rightElbow, [(-0.2 + rw[0]) / 2 - 0.08, (-0.5 + rw[1]) / 2 + sink, rw[2] / 2]],
      [LM.leftWrist, [0.25, -0.15 - 1.1 * toss + sink, -0.2]],
      [LM.leftElbow, [0.22, -0.32 - 0.6 * toss + sink, -0.1]],
      [LM.leftKnee, [0.15, 0.45, -0.2 * load]],
      [LM.rightKnee, [-0.15, 0.45, -0.2 * load]],
      [LM.leftAnkle, [0.18, 0.9, 0]],
      [LM.rightAnkle, [-0.18, 0.9, 0]],
      [LM.leftHeel, [0.18, 0.95, 0.06]],
      [LM.rightHeel, [-0.18, 0.95, 0.06]],
      [LM.leftFoot, [0.18, 0.97, -0.12]],
      [LM.rightFoot, [-0.18, 0.97, -0.12]],
    ]);
    const image: Point2[] = [];
    const world: Point3[] = [];
    for (let k = 0; k < LANDMARK_COUNT; k++) {
      const p = pts.get(k) ?? pts.get(LM.nose)!;
      image.push({ x: 0.5 + (p[0] * scale) / aspect, y: 0.45 + p[1] * scale, v: 0.95 });
      world.push({ x: p[0], y: p[1], z: p[2], v: 0.95 });
    }
    frames.push({ t: t * 1000, image, world, people: 1 });
  }
  return { frames, contacts };
}

/** Standing still for `seconds` — no strokes should be detected. */
export function synthIdle(seconds = 4, fps = 30): PoseFrame[] {
  const { frames } = synthForehands({ reps: 0, fps });
  const base = frames[0];
  return Array.from({ length: Math.round(seconds * fps) }, (_, i) => ({ ...base, t: (i * 1000) / fps }));
}
