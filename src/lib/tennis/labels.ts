import type { CameraView, Category, Confidence, PhaseName, Priority, SessionStrokeSelection, Severity, StrokeType } from "./types";

export const STROKE_LABEL: Record<StrokeType, string> = {
  forehand: "Forehand",
  backhand: "Backhand",
  serve: "Serve",
  forehand_volley: "Forehand volley",
  backhand_volley: "Backhand volley",
  overhead: "Overhead",
  slice: "Slice",
  return: "Return of serve",
  approach: "Approach shot",
  defensive: "Defensive shot",
  unknown: "Unclassified",
};

export const SELECTION_LABEL: Record<SessionStrokeSelection, string> = {
  auto: "Automatic",
  forehand: "Forehand",
  backhand: "Backhand",
  serve: "Serve",
  volley: "Volleys",
  footwork: "Footwork",
};

export const PHASE_LABEL: Record<PhaseName, string> = {
  ready: "Ready",
  preparation: "Preparation",
  loading: "Loading",
  acceleration: "Acceleration",
  contact: "Contact (est.)",
  follow_through: "Follow-through",
  recovery: "Recovery",
};

export const PHASE_COLOR: Record<PhaseName, string> = {
  ready: "#8e8e93",
  preparation: "#64d2ff",
  loading: "#5e5ce6",
  acceleration: "#ff9f0a",
  contact: "#ff375f",
  follow_through: "#30d158",
  recovery: "#a2845e",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  preparation: "Preparation",
  balance: "Balance",
  timing: "Timing",
  rotation: "Body rotation",
  footwork: "Footwork",
  follow_through: "Follow-through",
  recovery: "Recovery",
  consistency: "Consistency",
  legs: "Leg drive",
  arm: "Arm & contact",
  serve_toss: "Toss & tossing arm",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High priority", medium: "Medium priority", low: "Low priority" };
export const SEVERITY_LABEL: Record<Severity, string> = {
  ok: "Looks good",
  watch: "Worth watching",
  issue: "Needs work",
  insufficient: "Not enough evidence",
};

export interface ViewGuide {
  view: CameraView;
  title: string;
  placement: string;
  bestFor: string[];
  limited: string[];
}

export const VIEW_GUIDES: Record<CameraView, ViewGuide> = {
  side: {
    view: "side",
    title: "Side view",
    placement: "Camera level with your hips, 4–6 m to your side, facing the side of your body.",
    bestFor: ["Knee bend", "Elbow extension", "Weight transfer", "Trunk lean", "Serve trophy position"],
    limited: ["Shoulder rotation (estimated only)", "Stance width"],
  },
  front: {
    view: "front",
    title: "Front view",
    placement: "Camera in front of you (e.g. across the net), whole body in frame.",
    bestFor: ["Unit turn and rotation", "Balance and head position", "Stance width", "Lateral movement"],
    limited: ["Knee and elbow angles (foreshortened)", "Weight transfer"],
  },
  rear: {
    view: "rear",
    title: "Rear view",
    placement: "Camera behind you on the baseline, centred, whole body in frame.",
    bestFor: ["Rotation and unit turn", "Balance", "Recovery positioning", "Serve alignment"],
    limited: ["Knee and elbow angles", "Contact point (body may block it)"],
  },
  diagonal: {
    view: "diagonal",
    title: "Diagonal view",
    placement: "Camera about 45° in front of your hitting side, 4–6 m away.",
    bestFor: ["Good all-round compromise", "Preparation and turn", "Knee bend", "Follow-through"],
    limited: ["Every measurement is somewhat foreshortened"],
  },
};

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatStamp(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

export function formatValue(value: number, unit: string): string {
  switch (unit) {
    case "deg":
      return `${Math.round(value)}°`;
    case "s":
      return `${value.toFixed(2)} s`;
    case "%":
      return `${Math.round(value)}%`;
    case "count":
      return String(Math.round(value));
    case "ratio":
      return `${value.toFixed(2)}×`;
    case "torso":
      return `${value.toFixed(2)} TL`;
    case "torso/s":
      return `${value.toFixed(1)} TL/s`;
    default:
      return String(value);
  }
}
