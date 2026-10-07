"use client";

// Canvas overlay: skeleton, joint dots, selected joint angles, a fading wrist trail, and joints
// highlighted for the current coaching focus. Colours follow the app-wide evidence scheme:
// green = acceptable, amber = potential issue, red = significant high-confidence issue,
// gray = insufficient evidence.

import { jointAngle } from "./geometry";
import { LM, SKELETON, type Point2 } from "./landmarks";
import type { Category, Handedness, Severity } from "../tennis/types";

export const SEVERITY_COLOR: Record<Severity, string> = {
  ok: "#34c759",
  watch: "#ffb020",
  issue: "#ff453a",
  insufficient: "#8e8e93",
};

export const CATEGORY_JOINTS: Partial<Record<Category, (h: Handedness) => number[]>> = {
  legs: () => [LM.leftKnee, LM.rightKnee, LM.leftHip, LM.rightHip],
  arm: (h) => (h === "right" ? [LM.rightShoulder, LM.rightElbow, LM.rightWrist] : [LM.leftShoulder, LM.leftElbow, LM.leftWrist]),
  balance: () => [LM.nose, LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle],
  preparation: () => [LM.leftShoulder, LM.rightShoulder],
  rotation: () => [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
  follow_through: (h) => [h === "right" ? LM.rightWrist : LM.leftWrist],
  recovery: () => [LM.leftAnkle, LM.rightAnkle],
  footwork: () => [LM.leftAnkle, LM.rightAnkle, LM.leftFoot, LM.rightFoot],
  serve_toss: (h) => [h === "right" ? LM.leftWrist : LM.rightWrist],
};

export interface OverlayOptions {
  width: number;
  height: number;
  /** draw mirrored (to match a mirrored preview) */
  mirror: boolean;
  handedness: Handedness;
  showSkeleton: boolean;
  showAngles: boolean;
  /** joints to highlight and with which severity colour */
  highlight?: { joints: number[]; severity: Severity } | null;
  /** recent dominant-wrist positions (normalised) for the trail */
  trail?: { x: number; y: number }[];
  /** overall tracking quality 0..1 — dims the skeleton when low */
  quality?: number;
  /** horizontal letterbox handling: the video's content rect inside the canvas */
  content?: { x: number; y: number; w: number; h: number };
  /** pulse 0..1 after a stroke is detected */
  pulse?: number;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, pts: Point2[] | null, o: OverlayOptions): void {
  ctx.clearRect(0, 0, o.width, o.height);
  if (!pts) return;
  const box = o.content ?? { x: 0, y: 0, w: o.width, h: o.height };
  const X = (x: number) => box.x + (o.mirror ? 1 - x : x) * box.w;
  const Y = (y: number) => box.y + y * box.h;
  const scale = Math.max(1, box.h / 540);
  const alpha = 0.35 + 0.65 * Math.min(1, Math.max(0, o.quality ?? 1));
  const ok = (i: number) => (pts[i]?.v ?? 0) > 0.45;

  // trail
  if (o.trail && o.trail.length > 1) {
    ctx.lineCap = "round";
    for (let i = 1; i < o.trail.length; i++) {
      const a = o.trail[i - 1];
      const b = o.trail[i];
      ctx.strokeStyle = `rgba(120, 200, 255, ${(i / o.trail.length) * 0.75 * alpha})`;
      ctx.lineWidth = (1.5 + (i / o.trail.length) * 3.5) * scale;
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
    }
  }

  if (o.showSkeleton) {
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.82 * alpha})`;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4 * scale;
    for (const [a, b] of SKELETON) {
      if (!ok(a) || !ok(b)) continue;
      ctx.beginPath();
      ctx.moveTo(X(pts[a].x), Y(pts[a].y));
      ctx.lineTo(X(pts[b].x), Y(pts[b].y));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const hl = new Set(o.highlight?.joints ?? []);
    const joints = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist,
      LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
    for (const i of joints) {
      const p = pts[i];
      if (!p) continue;
      const visible = p.v > 0.45;
      const color = hl.has(i) && o.highlight ? SEVERITY_COLOR[o.highlight.severity] : visible ? "#ffffff" : SEVERITY_COLOR.insufficient;
      const r = (hl.has(i) ? 7 : 4.5) * scale * (hl.has(i) && o.pulse ? 1 + 0.4 * o.pulse : 1);
      ctx.fillStyle = color;
      ctx.globalAlpha = visible ? alpha : 0.35;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
      ctx.fill();
      if (hl.has(i)) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * scale;
        ctx.globalAlpha = 0.5 * alpha;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), r + 5 * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  if (o.showAngles) {
    const aspect = box.w / box.h;
    const P = (i: number) => ({ x: pts[i].x * aspect, y: pts[i].y });
    const label = (at: number, a: number, b: number, c: number) => {
      if (!ok(a) || !ok(b) || !ok(c)) return;
      const deg = jointAngle(P(a), P(b), P(c));
      if (!Number.isFinite(deg)) return;
      const x = X(pts[b].x) + 10 * scale;
      const y = Y(pts[b].y) - 10 * scale;
      const text = `${Math.round(deg)}°`;
      ctx.font = `600 ${12 * scale}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 10 * scale;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, x, y - 12 * scale, w, 18 * scale, 9 * scale);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + 5 * scale, y + 1.5 * scale);
      void at;
    };
    const dom = o.handedness === "right"
      ? [LM.rightShoulder, LM.rightElbow, LM.rightWrist]
      : [LM.leftShoulder, LM.leftElbow, LM.leftWrist];
    label(0, dom[0], dom[1], dom[2]);
    label(1, LM.leftHip, LM.leftKnee, LM.leftAnkle);
    label(2, LM.rightHip, LM.rightKnee, LM.rightAnkle);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Where a video with object-fit: cover|contain lands inside its element box. */
export function contentRect(
  elW: number, elH: number, vidW: number, vidH: number, fit: "cover" | "contain",
): { x: number; y: number; w: number; h: number } {
  if (!vidW || !vidH) return { x: 0, y: 0, w: elW, h: elH };
  const s = fit === "cover" ? Math.max(elW / vidW, elH / vidH) : Math.min(elW / vidW, elH / vidH);
  const w = vidW * s;
  const h = vidH * s;
  return { x: (elW - w) / 2, y: (elH - h) / 2, w, h };
}
