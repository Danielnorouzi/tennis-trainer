// Zod schemas for every AI request and response. Response schemas are used both to constrain the
// model (Structured Outputs via zodTextFormat) and to re-validate the result server-side.
//
// Structured Outputs requires every property to be present, so optional values are `nullable`
// rather than `optional`. Length limits are enforced after parsing (see ai/postprocess.ts).

import { z } from "zod";
import { CAMERA_VIEWS, CATEGORIES, CONFIDENCE, PHASES, PRIORITY, STROKE_TYPES } from "../tennis/types";

const confidence = z.enum(CONFIDENCE);
const priority = z.enum(PRIORITY);
const category = z.enum(CATEGORIES);

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

export const ObservationSchema = z.object({
  id: z.string().describe("Short unique id, e.g. obs1"),
  category,
  strokeIds: z.array(z.string()).describe("IDs of strokes (from the input) this observation is based on"),
  finding: z.string().describe("What the player is doing, in plain language"),
  evidence: z.array(z.string()).describe("Concrete visual evidence or input measurements supporting the finding"),
  evidenceType: z.enum(["visual", "measurement", "both"]),
  whyItMatters: z.string(),
  improvement: z.string().describe("Specific, practical adjustment"),
  drillId: z.string().nullable().describe("A drill id from the provided library, or null"),
  priority,
  confidence,
  timestampStart: z.number().nullable().describe("Seconds from session start, or null"),
  timestampEnd: z.number().nullable(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const CoachingReportSchema = z.object({
  summary: z.string().describe("2–4 sentence natural-language summary of the session"),
  whatWentWell: z.array(z.string()),
  observations: z.array(ObservationSchema),
  topPriorities: z
    .array(z.object({ observationId: z.string(), title: z.string(), cue: z.string().describe("A short cue to remember") }))
    .describe("At most three, most valuable first"),
  categoryNotes: z.array(
    z.object({
      category: z.enum(["preparation", "balance", "timing", "rotation", "footwork", "follow_through", "recovery", "consistency"]),
      assessable: z.boolean(),
      note: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
  inconclusive: z.array(z.string()).describe("Things that could not be assessed from this footage"),
  recommendedNextSteps: z.array(z.string()),
});
export type CoachingReport = z.infer<typeof CoachingReportSchema>;

export const ComparisonSchema = z.object({
  summary: z.string(),
  differences: z.array(
    z.object({
      aspect: z.string(),
      first: z.string(),
      second: z.string(),
      assessment: z.enum(["improved", "regressed", "similar", "not_comparable"]),
      confidence,
      evidence: z.string(),
    }),
  ),
  caveats: z.array(z.string()),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const ChatAnswerSchema = z.object({
  answer: z.string().describe("Concise answer, 1–4 sentences"),
  details: z.string().nullable().describe("Optional longer explanation"),
  references: z.array(
    z.object({
      sessionId: z.string(),
      strokeId: z.string().nullable(),
      timestamp: z.number().nullable().describe("Seconds into the session recording"),
      label: z.string(),
    }),
  ),
  followUps: z.array(z.string()).describe("Up to three suggested follow-up questions"),
  usedSessionData: z.boolean().describe("True only if the answer is based on the provided session data"),
});
export type ChatAnswer = z.infer<typeof ChatAnswerSchema>;

export const PlanSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  weeklyGoals: z.array(z.string()),
  days: z.array(
    z.object({
      day: z.string(),
      focus: z.string(),
      warmup: z.string(),
      drillIds: z.array(z.string()),
      notes: z.string(),
    }),
  ),
});
export type PlanResponse = z.infer<typeof PlanSchema>;

// ---------------------------------------------------------------------------------------------
// Requests (untrusted input from the browser — strictly bounded)
// ---------------------------------------------------------------------------------------------

const MAX_IMAGE_CHARS = 400_000; // ~300 KB of base64 JPEG
const dataUrl = z
  .string()
  .max(MAX_IMAGE_CHARS)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Frames must be base64 JPEG/PNG/WebP data URLs");

export const MeasurementInput = z.object({
  key: z.string().max(64),
  label: z.string().max(160),
  value: z.number().finite(),
  unit: z.string().max(16),
  confidence,
  method: z.enum(["measured_2d", "estimated_3d", "derived"]),
});

export const StrokeInput = z.object({
  id: z.string().max(64),
  type: z.enum(STROKE_TYPES),
  typeSource: z.enum(["auto", "manual", "user_corrected"]),
  typeConfidence: confidence,
  t0: z.number(),
  t1: z.number(),
  contactT: z.number(),
  quality: confidence,
  phases: z.array(z.object({ name: z.enum(PHASES), start: z.number(), end: z.number(), estimated: z.boolean() })).max(10),
  metrics: z.array(MeasurementInput).max(40),
  frames: z.array(z.object({ t: z.number(), phase: z.string().max(32), image: dataUrl })).max(6),
});
export type StrokeInputT = z.infer<typeof StrokeInput>;

export const FindingInput = z.object({
  title: z.string().max(200),
  category,
  severity: z.enum(["ok", "watch", "issue", "insufficient"]),
  confidence,
  evidence: z.array(z.string().max(400)).max(6),
  strokeIds: z.array(z.string().max(64)).max(60),
});

export const PlayerInput = z.object({
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  handedness: z.enum(["right", "left"]),
  backhand: z.enum(["one", "two"]),
  goals: z.array(z.string().max(120)).max(10),
  challenges: z.array(z.string().max(120)).max(10),
});

export const AnalyzeRequestSchema = z.object({
  sessionId: z.string().max(64),
  player: PlayerInput,
  selection: z.string().max(32),
  cameraView: z.enum(CAMERA_VIEWS),
  durationSec: z.number().min(0).max(4 * 3600),
  trackedFraction: z.number().min(0).max(1),
  strokes: z.array(StrokeInput).max(16),
  localFindings: z.array(FindingInput).max(40),
  limitations: z.array(z.string().max(300)).max(12),
  previousObjectives: z.array(z.string().max(200)).max(6),
  previousSummary: z.string().max(1500).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const CompareRequestSchema = z.object({
  player: PlayerInput,
  first: z.object({ sessionId: z.string().max(64), cameraView: z.enum(CAMERA_VIEWS), stroke: StrokeInput, date: z.string().max(40) }),
  second: z.object({ sessionId: z.string().max(64), cameraView: z.enum(CAMERA_VIEWS), stroke: StrokeInput, date: z.string().max(40) }),
  comparableKeys: z.array(z.string().max(64)).max(40),
});
export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export const ChatRequestSchema = z.object({
  player: PlayerInput,
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(20),
  context: z.object({
    sessions: z
      .array(
        z.object({
          id: z.string().max(64),
          date: z.string().max(40),
          title: z.string().max(120),
          selection: z.string().max(32),
          cameraView: z.enum(CAMERA_VIEWS),
          strokeCounts: z.record(z.string(), z.number()),
          summary: z.string().max(1500).nullable(),
          findings: z
            .array(
              z.object({
                title: z.string().max(200),
                severity: z.string().max(16),
                confidence,
                strokeIds: z.array(z.string().max(64)).max(10),
                t: z.number().nullable(),
              }),
            )
            .max(15),
          keyMetrics: z.array(z.object({ key: z.string().max(64), label: z.string().max(160), median: z.number(), unit: z.string().max(16), n: z.number() })).max(20),
        }),
      )
      .max(12),
    goals: z.array(z.string().max(200)).max(10),
    drillLog: z.array(z.object({ drillId: z.string().max(64), date: z.string().max(40) })).max(30),
  }),
  detailed: z.boolean(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const PlanRequestSchema = z.object({
  player: PlayerInput.extend({
    frequency: z.string().max(32),
    environment: z.enum(["court", "home", "both"]),
    withBall: z.boolean(),
    equipment: z.array(z.string().max(60)).max(10),
  }),
  recurringFindings: z
    .array(z.object({ title: z.string().max(200), category, count: z.number(), confidence }))
    .max(12),
  completedDrills: z.array(z.string().max(64)).max(40),
  goals: z.array(z.string().max(200)).max(10),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
