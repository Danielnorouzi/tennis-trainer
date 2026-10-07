// Evidence-gated technique rules.
//
// Design principles (mirroring how a good coach works):
// 1. A rule only fires when the measurement it depends on exists *and* is trustworthy for the
//    current camera view (see VIEW_SUITABILITY). Otherwise the category is "insufficient evidence".
// 2. Single-stroke hits are only used for live cues. Session findings require the pattern to repeat
//    across strokes, so the report doesn't repeat the same note for every forehand.
// 3. Thresholds are deliberately lenient — many styles are valid. A threshold crossing produces an
//    amber "watch" by default; red "issue" needs a large margin and at least medium confidence.

import { cv as coeffVar, round } from "./geometry";
import { getMeasurement } from "./metrics";
import { strokeFamily } from "./classify";
import type { Category, Confidence, Finding, Measurement, Priority, Severity, StrokeType } from "../tennis/types";

export interface StrokeForRules {
  id: string;
  type: StrokeType;
  t0: number;
  t1: number;
  contactT: number;
  metrics: Measurement[];
  recoveryObserved: boolean;
}

interface RuleHit {
  severity: Exclude<Severity, "ok" | "insufficient">;
  confidence: Confidence;
  evidence: string;
}

interface RuleDef {
  id: string;
  category: Category;
  appliesTo: (t: StrokeType) => boolean;
  /** measurement keys this rule needs; used to decide "insufficient evidence" */
  needs: string[];
  basePriority: Priority;
  title: string;
  observation: string;
  whyItMatters: string;
  adjustment: string;
  drillId: string;
  cue: string;
  evaluate: (ms: Measurement[], t: StrokeType) => RuleHit | null;
}

const ORDER: Confidence[] = ["low", "medium", "high"];
const confAtLeast = (c: Confidence, min: Confidence) => ORDER.indexOf(c) >= ORDER.indexOf(min);
const isGround = (t: StrokeType) => strokeFamily(t) === "groundstroke";
const isServe = (t: StrokeType) => strokeFamily(t) === "serve";
const isForehandLike = (t: StrokeType) => t === "forehand" || t === "return" || t === "approach";
const isBackhandLike = (t: StrokeType) => t === "backhand";

function hit(value: number, watchAt: number, issueAt: number, higherIsWorse: boolean, m: Measurement, evidence: string): RuleHit | null {
  const bad = higherIsWorse ? value > watchAt : value < watchAt;
  if (!bad) return null;
  const severe = higherIsWorse ? value > issueAt : value < issueAt;
  return {
    severity: severe && confAtLeast(m.confidence, "medium") ? "issue" : "watch",
    confidence: m.confidence,
    evidence,
  };
}

const fmt = (m: Measurement) => `${m.value}${m.unit === "deg" ? "°" : m.unit === "s" ? " s" : m.unit === "%" ? "%" : ""}`;
const methodNote = (m: Measurement) =>
  m.method === "estimated_3d" ? " (3D model estimate)" : m.method === "measured_2d" ? " (2D image measurement)" : "";

export const RULES: RuleDef[] = [
  {
    id: "late_unit_turn",
    category: "preparation",
    appliesTo: isGround,
    needs: ["turn_ratio_at_load"],
    basePriority: "high",
    title: "Upper-body turn happens late",
    observation: "Most of your shoulder turn appears to happen during the forward swing rather than during the preparation.",
    whyItMatters: "A late turn compresses the swing into less time, which tends to make contact timing and direction less consistent.",
    adjustment: "Start turning your shoulders as soon as you recognise the ball's side, so the turn is mostly complete before the forward swing starts.",
    drillId: "early-unit-turn",
    cue: "Prepare earlier.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "turn_ratio_at_load");
      if (!m) return null;
      return hit(m.value, 50, 35, false, m, `Only ${fmt(m)} of the shoulder turn was complete when the backswing turned around${methodNote(m)}.`);
    },
  },
  {
    id: "limited_turn",
    category: "rotation",
    appliesTo: isGround,
    needs: ["shoulder_turn_deg"],
    basePriority: "medium",
    title: "Limited shoulder turn",
    observation: "Your shoulders appear to turn relatively little away from the ready position.",
    whyItMatters: "A fuller turn lets the body, not just the arm, produce the swing — usually more relaxed and repeatable.",
    adjustment: "Let your non-hitting shoulder rotate toward the side fence during preparation.",
    drillId: "early-unit-turn",
    cue: "Turn your shoulders more.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "shoulder_turn_deg");
      if (!m) return null;
      // 3D estimates are never allowed to produce a red "issue".
      const h = hit(m.value, 35, 20, false, m, `Estimated shoulder turn was about ${fmt(m)}${methodNote(m)}.`);
      return h ? { ...h, severity: "watch" } : null;
    },
  },
  {
    id: "straight_legs",
    category: "legs",
    appliesTo: (t) => isGround(t) || isServe(t),
    needs: ["min_knee_deg"],
    basePriority: "medium",
    title: "Little knee bend during loading",
    observation: "Your legs stay fairly straight while you load the stroke.",
    whyItMatters: "Bending the knees lowers your base for balance and lets the legs contribute to the swing.",
    adjustment: "Sink a little into your legs as you turn — think 'sit on a high stool' — then push up through the swing.",
    drillId: "loaded-legs",
    cue: "Try bending your knees more.",
    evaluate: (ms, t) => {
      const m = getMeasurement(ms, "min_knee_deg");
      if (!m) return null;
      const label = isServe(t) ? "before the serve's upward swing" : "during preparation and loading";
      return hit(m.value, 160, 168, true, m, `The most-bent knee only reached ${fmt(m)} ${label}${methodNote(m)}.`);
    },
  },
  {
    id: "finish_balance",
    category: "balance",
    appliesTo: () => true,
    needs: ["finish_head_offset", "finish_lean_deg"],
    basePriority: "high",
    title: "Off-balance finish",
    observation: "At the end of the swing your head and upper body drift away from your base of support.",
    whyItMatters: "Finishing off balance usually means balance was lost earlier in the swing, and it slows your recovery for the next ball.",
    adjustment: "Keep your head steady over your feet through contact and hold the finish for a moment.",
    drillId: "balanced-finish-hold",
    cue: "Maintain your balance.",
    evaluate: (ms) => {
      const head = getMeasurement(ms, "finish_head_offset");
      const lean = getMeasurement(ms, "finish_lean_deg");
      const a = head ? hit(head.value, 0.55, 0.8, true, head, `Head ended ${head.value} torso lengths from the centre of the feet${methodNote(head)}.`) : null;
      const b = lean ? hit(lean.value, 24, 32, true, lean, `Trunk leaned ${fmt(lean)} from vertical at the finish${methodNote(lean)}.`) : null;
      if (a && b) return { ...a, severity: a.severity === "issue" || b.severity === "issue" ? "issue" : "watch", evidence: `${a.evidence} ${b.evidence}` };
      return a ?? b;
    },
  },
  {
    id: "short_finish",
    category: "follow_through",
    appliesTo: (t) => isForehandLike(t) || isBackhandLike(t),
    needs: ["finish_side"],
    basePriority: "medium",
    title: "Follow-through stops short",
    observation: "The swing appears to stop before the racket travels fully across the body.",
    whyItMatters: "Decelerating early often starts before contact, which can cost control and depth.",
    adjustment: "Let the racket keep travelling after the hit until it finishes over the opposite shoulder (forehand) or high on the hitting side (backhand).",
    drillId: "full-finish",
    cue: "Finish your swing.",
    evaluate: (ms, t) => {
      const m = getMeasurement(ms, "finish_side");
      if (!m) return null;
      if (isForehandLike(t)) return hit(m.value, 0.15, 0.45, true, m, `Hitting hand finished ${m.value} shoulder widths on the hitting side${methodNote(m)}.`);
      return hit(m.value, -0.2, -0.5, false, m, `Hitting hand finished ${Math.abs(m.value)} shoulder widths across the body${methodNote(m)}.`);
    },
  },
  {
    id: "cramped_contact",
    category: "arm",
    appliesTo: (t) => t === "forehand",
    needs: ["elbow_at_contact_deg"],
    basePriority: "low",
    title: "Hitting arm looks cramped near contact",
    observation: "Around the estimated contact the hitting elbow is quite bent, which can indicate standing too close to the ball.",
    whyItMatters: "Good spacing lets you swing freely through the ball. (Contact is estimated; without a visible ball this is a hint, not a verdict.)",
    adjustment: "Use small adjustment steps so the ball is a comfortable arm-and-racket length away.",
    drillId: "spacing-drop-feed",
    cue: "Give yourself more space.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "elbow_at_contact_deg");
      if (!m) return null;
      const h = hit(m.value, 95, 75, false, m, `Elbow angle near the estimated contact was ${fmt(m)}${methodNote(m)}.`);
      return h ? { ...h, severity: "watch", confidence: "low" } : null;
    },
  },
  {
    id: "slow_recovery",
    category: "recovery",
    appliesTo: () => true,
    needs: ["recovery_s"],
    basePriority: "medium",
    title: "Slow return to ready position",
    observation: "After the finish it takes a while before you are settled and ready again.",
    whyItMatters: "Quick recovery puts you in position for the next ball and is a large part of match footwork.",
    adjustment: "Right after the finish, shuffle back toward your recovery spot and split-step as you arrive.",
    drillId: "recovery-shuffle",
    cue: "Recover to your ready position.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "recovery_s");
      if (!m) return null;
      return hit(m.value, 1.5, 2.2, true, m, `It took about ${fmt(m)} to settle after the finish.`);
    },
  },
  {
    id: "weight_stays_back",
    category: "balance",
    appliesTo: (t) => isForehandLike(t) || isBackhandLike(t),
    needs: ["com_shift"],
    basePriority: "low",
    title: "Little forward weight transfer",
    observation: "Your hip centre moves very little between loading and the finish.",
    whyItMatters: "Moving your weight into the shot helps you use your body rather than only the arm. (Open-stance shots legitimately move less.)",
    adjustment: "On neutral-stance balls, let your weight flow from the back foot onto the front foot through the swing.",
    drillId: "rotate-then-accelerate",
    cue: "Move into the shot.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "com_shift");
      if (!m) return null;
      const h = hit(m.value, 0.12, 0.05, false, m, `Hip centre travelled only ${m.value} torso lengths from loading to the finish${methodNote(m)}.`);
      return h ? { ...h, severity: "watch" } : null;
    },
  },
  {
    id: "trophy_elbow_low",
    category: "arm",
    appliesTo: isServe,
    needs: ["trophy_elbow_height"],
    basePriority: "medium",
    title: "Hitting elbow low in the loading position",
    observation: "At the loading (trophy) position your hitting elbow sits well below shoulder height.",
    whyItMatters: "A very low elbow can make the upward swing to the ball cramped and less fluid.",
    adjustment: "As you toss, lift the hitting elbow to around shoulder height before swinging up.",
    drillId: "serve-trophy-hold",
    cue: "Lift your hitting elbow.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "trophy_elbow_height");
      if (!m) return null;
      return hit(m.value, -0.35, -0.6, false, m, `Elbow was ${Math.abs(m.value)} torso lengths below the shoulder at loading${methodNote(m)}.`);
    },
  },
  {
    id: "toss_arm_drops",
    category: "serve_toss",
    appliesTo: isServe,
    needs: ["toss_arm_hold_s"],
    basePriority: "medium",
    title: "Tossing arm drops early",
    observation: "Your tossing arm comes down well before the swing reaches the ball.",
    whyItMatters: "Keeping the tossing arm up a little longer helps keep the shoulders tilted and the swing on line.",
    adjustment: "Keep the tossing arm pointing up until your hitting arm starts driving upward.",
    drillId: "toss-arm-hold",
    cue: "Keep your tossing arm up.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "toss_arm_hold_s");
      if (!m) return null;
      return hit(m.value, 0.55, 0.8, true, m, `Tossing arm was last raised ${fmt(m)} before the estimated contact.`);
    },
  },
  {
    id: "serve_reach",
    category: "arm",
    appliesTo: isServe,
    needs: ["contact_reach"],
    basePriority: "medium",
    title: "Contact point looks low",
    observation: "Near the estimated contact your hitting hand is not far above the shoulder.",
    whyItMatters: "Reaching up to the ball usually gives a higher, more reliable contact point.",
    adjustment: "Drive up through your legs and reach to contact with a long arm.",
    drillId: "reach-up-contact",
    cue: "Reach up to the ball.",
    evaluate: (ms) => {
      const m = getMeasurement(ms, "contact_reach");
      if (!m) return null;
      return hit(m.value, 0.9, 0.6, false, m, `Hitting hand was ${m.value} torso lengths above the shoulder near the estimated contact${methodNote(m)}.`);
    },
  },
];

export function getRule(id: string): RuleDef | undefined {
  return RULES.find((r) => r.id === id);
}

export interface StrokeRuleResult {
  ruleId: string;
  hit: RuleHit;
}

/** Evaluate all applicable rules on one stroke. */
export function evaluateStroke(s: StrokeForRules): StrokeRuleResult[] {
  const out: StrokeRuleResult[] = [];
  for (const r of RULES) {
    if (!r.appliesTo(s.type)) continue;
    const h = r.evaluate(s.metrics, s.type);
    if (h) out.push({ ruleId: r.id, hit: h });
  }
  return out;
}

const PRIORITY_W: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const CONF_W: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function findingScore(f: Pick<Finding, "priority" | "confidence" | "severity">): number {
  const sev = f.severity === "issue" ? 1.5 : f.severity === "watch" ? 1 : 0;
  return PRIORITY_W[f.priority] * CONF_W[f.confidence] * sev;
}

/** Sort findings for display: most consequential, most certain first. Insufficient/ok go last. */
export function prioritizeFindings<T extends Pick<Finding, "priority" | "confidence" | "severity">>(fs: T[]): T[] {
  return [...fs].sort((a, b) => findingScore(b) - findingScore(a));
}

let idSeq = 0;
const newId = () => `f_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

/**
 * Aggregate per-stroke rule hits into session findings. A pattern must appear in at least 40% of
 * the strokes where it could be assessed (and at least twice when 3+ strokes were assessed).
 */
export function aggregateFindings(strokes: StrokeForRules[]): Finding[] {
  const findings: Finding[] = [];
  for (const r of RULES) {
    const assessed = strokes.filter((s) => r.appliesTo(s.type) && r.needs.some((k) => getMeasurement(s.metrics, k)));
    if (!assessed.length) continue;
    const hits = assessed
      .map((s) => ({ s, h: r.evaluate(s.metrics, s.type) }))
      .filter((x): x is { s: StrokeForRules; h: RuleHit } => x.h !== null);
    const ratio = hits.length / assessed.length;
    const minHits = assessed.length >= 3 ? 2 : 1;

    if (hits.length >= minHits && ratio >= 0.4) {
      const confs = hits.map((x) => x.h.confidence);
      let confidence: Confidence = confs.filter((c) => c === "medium" || c === "high").length >= confs.length / 2 ? "medium" : "low";
      // Repeated, consistent evidence from a suitable view can justify "high".
      if (confidence === "medium" && assessed.length >= 6 && ratio >= 0.75) confidence = "high";
      const issues = hits.filter((x) => x.h.severity === "issue").length;
      const severity: Severity = issues / hits.length >= 0.5 && confidence !== "low" ? "issue" : "watch";
      const priority: Priority = ratio >= 0.7 ? r.basePriority : r.basePriority === "high" ? "medium" : "low";
      const first = hits[0].s;
      findings.push({
        id: newId(),
        source: "local",
        ruleId: r.id,
        category: r.category,
        title: r.title,
        observation: r.observation,
        evidence: [
          `Seen in ${hits.length} of ${assessed.length} assessed ${assessed.length === 1 ? "stroke" : "strokes"}.`,
          ...hits.slice(0, 3).map((x) => `${formatTime(x.s.contactT)} — ${x.h.evidence}`),
        ],
        whyItMatters: r.whyItMatters,
        adjustment: r.adjustment,
        drillId: r.drillId,
        priority,
        confidence,
        severity,
        strokeIds: hits.map((x) => x.s.id),
        // jump target: shortly before the first affected swing, not the start of its ready phase
        t0: Math.max(first.t0, first.contactT - 900),
        t1: first.t1,
        cue: r.cue,
      });
    } else if (assessed.length >= 2) {
      // Assessed and looked fine: report as an acceptable (green) observation.
      findings.push({
        id: newId(),
        source: "local",
        ruleId: r.id,
        category: r.category,
        title: okTitle(r.id),
        observation: `No consistent sign of: ${r.title.toLowerCase()}.`,
        evidence: [`Checked on ${assessed.length} strokes; flagged on ${hits.length}.`],
        whyItMatters: r.whyItMatters,
        adjustment: "Keep doing what you're doing here.",
        drillId: null,
        priority: "low",
        confidence: assessed.length >= 4 ? "medium" : "low",
        severity: "ok",
        strokeIds: assessed.map((s) => s.id),
        t0: null,
        t1: null,
      });
    }
  }

  // Session-level consistency of preparation timing, per stroke type.
  const byType = new Map<StrokeType, StrokeForRules[]>();
  for (const s of strokes) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  for (const [type, list] of byType) {
    const vals = list.map((s) => getMeasurement(s.metrics, "prep_to_contact_s")?.value).filter((v): v is number => v !== undefined);
    if (vals.length < 5 || type === "unknown") continue;
    const c = coeffVar(vals);
    if (!Number.isFinite(c)) continue;
    const label = type.replace("_", " ");
    findings.push({
      id: newId(),
      source: "local",
      ruleId: "prep_consistency",
      category: "consistency",
      title: c > 0.3 ? `Preparation timing varies between ${label}s` : `Consistent preparation timing on ${label}s`,
      observation:
        c > 0.3
          ? `The time from starting your preparation to the estimated contact varied noticeably across ${vals.length} ${label}s.`
          : `Your preparation timing was similar across ${vals.length} ${label}s.`,
      evidence: [`Coefficient of variation ${round(c * 100, 0)}% (range ${round(Math.min(...vals), 2)}–${round(Math.max(...vals), 2)} s).`],
      whyItMatters: "A repeatable preparation rhythm is one of the foundations of consistent contact.",
      adjustment: c > 0.3 ? "Use a simple rhythm cue — 'turn, set, hit' — so each swing starts the same way." : "Keep the same rhythm as you add pace.",
      drillId: c > 0.3 ? "rhythm-metronome" : null,
      priority: c > 0.3 ? "medium" : "low",
      confidence: vals.length >= 8 ? "medium" : "low",
      severity: c > 0.3 ? "watch" : "ok",
      strokeIds: list.map((s) => s.id),
      t0: null,
      t1: null,
    });
  }
  return prioritizeFindings(findings);
}

function okTitle(ruleId: string): string {
  const map: Record<string, string> = {
    late_unit_turn: "Turn completed in good time",
    limited_turn: "Healthy shoulder turn",
    straight_legs: "Good use of the legs",
    finish_balance: "Balanced finishes",
    short_finish: "Complete follow-through",
    cramped_contact: "Comfortable arm extension near contact",
    slow_recovery: "Quick recovery",
    weight_stays_back: "Weight moves into the shot",
    trophy_elbow_low: "Solid loading position",
    toss_arm_drops: "Tossing arm stays up",
    serve_reach: "Reaching up to contact",
  };
  return map[ruleId] ?? "Looks fine";
}

export function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${rest}`;
}
