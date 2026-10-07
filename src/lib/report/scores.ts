// Heuristic category assessments. These are coaching heuristics derived from the local findings —
// NOT validated performance ratings — and a category without assessable evidence gets no number.

import type { CategoryScore } from "../data/types";
import type { Finding, ScoreCategory, Severity } from "../tennis/types";
import { SCORE_CATEGORIES } from "../tennis/types";

/** Map rule categories onto the eight report categories. */
const MAP: Record<string, ScoreCategory> = {
  preparation: "preparation",
  balance: "balance",
  timing: "timing",
  rotation: "rotation",
  footwork: "footwork",
  follow_through: "follow_through",
  recovery: "recovery",
  consistency: "consistency",
  legs: "balance",
  arm: "timing",
  serve_toss: "consistency",
};

const CONF_FACTOR = { low: 0.4, medium: 0.75, high: 1 } as const;

export function categoryScores(findings: Finding[]): CategoryScore[] {
  return SCORE_CATEGORIES.map((cat) => {
    const relevant = findings.filter((f) => MAP[f.category] === cat && f.severity !== "insufficient");
    if (!relevant.length) {
      return { category: cat, score: null, severity: "insufficient" as Severity, basis: "Not enough evidence in this session." };
    }
    let score = 100;
    for (const f of relevant) {
      if (f.severity === "issue") score -= 30 * CONF_FACTOR[f.confidence];
      else if (f.severity === "watch") score -= 15 * CONF_FACTOR[f.confidence];
    }
    score = Math.max(30, Math.round(score));
    const worst: Severity = relevant.some((f) => f.severity === "issue")
      ? "issue"
      : relevant.some((f) => f.severity === "watch")
        ? "watch"
        : "ok";
    const okCount = relevant.filter((f) => f.severity === "ok").length;
    const flagged = relevant.length - okCount;
    return {
      category: cat,
      score,
      severity: worst,
      basis: `${relevant.length} check${relevant.length === 1 ? "" : "s"} · ${flagged} flagged`,
    };
  });
}
