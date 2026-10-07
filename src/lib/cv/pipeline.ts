// Glue: feature frames → stroke windows → classified strokes with measurements → session findings.
// Identical for live sessions and uploaded videos.

import { classifyStroke } from "./classify";
import { mean } from "./geometry";
import type { FeatureFrame } from "./features";
import { footworkMetrics } from "./footwork";
import { computeStrokeMetrics, strokeQuality } from "./metrics";
import { aggregateFindings, type StrokeForRules } from "./rules";
import type { StrokeWindow } from "./segmentation";
import { refineOverheadContact, segmentStrokes } from "./segmentation";
import { categoryScores } from "../report/scores";
import type { LocalReport, StrokeRecord } from "../data/types";
import type { CameraView, SessionStrokeSelection, StrokeType } from "../tennis/types";

export interface PipelineContext {
  view: CameraView;
  selection: SessionStrokeSelection;
}

let strokeSeq = 0;
export const newStrokeId = () => `s_${Date.now().toString(36)}_${(strokeSeq++).toString(36)}`;

/** Resolve the stroke type from the user's selection and the classifier. */
export function resolveType(selection: SessionStrokeSelection, frames: FeatureFrame[], w: StrokeWindow) {
  const cls = classifyStroke(frames, w);
  if (selection === "forehand" || selection === "backhand" || selection === "serve") {
    return { type: selection as StrokeType, source: "manual" as const, confidence: "high" as const, reasons: ["Selected before the session"], auto: cls };
  }
  if (selection === "volley") {
    const t: StrokeType = cls.type === "backhand" || cls.type === "backhand_volley" ? "backhand_volley" : "forehand_volley";
    return { type: t, source: "manual" as const, confidence: cls.confidence, reasons: ["Volley session; side from classifier", ...cls.reasons], auto: cls };
  }
  return { type: cls.type, source: "auto" as const, confidence: cls.confidence, reasons: cls.reasons, auto: cls };
}

export function buildStroke(frames: FeatureFrame[], window: StrokeWindow, ctx: PipelineContext, index: number, typeOverride?: StrokeType): StrokeRecord {
  const r = resolveType(ctx.selection, frames, window);
  const type = typeOverride ?? r.type;
  const w = type === "serve" || type === "overhead" ? refineOverheadContact(frames, window) : window;
  return {
    id: newStrokeId(),
    index,
    type,
    typeSource: typeOverride ? "user_corrected" : r.source,
    typeConfidence: typeOverride ? "high" : r.confidence,
    typeReasons: r.reasons,
    t0: w.readyStart,
    t1: w.recoveryEnd,
    contactT: w.contactT,
    phases: w.phases,
    metrics: computeStrokeMetrics(frames, w, { view: ctx.view, strokeType: type }),
    quality: strokeQuality(w),
    visibility: w.visibility,
    recoveryObserved: w.recoveryObserved,
    excluded: false,
    keyFrameTimes: [],
  };
}

export const toRuleInput = (s: StrokeRecord): StrokeForRules => ({
  id: s.id,
  type: s.type,
  t0: s.t0,
  t1: s.t1,
  contactT: s.contactT,
  metrics: s.metrics,
  recoveryObserved: s.recoveryObserved,
});

export function sessionLimitations(frames: FeatureFrame[], strokes: StrokeRecord[], view: CameraView): string[] {
  const out: string[] = [];
  const valid = frames.filter((f) => f.valid);
  const tracked = frames.length ? valid.length / frames.length : 0;
  if (tracked < 0.8) out.push(`The player was tracked in only ${Math.round(tracked * 100)}% of frames; some movements could not be assessed.`);
  const feet = mean(valid.map((f) => f.vis.feet));
  if (Number.isFinite(feet) && feet < 0.5) out.push("Feet were often hidden or outside the frame, so footwork and stance measurements are limited.");
  if (valid.some((f) => f.people > 1)) out.push("More than one person appeared in the frame at times; tracking may have switched between people.");
  out.push("Ball and racket are not tracked: contact moments are estimated from body motion, not observed.");
  if (view === "side") out.push("Side view: good for knee bend, elbow and weight transfer; shoulder rotation estimates are less reliable.");
  if (view === "front" || view === "rear") out.push(`${view === "front" ? "Front" : "Rear"} view: good for rotation and balance; knee and elbow angles are foreshortened.`);
  if (strokes.filter((s) => !s.excluded).length < 3) out.push("Few strokes were detected, so patterns could not be confirmed across repetitions.");
  if (strokes.some((s) => s.typeSource === "auto" && s.typeConfidence === "low")) {
    out.push("Some stroke types were classified with low confidence — check and correct them in the stroke list.");
  }
  return out;
}

export function buildLocalReport(frames: FeatureFrame[], windows: StrokeWindow[], strokes: StrokeRecord[], view: CameraView): LocalReport {
  const active = strokes.filter((s) => !s.excluded);
  const findings = aggregateFindings(active.map(toRuleInput));
  return {
    generatedAt: Date.now(),
    findings,
    scores: categoryScores(findings),
    limitations: sessionLimitations(frames, strokes, view),
    sessionMetrics: footworkMetrics(frames, windows, view),
  };
}

/** Re-run findings after the user corrected stroke types or excluded detections. */
export function rebuildFindings(report: LocalReport, strokes: StrokeRecord[]): LocalReport {
  const findings = aggregateFindings(strokes.filter((s) => !s.excluded).map(toRuleInput));
  return { ...report, generatedAt: Date.now(), findings, scores: categoryScores(findings) };
}

export interface SessionAnalysis {
  windows: StrokeWindow[];
  strokes: StrokeRecord[];
  report: LocalReport;
}

/** Full offline analysis of a feature sequence (used for uploads and as the live end-of-session pass). */
export function analyzeSequence(frames: FeatureFrame[], ctx: PipelineContext): SessionAnalysis {
  const windows = segmentStrokes(frames);
  const strokes = windows.map((w, i) => buildStroke(frames, w, ctx, i));
  return { windows, strokes, report: buildLocalReport(frames, windows, strokes, ctx.view) };
}
