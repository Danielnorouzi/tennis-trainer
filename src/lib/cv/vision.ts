"use client";

// MediaPipe Pose Landmarker in the browser. Frames never leave the device for tracking.
// WASM + models are served from /mediapipe (copied at build time / optional fetch-models script)
// with a public CDN fallback. We benchmark GPU vs CPU delegates on the actual input and keep the
// faster one, and fall back from the "full" to the "lite" model on slower devices.

import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Point2, Point3, PoseFrame } from "./landmarks";

const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODELS = {
  full: {
    local: "/mediapipe/models/pose_landmarker_full.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  },
  lite: {
    local: "/mediapipe/models/pose_landmarker_lite.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  },
} as const;

/** If one full-model inference takes longer than this, prefer the lite model. */
const FULL_MODEL_BUDGET_MS = 35;

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

export interface VisionInfo {
  model: "full" | "lite";
  delegate: "GPU" | "CPU";
  inferenceMs: number;
  source: "local" | "cdn";
}

export interface Vision {
  landmarker: PoseLandmarker;
  info: VisionInfo;
  close: () => void;
}

type Input = HTMLVideoElement | HTMLCanvasElement;

async function create(model: keyof typeof MODELS, delegate: "GPU" | "CPU", local: boolean): Promise<PoseLandmarker> {
  const wasmBase = local ? "/mediapipe/wasm" : CDN_WASM;
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const modelUrl = local && (await exists(MODELS[model].local)) ? MODELS[model].local : MODELS[model].cdn;
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: "VIDEO",
    // Two poses so we can warn about bystanders; we only analyse the most prominent one.
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/** Time a few inferences; timestamps are kept below performance.now() so later calls stay monotonic. */
function bench(lm: PoseLandmarker, input: Input): number {
  let ts = performance.now() - 5000;
  for (let i = 0; i < 2; i++) lm.detectForVideo(input, (ts += 1));
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) lm.detectForVideo(input, (ts += 1));
  return (performance.now() - t0) / 4;
}

let monotonic = 0;
/**
 * MediaPipe VIDEO mode requires strictly increasing timestamps across *every* call on a
 * landmarker. The landmarker is shared by live coaching and video upload, so all callers use this.
 */
export function nextTimestamp(): number {
  monotonic = Math.max(monotonic + 1, performance.now());
  return monotonic;
}

let shared: Promise<Vision> | null = null;

/** Load (once per page) and pick the fastest working configuration for this device. */
export function loadVision(input: Input): Promise<Vision> {
  shared ??= (async (): Promise<Vision> => {
    const local = await exists("/mediapipe/wasm/vision_wasm_internal.wasm");
    const tryCreate = async (model: keyof typeof MODELS) => {
      const results: { lm: PoseLandmarker; delegate: "GPU" | "CPU"; ms: number }[] = [];
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          const lm = await create(model, delegate, local);
          results.push({ lm, delegate, ms: bench(lm, input) });
        } catch {
          /* delegate not supported on this device */
        }
      }
      results.sort((a, b) => a.ms - b.ms);
      results.slice(1).forEach((r) => r.lm.close());
      return results[0];
    };
    let best = await tryCreate("full");
    let model: "full" | "lite" = "full";
    if (!best || best.ms > FULL_MODEL_BUDGET_MS) {
      const lite = await tryCreate("lite");
      if (lite && (!best || lite.ms < best.ms)) {
        best?.lm.close();
        best = lite;
        model = "lite";
      } else lite?.lm.close();
    }
    if (!best) throw new Error("Pose tracking could not start in this browser. Try the latest Chrome, Edge or Safari.");
    const chosen = best;
    return {
      landmarker: chosen.lm,
      info: { model, delegate: chosen.delegate, inferenceMs: Math.round(chosen.ms), source: (local ? "local" : "cdn") as VisionInfo["source"] },
      close: () => {
        chosen.lm.close();
        shared = null;
      },
    };
  })().catch((e) => {
    shared = null;
    throw e;
  });
  return shared as Promise<Vision>;
}

/** Pick the most prominent person (largest torso) from a multi-pose result. */
export function toPoseFrame(result: PoseLandmarkerResult, t: number): PoseFrame | null {
  const all = result.landmarks ?? [];
  if (!all.length) return null;
  let best = 0;
  let bestSize = -1;
  all.forEach((lm, i) => {
    const size = Math.abs((lm[11]?.y ?? 0) - (lm[23]?.y ?? 0)) + Math.abs((lm[11]?.x ?? 0) - (lm[12]?.x ?? 0));
    if (size > bestSize) {
      bestSize = size;
      best = i;
    }
  });
  const lm = all[best];
  const world = result.worldLandmarks?.[best];
  const image: Point2[] = lm.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 0 }));
  const w: Point3[] | null = world ? world.map((p, i) => ({ x: p.x, y: p.y, z: p.z, v: lm[i]?.visibility ?? 0 })) : null;
  return { t, image, world: w, people: all.length };
}

/**
 * Mean luminance (0–255) and background motion from tiny thumbnails. Background motion only
 * counts cells outside the player's bounding box, so the swing itself doesn't register.
 */
export function createSceneMeter() {
  const W = 32;
  const H = 18;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let prev: Uint8ClampedArray | null = null;
  return (source: CanvasImageSource, box: { x0: number; y0: number; x1: number; y1: number } | null) => {
    if (!ctx) return { luma: null, motion: null };
    ctx.drawImage(source, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    let sum = 0;
    let diff = 0;
    let cells = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += l;
        const nx = x / W;
        const ny = y / H;
        const inBox = box && nx >= box.x0 - 0.08 && nx <= box.x1 + 0.08 && ny >= box.y0 - 0.08 && ny <= box.y1 + 0.05;
        if (prev && !inBox) {
          diff += Math.abs(l - (0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2]));
          cells += 1;
        }
      }
    }
    const motion = prev && cells > 20 ? diff / cells : null;
    prev = new Uint8ClampedArray(data);
    return { luma: sum / (W * H), motion };
  };
}
