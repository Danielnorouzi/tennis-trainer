import { describe, expect, it } from "vitest";
import { angleDiff, cv, jointAngle, leanFromVertical, lineTilt, median, yaw3 } from "@/lib/cv/geometry";
import { LANDMARK_COUNT, LM, unmirrorPose, type PoseFrame } from "@/lib/cv/landmarks";
import { OneEuro, PoseSmoother } from "@/lib/cv/smoothing";
import { decodeTrace, encodeTrace, frameAt } from "@/lib/cv/trace";
import { synthForehands } from "../fixtures/synthetic";

describe("joint angles", () => {
  it("measures a right angle and a straight limb", () => {
    expect(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(90, 6);
    expect(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(180, 6);
  });
  it("works in 3D", () => {
    expect(jointAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90, 6);
  });
  it("returns NaN for degenerate input", () => {
    expect(jointAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNaN();
  });
});

describe("orientation helpers", () => {
  it("lineTilt is positive when the second point is higher in the image", () => {
    expect(lineTilt({ x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(45, 6);
    expect(lineTilt({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
  });
  it("leanFromVertical is 0 upright", () => {
    expect(leanFromVertical({ x: 0, y: 1 }, { x: 0, y: 0 })).toBeCloseTo(0, 6);
    expect(leanFromVertical({ x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(45, 6);
  });
  it("angleDiff wraps around ±180", () => {
    expect(angleDiff(170, -170)).toBeCloseTo(-20, 6);
    expect(angleDiff(-170, 170)).toBeCloseTo(20, 6);
  });
  it("yaw3 measures rotation of a segment around the vertical axis", () => {
    expect(yaw3({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(0, 6);
    expect(yaw3({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90, 6);
  });
  it("median and coefficient of variation ignore NaN", () => {
    expect(median([3, NaN, 1, 2])).toBe(2);
    expect(cv([1, 1, 1])).toBe(0);
  });
});

describe("mirrored-camera handling", () => {
  const frame: PoseFrame = {
    t: 0,
    people: 1,
    image: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({ x: i / 100, y: 0.5, v: 1 })),
    world: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({ x: i / 10, y: 0, z: 0, v: 1 })),
  };
  it("flips x and swaps anatomical left/right", () => {
    const m = unmirrorPose(frame);
    expect(m.image[LM.leftWrist].x).toBeCloseTo(1 - frame.image[LM.rightWrist].x, 6);
    expect(m.image[LM.rightShoulder].x).toBeCloseTo(1 - frame.image[LM.leftShoulder].x, 6);
    expect(m.world![LM.leftHip].x).toBeCloseTo(-frame.world![LM.rightHip].x, 6);
    expect(m.image[LM.nose].x).toBeCloseTo(1 - frame.image[LM.nose].x, 6);
  });
  it("is its own inverse", () => {
    const back = unmirrorPose(unmirrorPose(frame));
    back.image.forEach((p, i) => expect(p.x).toBeCloseTo(frame.image[i].x, 9));
  });
});

describe("landmark smoothing", () => {
  it("passes a constant through unchanged", () => {
    const f = new OneEuro();
    let out = 0;
    for (let i = 0; i < 30; i++) out = f.filter(0.5, i * 33);
    expect(out).toBeCloseTo(0.5, 9);
  });
  it("reduces jitter on a still landmark", () => {
    const f = new OneEuro(1.5, 8);
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 0; i < 120; i++) {
      const x = 0.5 + (i % 2 ? 0.01 : -0.01);
      raw.push(x);
      smooth.push(f.filter(x, i * 33));
    }
    const spread = (xs: number[]) => Math.max(...xs.slice(20)) - Math.min(...xs.slice(20));
    expect(spread(smooth)).toBeLessThan(spread(raw) / 2);
  });
  it("tracks fast motion with little lag", () => {
    const f = new OneEuro(1.5, 8);
    let out = 0;
    for (let i = 0; i <= 10; i++) out = f.filter(i * 0.05, i * 33);
    expect(out).toBeGreaterThan(0.4); // true value 0.5
  });
  it("PoseSmoother resets after a tracking gap", () => {
    const s = new PoseSmoother();
    const { frames } = synthForehands({ reps: 1 });
    s.smooth(frames[0]);
    const jumped = { ...frames[1], t: frames[0].t + 5000, image: frames[1].image.map((p) => ({ ...p, x: p.x + 0.2 })) };
    const out = s.smooth(jumped);
    expect(out.image[LM.nose].x).toBeCloseTo(jumped.image[LM.nose].x, 6);
  });
});

describe("pose trace storage", () => {
  it("round-trips frames", () => {
    const { frames } = synthForehands({ reps: 1 });
    const decoded = decodeTrace(encodeTrace(frames));
    expect(decoded).toHaveLength(frames.length);
    expect(decoded[10].t).toBeCloseTo(frames[10].t, 2);
    expect(decoded[10].image[LM.rightWrist].x).toBeCloseTo(frames[10].image[LM.rightWrist].x, 5);
    expect(decoded[10].world![LM.leftShoulder].z).toBeCloseTo(frames[10].world![LM.leftShoulder].z, 5);
  });
  it("downsamples long sessions", () => {
    const { frames } = synthForehands({ reps: 3 });
    expect(decodeTrace(encodeTrace(frames, 50)).length).toBeLessThanOrEqual(51);
  });
  it("finds the frame at a timestamp", () => {
    const { frames } = synthForehands({ reps: 1 });
    expect(frameAt(frames, 1000)?.t).toBeLessThanOrEqual(1000);
    expect(frameAt([], 0)).toBeNull();
  });
});
