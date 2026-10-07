// Persisted entities. The same shapes are stored locally (IndexedDB, guest mode) and in Supabase
// (signed-in mode). Media (recordings, pose traces, key frames) is stored separately from records.

import type {
  BackhandStyle, CameraView, Category, Confidence, Experience, Finding, Handedness, Measurement, Phase,
  SessionStrokeSelection, Severity, StrokeType,
} from "../tennis/types";
import type { CoachingReport } from "../ai/schemas";

export type VoiceMode = "quiet" | "training" | "coach" | "review";
export type RecordingRetention = "keep" | "delete_after_analysis" | "never_record";
export type ThemePref = "system" | "light" | "dark";

export interface Profile {
  id: string;
  name: string;
  experience: Experience;
  handedness: Handedness;
  backhand: BackhandStyle;
  frequency: "occasional" | "weekly" | "2-3_per_week" | "4+_per_week";
  goals: string[];
  preferredStrokes: StrokeType[];
  challenges: string[];
  equipment: string[];
  environment: "court" | "home" | "both";
  withBall: boolean;
  onboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  theme: ThemePref;
  reducedTransparency: boolean;
  voiceMode: VoiceMode;
  mutedCueCategories: string[];
  retention: RecordingRetention;
  /** opt-in: upload recordings to private cloud storage (signed-in only) */
  cloudVideo: boolean;
  /** opt-in: send sampled key frames (not full video) to OpenAI for coaching analysis */
  aiFrames: boolean;
  /** automatically request the AI report when a session ends */
  autoAnalyze: boolean;
  analysisDetail: "low" | "high";
  showSkeleton: boolean;
  showAngles: boolean;
  defaultView: CameraView;
  /** delete sessions older than N days (0 = keep forever) */
  retentionDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  reducedTransparency: false,
  voiceMode: "training",
  mutedCueCategories: [],
  retention: "keep",
  cloudVideo: false,
  aiFrames: true,
  autoAnalyze: true,
  analysisDetail: "low",
  showSkeleton: true,
  showAngles: true,
  defaultView: "side",
  retentionDays: 0,
};

export interface StrokeRecord {
  id: string;
  index: number;
  type: StrokeType;
  typeSource: "auto" | "manual" | "user_corrected";
  typeConfidence: Confidence;
  typeReasons: string[];
  t0: number;
  t1: number;
  contactT: number;
  phases: Phase[];
  metrics: Measurement[];
  quality: Confidence;
  visibility: number;
  recoveryObserved: boolean;
  /** user marked this detection as wrong / not a stroke */
  excluded: boolean;
  /** timestamps of key frames held in media storage */
  keyFrameTimes: number[];
}

export type AnalysisStatus = "none" | "local" | "queued" | "running" | "complete" | "failed" | "unavailable" | "cancelled";

export interface LocalReport {
  generatedAt: number;
  findings: Finding[];
  scores: CategoryScore[];
  limitations: string[];
  sessionMetrics: Measurement[];
}

export interface CategoryScore {
  category: string;
  /** heuristic 0–100, null when the category could not be assessed */
  score: number | null;
  severity: Severity;
  basis: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  source: "live" | "upload";
  mode: "standard" | "shadow" | "drill" | "focus";
  selection: SessionStrokeSelection;
  cameraView: CameraView;
  handedness: Handedness;
  mirrored: boolean;
  focus: Category | null;
  drillId: string | null;
  status: "recording" | "processing" | "complete" | "failed" | "interrupted";
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  hasRecording: boolean;
  recordingMime: string | null;
  recordingCloudPath: string | null;
  videoSize: { w: number; h: number } | null;
  trackedFraction: number;
  avgVisibility: number;
  strokes: StrokeRecord[];
  localReport: LocalReport | null;
  report: CoachingReport | null;
  reportMeta: { model: string; mode: "live" | "fixture"; createdAt: number } | null;
  selectedGoal: string | null;
  notes: string;
  favorite: boolean;
  liveCues: { t: number; text: string; category: string }[];
}

export interface TrainingPlan {
  id: string;
  createdAt: number;
  source: "local" | "ai";
  title: string;
  rationale: string;
  weeklyGoals: string[];
  days: { day: string; focus: string; warmup: string; drillIds: string[]; notes: string }[];
  active: boolean;
}

export interface DrillLog {
  id: string;
  drillId: string;
  completedAt: number;
  reps: number | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  notes: string;
  sessionId: string | null;
}

export interface Goal {
  id: string;
  createdAt: number;
  title: string;
  category: Category;
  /** optional measurement key tracked for this goal */
  metricKey: string | null;
  strokeType: StrokeType | null;
  active: boolean;
  notes: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  details?: string | null;
  references?: { sessionId: string; strokeId: string | null; timestamp: number | null; label: string }[];
  followUps?: string[];
  at: number;
  mode?: "live" | "fixture";
}

export interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  messages: ChatMessage[];
  sessionIds: string[];
}

export interface Favorite {
  id: string;
  kind: "drill" | "session" | "finding";
  refId: string;
  createdAt: number;
  label: string;
}

export interface AnalysisJob {
  id: string;
  sessionId: string;
  kind: "session_report";
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  attempts: number;
  createdAt: number;
  updatedAt: number;
  error: string | null;
}

export interface KeyFrame {
  t: number;
  phase: string;
  /** JPEG data URL */
  dataUrl: string;
}
