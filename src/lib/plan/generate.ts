// Deterministic, on-device training plan. Used when AI planning is unavailable and as the
// default; the AI planner can refine it. Picks drills from recurring credible findings, the
// player's goals, environment and equipment, and adapts difficulty to experience.

import { DRILLS, type Drill } from "../tennis/drills";
import type { Category, Experience } from "../tennis/types";
import type { Profile, TrainingPlan } from "../data/types";
import { uid } from "../data/store";

const LEVEL: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export interface RecurringInput {
  category: string;
  count: number;
  confidence: "low" | "medium" | "high";
  drillId: string | null;
  title: string;
}

function suitable(d: Drill, p: Profile): boolean {
  if (d.needsBall && !p.withBall) return false;
  if (d.needsCourt && p.environment === "home") return false;
  return LEVEL[d.difficulty] <= LEVEL[p.experience] + 1;
}

/** Score drills: recurring findings weigh most, then goals, then preferred strokes. */
export function rankDrills(p: Profile, recurring: RecurringInput[], completedIds: string[] = []): Drill[] {
  const goalText = [...p.goals, ...p.challenges].join(" ").toLowerCase();
  const scores = new Map<string, number>();
  for (const d of DRILLS) {
    if (!suitable(d, p) || d.category === "warmup") continue;
    let s = 0;
    for (const r of recurring) {
      const w = r.count * (r.confidence === "high" ? 3 : r.confidence === "medium" ? 2 : 0.5);
      if (r.drillId === d.id) s += 3 * w;
      if (d.focus.includes(r.category as Category)) s += w;
    }
    for (const f of d.focus) if (goalText.includes(f.replace("_", " ")) || goalText.includes(f)) s += 2;
    if (goalText.includes("serve") && d.category === "serve") s += 2;
    if (goalText.includes("footwork") && d.category === "footwork") s += 2;
    if (p.preferredStrokes.includes("serve") && d.category === "serve") s += 1;
    // gentle variety: slightly prefer drills not done recently
    if (!completedIds.includes(d.id)) s += 0.3;
    scores.set(d.id, s);
  }
  return DRILLS.filter((d) => scores.has(d.id)).sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TRAINING_DAYS: Record<Profile["frequency"], number[]> = {
  occasional: [2, 5],
  weekly: [1, 3, 5],
  "2-3_per_week": [0, 2, 4],
  "4+_per_week": [0, 1, 3, 4, 5],
};

export function generateLocalPlan(p: Profile, recurring: RecurringInput[], completedIds: string[] = []): TrainingPlan {
  const ranked = rankDrills(p, recurring, completedIds);
  const top = recurring.filter((r) => r.confidence !== "low").slice(0, 3);
  const days = TRAINING_DAYS[p.frequency].map((dayIdx, i) => {
    // rotate through the top drills, always include one focus drill + one supporting drill
    const a = ranked[i % Math.max(1, Math.min(3, ranked.length))];
    const b = ranked[(i + 3) % Math.max(1, ranked.length)];
    const ids = [...new Set([a?.id, b?.id].filter(Boolean) as string[])];
    const focus = a ? a.focus[0].replace("_", " ") : "general technique";
    return {
      day: DAYS[dayIdx],
      focus: focus.charAt(0).toUpperCase() + focus.slice(1),
      warmup: "dynamic-warmup",
      drillIds: ids,
      notes: i === 0 && top[0] ? `Main focus this week: ${top[0].title.toLowerCase()}.` : "Finish with a short recorded set so you can track progress.",
    };
  });
  return {
    id: uid("plan"),
    createdAt: Date.now(),
    source: "local",
    title: top[0] ? `Focus: ${top[0].title}` : "Foundation week",
    rationale: top.length
      ? `Built from what Rally AI saw repeatedly in your recent sessions (${top.map((t) => t.title.toLowerCase()).join("; ")}), adjusted for your ${p.experience} level and ${p.environment === "home" ? "home" : "court"} setup.`
      : "Not enough recorded sessions yet to personalise — this plan covers preparation, balance and recovery fundamentals. Record a few sessions to tailor it.",
    weeklyGoals: top.length ? top.map((t) => `Work on: ${t.title.toLowerCase()}`) : ["Record two sessions", "Complete three drills", "Try both forehand and backhand"],
    days,
    active: true,
  };
}
