// MediaPipe Pose landmark topology (33 points). "Left"/"right" are the player's anatomical sides.

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** A 2D landmark in normalised image coordinates (0..1) with MediaPipe visibility (0..1). */
export interface Point2 {
  x: number;
  y: number;
  v: number;
}

/** A model-estimated 3D landmark in metres, hip-centred (MediaPipe world landmarks). */
export interface Point3 {
  x: number;
  y: number;
  z: number;
  v: number;
}

export interface PoseFrame {
  /** ms since session/video start */
  t: number;
  image: Point2[];
  world: Point3[] | null;
  /** number of people detected (we track at most 2 to warn about bystanders) */
  people: number;
}

/** Body segments drawn by the skeleton overlay. */
export const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFoot],
  [LM.leftAnkle, LM.leftFoot],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFoot],
  [LM.rightAnkle, LM.rightFoot],
];

/** Landmarks we keep in stored traces (face points other than the nose are dropped). */
export const TRACE_LANDMARKS: readonly number[] = [
  LM.nose,
  LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist,
  LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
  LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot,
];

/** Pairs swapped when a video is mirrored (a mirrored right-hander looks anatomically left-handed). */
const LEFT_RIGHT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10],
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
  [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

/**
 * Undo a mirrored source (e.g. an iPhone selfie recording saved mirrored): flip x and swap
 * anatomical left/right so the "dominant hand" logic keeps pointing at the racket arm.
 */
export function unmirrorFrame<T extends { x: number }>(points: T[], flipX: (x: number) => number): T[] {
  const out = points.map((p) => ({ ...p, x: flipX(p.x) }));
  for (const [a, b] of LEFT_RIGHT_PAIRS) {
    if (a < out.length && b < out.length) {
      const tmp = out[a];
      out[a] = out[b];
      out[b] = tmp;
    }
  }
  return out;
}

export function unmirrorPose(frame: PoseFrame): PoseFrame {
  return {
    ...frame,
    image: unmirrorFrame(frame.image, (x) => 1 - x),
    world: frame.world ? unmirrorFrame(frame.world, (x) => -x) : null,
  };
}
