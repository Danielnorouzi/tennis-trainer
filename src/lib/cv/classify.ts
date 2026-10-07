// Heuristic stroke classification. Deliberately conservative: it never returns "high" confidence,
// and the UI recommends manual stroke selection whenever confidence is low.

import { mean } from "./geometry";
import type { FeatureFrame } from "./features";
import { framesBetween, type StrokeWindow } from "./segmentation";
import type { Confidence, StrokeType } from "../tennis/types";

export interface Classification {
  type: StrokeType;
  confidence: Confidence;
  reasons: string[];
}

export function classifyStroke(frames: FeatureFrame[], w: StrokeWindow): Classification {
  const contact = framesBetween(frames, w.contactT - 60, w.contactT + 60).filter((f) => f.valid);
  const load = framesBetween(frames, w.loadT - 220, w.loadT + 20).filter((f) => f.valid);
  const beforeContact = framesBetween(frames, w.contactT - 1200, w.contactT - 100).filter((f) => f.valid);
  if (!contact.length || !load.length) {
    return { type: "unknown", confidence: "low", reasons: ["The swing was not tracked clearly enough to classify."] };
  }

  // Overhead family: the hitting hand is clearly above the head just before / at the speed peak.
  // (On serves the fastest hand movement is often just after contact, on the way down.)
  const nearPeak = framesBetween(frames, w.contactT - 250, w.contactT + 60).filter((f) => f.valid);
  const highFrames = nearPeak.filter((f) => f.domWristAboveHead && f.domWristHeight > 1.0).length;
  if (highFrames >= Math.max(2, nearPeak.length * 0.25)) {
    const tossArmUp = beforeContact.some((f) => f.nonDomWristAboveHead);
    const stationary = mean(beforeContact.map((f) => Math.abs(f.comSpeedX))) < 0.6;
    if (tossArmUp && stationary) {
      return { type: "serve", confidence: "medium", reasons: ["Hitting arm above head at the speed peak", "Non-hitting arm raised beforehand (toss motion)", "Feet mostly stationary before the swing"] };
    }
    return { type: "overhead", confidence: "low", reasons: ["Hitting arm above head at the speed peak", tossArmUp ? "Player was moving beforehand" : "No toss-arm motion detected"] };
  }

  const duration = (w.followEnd - w.prepStart) / 1000;
  const side = mean(load.map((f) => f.sideProj));
  const wristDrop = (() => {
    const a = framesBetween(frames, w.loadT - 40, w.loadT + 40).filter((f) => f.valid);
    if (!a.length) return NaN;
    return mean(a.map((f) => f.domWrist.y)) - mean(contact.map((f) => f.domWrist.y));
  })();

  if (!Number.isFinite(side)) {
    return { type: "unknown", confidence: "low", reasons: ["3D landmark estimate unavailable; cannot tell which side the racket was prepared on."] };
  }

  let base: "forehand" | "backhand" | null = null;
  if (side > 0.25) base = "forehand";
  else if (side < -0.15) base = "backhand";
  if (!base) {
    return { type: "unknown", confidence: "low", reasons: ["Racket-arm preparation was close to the body centre; side is ambiguous."] };
  }
  const margin = base === "forehand" ? side - 0.25 : -0.15 - side;
  const reasons = [
    base === "forehand" ? "Hitting hand prepared on the dominant side" : "Hitting hand prepared across the body",
  ];

  if (duration < 0.6 && w.peakSpeed < 7) {
    reasons.push("Short, compact motion");
    return { type: base === "forehand" ? "forehand_volley" : "backhand_volley", confidence: "low", reasons };
  }
  if (base === "backhand" && wristDrop > 0.35) {
    reasons.push("High-to-low swing path");
    return { type: "slice", confidence: "low", reasons };
  }
  return { type: base, confidence: margin > 0.25 && w.visibility > 0.75 ? "medium" : "low", reasons };
}

/** Which strokes count as groundstrokes for the rule set. */
export function strokeFamily(t: StrokeType): "groundstroke" | "serve" | "volley" | "overhead" | "unknown" {
  switch (t) {
    case "forehand":
    case "backhand":
    case "slice":
    case "return":
    case "approach":
    case "defensive":
      return "groundstroke";
    case "serve":
      return "serve";
    case "forehand_volley":
    case "backhand_volley":
      return "volley";
    case "overhead":
      return "overhead";
    default:
      return "unknown";
  }
}
