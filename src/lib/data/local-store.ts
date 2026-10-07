"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DataStore } from "./store";
import { emitChange, uid } from "./store";
import {
  DEFAULT_SETTINGS,
  type AnalysisJob, type Conversation, type DrillLog, type Favorite, type Goal, type KeyFrame, type Profile, type SessionRecord,
  type Settings, type TrainingPlan,
} from "./types";

interface RallyDB extends DBSchema {
  kv: { key: string; value: unknown };
  sessions: { key: string; value: SessionRecord; indexes: { byCreated: number } };
  plans: { key: string; value: TrainingPlan };
  drillLogs: { key: string; value: DrillLog };
  goals: { key: string; value: Goal };
  conversations: { key: string; value: Conversation };
  favorites: { key: string; value: Favorite };
  jobs: { key: string; value: AnalysisJob };
  media: { key: string; value: Blob | ArrayBuffer | KeyFrame[] };
}

const DB_NAME = "rally-ai";

/** IndexedDB store. Media keys: `rec:<sessionId>`, `trace:<sessionId>`, `kf:<sessionId>:<strokeId>`. */
export class LocalStore implements DataStore {
  readonly kind: "local" | "cloud" = "local";
  private dbp: Promise<IDBPDatabase<RallyDB>>;

  constructor(name = DB_NAME) {
    this.dbp = openDB<RallyDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore("kv");
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("byCreated", "createdAt");
        db.createObjectStore("plans", { keyPath: "id" });
        db.createObjectStore("drillLogs", { keyPath: "id" });
        db.createObjectStore("goals", { keyPath: "id" });
        db.createObjectStore("conversations", { keyPath: "id" });
        db.createObjectStore("favorites", { keyPath: "id" });
        db.createObjectStore("jobs", { keyPath: "id" });
        db.createObjectStore("media");
      },
    });
  }

  protected async db() {
    return this.dbp;
  }

  async getProfile(): Promise<Profile | null> {
    return ((await (await this.db()).get("kv", "profile")) as Profile | undefined) ?? null;
  }
  async saveProfile(p: Profile): Promise<void> {
    await (await this.db()).put("kv", p, "profile");
    emitChange();
  }
  async getSettings(): Promise<Settings> {
    const s = (await (await this.db()).get("kv", "settings")) as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  }
  async saveSettings(s: Settings): Promise<void> {
    await (await this.db()).put("kv", s, "settings");
    emitChange();
  }

  async listSessions(): Promise<SessionRecord[]> {
    const all = await (await this.db()).getAllFromIndex("sessions", "byCreated");
    return all.reverse();
  }
  async getSession(id: string): Promise<SessionRecord | null> {
    return (await (await this.db()).get("sessions", id)) ?? null;
  }
  async saveSession(s: SessionRecord): Promise<void> {
    await (await this.db()).put("sessions", s);
    emitChange();
  }
  async deleteSession(id: string): Promise<void> {
    const db = await this.db();
    const s = await db.get("sessions", id);
    const tx = db.transaction(["sessions", "media", "jobs"], "readwrite");
    await tx.objectStore("sessions").delete(id);
    await tx.objectStore("media").delete(`rec:${id}`);
    await tx.objectStore("media").delete(`trace:${id}`);
    for (const st of s?.strokes ?? []) await tx.objectStore("media").delete(`kf:${id}:${st.id}`);
    for (const j of await tx.objectStore("jobs").getAll()) if (j.sessionId === id) await tx.objectStore("jobs").delete(j.id);
    await tx.done;
    emitChange();
  }

  async listPlans() {
    return (await (await this.db()).getAll("plans")).sort((a, b) => b.createdAt - a.createdAt);
  }
  async savePlan(p: TrainingPlan) {
    const db = await this.db();
    if (p.active) for (const o of await db.getAll("plans")) if (o.id !== p.id && o.active) await db.put("plans", { ...o, active: false });
    await db.put("plans", p);
    emitChange();
  }
  async deletePlan(id: string) {
    await (await this.db()).delete("plans", id);
    emitChange();
  }

  async listDrillLogs() {
    return (await (await this.db()).getAll("drillLogs")).sort((a, b) => b.completedAt - a.completedAt);
  }
  async addDrillLog(l: DrillLog) {
    await (await this.db()).put("drillLogs", l);
    emitChange();
  }
  async deleteDrillLog(id: string) {
    await (await this.db()).delete("drillLogs", id);
    emitChange();
  }

  async listGoals() {
    return (await (await this.db()).getAll("goals")).sort((a, b) => b.createdAt - a.createdAt);
  }
  async saveGoal(g: Goal) {
    await (await this.db()).put("goals", g);
    emitChange();
  }
  async deleteGoal(id: string) {
    await (await this.db()).delete("goals", id);
    emitChange();
  }

  async listConversations() {
    return (await (await this.db()).getAll("conversations")).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getConversation(id: string) {
    return (await (await this.db()).get("conversations", id)) ?? null;
  }
  async saveConversation(c: Conversation) {
    await (await this.db()).put("conversations", c);
    emitChange();
  }
  async deleteConversation(id: string) {
    await (await this.db()).delete("conversations", id);
    emitChange();
  }

  async listFavorites() {
    return (await (await this.db()).getAll("favorites")).sort((a, b) => b.createdAt - a.createdAt);
  }
  async toggleFavorite(f: Omit<Favorite, "id" | "createdAt">): Promise<boolean> {
    const db = await this.db();
    const existing = (await db.getAll("favorites")).find((x) => x.kind === f.kind && x.refId === f.refId);
    if (existing) await db.delete("favorites", existing.id);
    else await db.put("favorites", { ...f, id: uid("fav"), createdAt: Date.now() });
    emitChange();
    return !existing;
  }

  async listJobs() {
    return (await (await this.db()).getAll("jobs")).sort((a, b) => a.createdAt - b.createdAt);
  }
  async saveJob(j: AnalysisJob) {
    await (await this.db()).put("jobs", j);
    emitChange();
  }

  async putRecording(sessionId: string, blob: Blob) {
    await (await this.db()).put("media", blob, `rec:${sessionId}`);
  }
  async getRecording(sessionId: string) {
    const v = await (await this.db()).get("media", `rec:${sessionId}`);
    return v instanceof Blob ? v : null;
  }
  async deleteRecording(sessionId: string) {
    await (await this.db()).delete("media", `rec:${sessionId}`);
    emitChange();
  }
  async putTrace(sessionId: string, buf: ArrayBuffer) {
    await (await this.db()).put("media", buf, `trace:${sessionId}`);
  }
  async getTrace(sessionId: string) {
    const v = await (await this.db()).get("media", `trace:${sessionId}`);
    return v instanceof ArrayBuffer ? v : null;
  }
  async putKeyFrames(sessionId: string, strokeId: string, frames: KeyFrame[]) {
    await (await this.db()).put("media", frames, `kf:${sessionId}:${strokeId}`);
  }
  async getKeyFrames(sessionId: string, strokeId: string) {
    const v = await (await this.db()).get("media", `kf:${sessionId}:${strokeId}`);
    return Array.isArray(v) ? v : [];
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const db = await this.db();
    return {
      exportedAt: new Date().toISOString(),
      storage: this.kind,
      profile: await this.getProfile(),
      settings: await this.getSettings(),
      sessions: await db.getAll("sessions"),
      plans: await db.getAll("plans"),
      drillLogs: await db.getAll("drillLogs"),
      goals: await db.getAll("goals"),
      conversations: await db.getAll("conversations"),
      favorites: await db.getAll("favorites"),
      note: "Recordings and pose traces are not included in this JSON export; download recordings individually from each session.",
    };
  }

  async clearAll(): Promise<void> {
    const db = await this.db();
    for (const name of ["kv", "sessions", "plans", "drillLogs", "goals", "conversations", "favorites", "jobs", "media"] as const) {
      await db.clear(name);
    }
    emitChange();
  }
}
