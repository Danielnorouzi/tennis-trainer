// Core domain vocabulary shared by the CV pipeline, the AI layer, storage and the UI.

export const STROKE_TYPES = [
  "forehand",
  "backhand",
  "serve",
  "forehand_volley",
  "backhand_volley",
  "overhead",
  "slice",
  "return",
  "approach",
  "defensive",
  "unknown",
] as const;
export type StrokeType = (typeof STROKE_TYPES)[number];

/** What the player picks before a session. "footwork" analyses movement, not swings. */
export const SESSION_FOCUSES = ["auto", "forehand", "backhand", "serve", "volley", "footwork"] as const;
export type SessionStrokeSelection = (typeof SESSION_FOCUSES)[number];

export const CAMERA_VIEWS = ["side", "front", "rear", "diagonal"] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

export const PHASES = [
  "ready",
  "preparation",
  "loading",
  "acceleration",
  "contact",
  "follow_through",
  "recovery",
] as const;
export type PhaseName = (typeof PHASES)[number];

export const CONFIDENCE = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const PRIORITY = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITY)[number];

/** green = acceptable, amber = potential issue, red = significant high-confidence issue, gray = insufficient evidence */
export type Severity = "ok" | "watch" | "issue" | "insufficient";

export const CATEGORIES = [
  "preparation",
  "balance",
  "timing",
  "rotation",
  "footwork",
  "follow_through",
  "recovery",
  "consistency",
  "legs",
  "arm",
  "serve_toss",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The eight report categories that can receive a heuristic score. */
export const SCORE_CATEGORIES = [
  "preparation",
  "balance",
  "timing",
  "rotation",
  "footwork",
  "follow_through",
  "recovery",
  "consistency",
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export type Handedness = "right" | "left";
export type BackhandStyle = "one" | "two";
export type Experience = "beginner" | "intermediate" | "advanced";

/**
 * How a number was obtained. The UI keeps these visually separate:
 * - measured_2d: computed directly from 2D image landmarks (still subject to perspective).
 * - estimated_3d: from MediaPipe's monocular "world" landmarks — a model estimate, not a measurement.
 * - derived: timing / counts derived from tracked motion.
 */
export type MeasurementMethod = "measured_2d" | "estimated_3d" | "derived";

export interface Measurement {
  key: string;
  label: string;
  value: number;
  unit: "deg" | "s" | "ratio" | "torso/s" | "torso" | "%" | "count";
  confidence: Confidence;
  method: MeasurementMethod;
  note?: string;
}

export interface Phase {
  name: PhaseName;
  /** ms from the start of the session / video */
  start: number;
  end: number;
  /** true when the boundary is inferred from body motion only (e.g. contact without a visible ball) */
  estimated: boolean;
}

export interface Finding {
  id: string;
  source: "local" | "ai";
  ruleId?: string;
  category: Category;
  title: string;
  observation: string;
  evidence: string[];
  whyItMatters: string;
  adjustment: string;
  drillId: string | null;
  priority: Priority;
  confidence: Confidence;
  severity: Severity;
  strokeIds: string[];
  t0: number | null;
  t1: number | null;
  /** short spoken/visual cue for live coaching */
  cue?: string;
}
