// Storage abstraction. Guest mode keeps everything on this device (IndexedDB). Signed-in mode
// keeps records in Supabase (protected by Row Level Security) and media on the device, with
// recordings uploaded to private cloud storage only when the user opts in.

import type {
  AnalysisJob, Conversation, DrillLog, Favorite, Goal, KeyFrame, Profile, SessionRecord, Settings, TrainingPlan,
} from "./types";

export interface DataStore {
  readonly kind: "local" | "cloud";

  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;

  listSessions(): Promise<SessionRecord[]>;
  getSession(id: string): Promise<SessionRecord | null>;
  saveSession(s: SessionRecord): Promise<void>;
  deleteSession(id: string): Promise<void>;

  listPlans(): Promise<TrainingPlan[]>;
  savePlan(p: TrainingPlan): Promise<void>;
  deletePlan(id: string): Promise<void>;

  listDrillLogs(): Promise<DrillLog[]>;
  addDrillLog(l: DrillLog): Promise<void>;
  deleteDrillLog(id: string): Promise<void>;

  listGoals(): Promise<Goal[]>;
  saveGoal(g: Goal): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(c: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;

  listFavorites(): Promise<Favorite[]>;
  toggleFavorite(f: Omit<Favorite, "id" | "createdAt">): Promise<boolean>;

  listJobs(): Promise<AnalysisJob[]>;
  saveJob(j: AnalysisJob): Promise<void>;

  // media
  putRecording(sessionId: string, blob: Blob): Promise<void>;
  getRecording(sessionId: string): Promise<Blob | null>;
  deleteRecording(sessionId: string): Promise<void>;
  putTrace(sessionId: string, buf: ArrayBuffer): Promise<void>;
  getTrace(sessionId: string): Promise<ArrayBuffer | null>;
  putKeyFrames(sessionId: string, strokeId: string, frames: KeyFrame[]): Promise<void>;
  getKeyFrames(sessionId: string, strokeId: string): Promise<KeyFrame[]>;

  exportAll(): Promise<Record<string, unknown>>;
  clearAll(): Promise<void>;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notify UI hooks that stored data changed. */
export function emitChange(): void {
  for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function uid(prefix = ""): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${rnd}` : rnd;
}
