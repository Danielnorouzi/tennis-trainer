// Tunable thresholds for the on-device analysis. Kept in one place so they can be reviewed and
// adjusted against real footage without touching the algorithms.

export const SEGMENT = {
  /** dominant-wrist speed (torso lengths / s) that marks a swing peak. Shadow swings reach ~5–9, full swings 10+. */
  peakSpeed: 4.0,
  /** speed above which the arm is considered "moving" */
  activeSpeed: 1.4,
  /** lower threshold used to find the start of slow preparation (unit turn) */
  prepSpeed: 0.8,
  /** speed considered "settled" for recovery */
  restSpeed: 0.7,
  /** two swing peaks closer than this are one stroke */
  minGapMs: 900,
  maxPrepMs: 1600,
  maxFollowMs: 1200,
  maxRecoveryMs: 1800,
  readyLeadMs: 600,
  /** half width of the estimated contact window around the speed peak */
  contactHalfMs: 50,
  /** how long the hip centre must stay still to count as recovered */
  settleMs: 300,
  /** a stroke needs at least this fraction of valid frames in its window */
  minValidFraction: 0.6,
} as const;

export const QUALITY = {
  minOverallVisibility: 0.6,
  minFeetVisibility: 0.5,
  minArmsVisibility: 0.55,
  /** body height as a fraction of frame height */
  minBodyHeight: 0.35,
  maxBodyHeight: 0.92,
  /** mean frame luminance (0–255) below which tracking degrades */
  minLuma: 55,
  /** mean absolute thumbnail difference outside the player box (0–255) that suggests a moving camera */
  maxBackgroundMotion: 9,
} as const;

export const CUES = {
  /** never repeat the same cue within this window */
  perCueCooldownMs: 25_000,
  /** minimum gap between any two spoken/visual major cues */
  globalCooldownMs: 7_000,
  /** after a cue has been given this many times, back off much further */
  repeatLimit: 2,
  repeatBackoffMs: 90_000,
  /** a tracking-quality problem must persist this long before it is mentioned */
  qualityPersistMs: 2_500,
} as const;

/** Which camera views make a measurement family trustworthy. */
export const VIEW_SUITABILITY = {
  knee: { side: "medium", diagonal: "medium", front: "low", rear: "low" },
  elbow: { side: "medium", diagonal: "medium", front: "low", rear: "low" },
  rotation: { side: "low", diagonal: "medium", front: "medium", rear: "medium" },
  lean: { side: "medium", diagonal: "medium", front: "medium", rear: "medium" },
  finish: { side: "medium", diagonal: "medium", front: "medium", rear: "medium" },
  timing: { side: "medium", diagonal: "medium", front: "medium", rear: "medium" },
  stance: { side: "low", diagonal: "medium", front: "medium", rear: "medium" },
  weight: { side: "medium", diagonal: "low", front: "low", rear: "low" },
  trophy: { side: "medium", diagonal: "medium", front: "medium", rear: "low" },
} as const;
export type MetricFamily = keyof typeof VIEW_SUITABILITY;
