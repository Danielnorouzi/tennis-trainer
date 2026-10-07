"use client";

// Signed-in storage: records live in Supabase Postgres (normalised tables, RLS-protected).
// Media stays in this browser's IndexedDB (inherited from LocalStore); recordings are additionally
// uploaded to the private `recordings` bucket only when the user has opted in to cloud video.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore } from "./local-store";
import { emitChange, uid } from "./store";
import {
  DEFAULT_SETTINGS,
  type AnalysisJob, type ChatMessage, type Conversation, type DrillLog, type Favorite, type Goal, type Profile, type SessionRecord,
  type Settings, type StrokeRecord, type TrainingPlan,
} from "./types";
import { RECORDINGS_BUCKET } from "../supabase/config";
import type { CoachingReport } from "../ai/schemas";
import type { Finding, Measurement } from "../tennis/types";

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const ms = (s: string | null) => (s ? Date.parse(s) : null);

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(`Cloud storage error: ${res.error.message}`);
  return res.data;
}

type Row = Record<string, unknown>;

export class SupabaseStore extends LocalStore {
  override readonly kind = "cloud" as const;

  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {
    super(`rally-ai-${userId}`); // per-user device cache, never shared with guest data
  }

  // ---- profile & settings ----------------------------------------------------------------------
  override async getProfile(): Promise<Profile | null> {
    const r = check(await this.sb.from("profiles").select("*").eq("id", this.userId).maybeSingle()) as Row | null;
    if (!r) return null;
    return {
      id: this.userId,
      name: r.name as string,
      experience: r.experience as Profile["experience"],
      handedness: r.handedness as Profile["handedness"],
      backhand: r.backhand as Profile["backhand"],
      frequency: r.frequency as Profile["frequency"],
      goals: r.goals as string[],
      preferredStrokes: r.preferred_strokes as Profile["preferredStrokes"],
      challenges: r.challenges as string[],
      equipment: r.equipment as string[],
      environment: r.environment as Profile["environment"],
      withBall: r.with_ball as boolean,
      onboarded: r.onboarded as boolean,
      createdAt: ms(r.created_at as string) ?? Date.now(),
      updatedAt: ms(r.updated_at as string) ?? Date.now(),
    };
  }

  override async saveProfile(p: Profile): Promise<void> {
    check(
      await this.sb.from("profiles").upsert({
        id: this.userId,
        name: p.name,
        experience: p.experience,
        handedness: p.handedness,
        backhand: p.backhand,
        frequency: p.frequency,
        goals: p.goals,
        preferred_strokes: p.preferredStrokes,
        challenges: p.challenges,
        equipment: p.equipment,
        environment: p.environment,
        with_ball: p.withBall,
        onboarded: p.onboarded,
      }),
    );
    emitChange();
  }

  override async getSettings(): Promise<Settings> {
    const r = check(await this.sb.from("profiles").select("settings").eq("id", this.userId).maybeSingle()) as { settings: Partial<Settings> } | null;
    return { ...DEFAULT_SETTINGS, ...(r?.settings ?? {}) };
  }

  override async saveSettings(s: Settings): Promise<void> {
    check(await this.sb.from("profiles").update({ settings: s }).eq("id", this.userId));
    emitChange();
  }

  // ---- sessions ------------------------------------------------------------------------------------
  private sessionRow(s: SessionRecord): Row {
    return {
      id: s.id,
      user_id: this.userId,
      title: s.title,
      created_at: iso(s.createdAt),
      started_at: iso(s.startedAt),
      ended_at: iso(s.endedAt),
      duration_ms: Math.round(s.durationMs),
      source: s.source,
      mode: s.mode,
      selection: s.selection,
      camera_view: s.cameraView,
      handedness: s.handedness,
      mirrored: s.mirrored,
      focus: s.focus,
      drill_id: s.drillId,
      status: s.status,
      analysis_status: s.analysisStatus,
      analysis_error: s.analysisError,
      has_recording: s.hasRecording,
      recording_mime: s.recordingMime,
      recording_path: s.recordingCloudPath,
      video_w: s.videoSize?.w ?? null,
      video_h: s.videoSize?.h ?? null,
      tracked_fraction: s.trackedFraction,
      avg_visibility: s.avgVisibility,
      local_report: s.localReport ? { ...s.localReport, findings: undefined } : null,
      selected_goal: s.selectedGoal,
      notes: s.notes,
      favorite: s.favorite,
      live_cues: s.liveCues,
    };
  }

  private toSession(r: Row, strokes: StrokeRecord[], findings: Finding[], report: Row | null): SessionRecord {
    const lr = r.local_report as SessionRecord["localReport"] | null;
    return {
      id: r.id as string,
      title: r.title as string,
      createdAt: ms(r.created_at as string) ?? 0,
      startedAt: ms(r.started_at as string) ?? 0,
      endedAt: ms(r.ended_at as string | null),
      durationMs: r.duration_ms as number,
      source: r.source as SessionRecord["source"],
      mode: r.mode as SessionRecord["mode"],
      selection: r.selection as SessionRecord["selection"],
      cameraView: r.camera_view as SessionRecord["cameraView"],
      handedness: r.handedness as SessionRecord["handedness"],
      mirrored: r.mirrored as boolean,
      focus: r.focus as SessionRecord["focus"],
      drillId: r.drill_id as string | null,
      status: r.status as SessionRecord["status"],
      analysisStatus: r.analysis_status as SessionRecord["analysisStatus"],
      analysisError: r.analysis_error as string | null,
      hasRecording: r.has_recording as boolean,
      recordingMime: r.recording_mime as string | null,
      recordingCloudPath: r.recording_path as string | null,
      videoSize: r.video_w ? { w: r.video_w as number, h: r.video_h as number } : null,
      trackedFraction: r.tracked_fraction as number,
      avgVisibility: r.avg_visibility as number,
      strokes,
      localReport: lr ? { ...lr, findings: findings.filter((f) => f.source === "local") } : null,
      report: (report?.report as CoachingReport | undefined) ?? null,
      reportMeta: report ? { model: report.model as string, mode: report.mode as "live" | "fixture", createdAt: ms(report.created_at as string) ?? 0 } : null,
      selectedGoal: r.selected_goal as string | null,
      notes: r.notes as string,
      favorite: r.favorite as boolean,
      liveCues: (r.live_cues as SessionRecord["liveCues"]) ?? [],
    };
  }

  private toStroke(r: Row, metrics: Measurement[]): StrokeRecord {
    return {
      id: r.id as string,
      index: r.idx as number,
      type: r.type as StrokeRecord["type"],
      typeSource: r.type_source as StrokeRecord["typeSource"],
      typeConfidence: r.type_confidence as StrokeRecord["typeConfidence"],
      typeReasons: r.type_reasons as string[],
      t0: r.t0 as number,
      t1: r.t1 as number,
      contactT: r.contact_t as number,
      phases: r.phases as StrokeRecord["phases"],
      metrics,
      quality: r.quality as StrokeRecord["quality"],
      visibility: r.visibility as number,
      recoveryObserved: r.recovery_observed as boolean,
      excluded: r.excluded as boolean,
      keyFrameTimes: (r.key_frame_times as number[]) ?? [],
    };
  }

  private toFinding(r: Row): Finding {
    return {
      id: r.id as string,
      source: r.source as Finding["source"],
      ruleId: (r.rule_id as string | null) ?? undefined,
      category: r.category as Finding["category"],
      title: r.title as string,
      observation: r.observation as string,
      evidence: r.evidence as string[],
      whyItMatters: r.why_it_matters as string,
      adjustment: r.adjustment as string,
      drillId: r.drill_id as string | null,
      priority: r.priority as Finding["priority"],
      confidence: r.confidence as Finding["confidence"],
      severity: r.severity as Finding["severity"],
      strokeIds: r.stroke_ids as string[],
      t0: r.t0 as number | null,
      t1: r.t1 as number | null,
      cue: (r.cue as string | null) ?? undefined,
    };
  }

  private async hydrate(rows: Row[]): Promise<SessionRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id as string);
    const [strokes, findings, reports] = await Promise.all([
      this.sb.from("strokes").select("*").in("session_id", ids).order("idx"),
      this.sb.from("feedback").select("*").in("session_id", ids),
      this.sb.from("reports").select("*").in("session_id", ids),
    ]);
    const strokeRows = check(strokes) as Row[];
    const strokeIds = strokeRows.map((s) => s.id as string);
    const metricRows: Row[] = [];
    for (let i = 0; i < strokeIds.length; i += 200) {
      metricRows.push(...(check(await this.sb.from("measurements").select("*").in("stroke_id", strokeIds.slice(i, i + 200))) as Row[]));
    }
    const metricsBy = new Map<string, Measurement[]>();
    for (const m of metricRows) {
      const list = metricsBy.get(m.stroke_id as string) ?? [];
      list.push({
        key: m.key as string, label: m.label as string, value: m.value as number, unit: m.unit as Measurement["unit"],
        confidence: m.confidence as Measurement["confidence"], method: m.method as Measurement["method"], note: (m.note as string | null) ?? undefined,
      });
      metricsBy.set(m.stroke_id as string, list);
    }
    const findingRows = check(findings) as Row[];
    const reportRows = check(reports) as Row[];
    return rows.map((r) =>
      this.toSession(
        r,
        strokeRows.filter((s) => s.session_id === r.id).map((s) => this.toStroke(s, metricsBy.get(s.id as string) ?? [])),
        findingRows.filter((f) => f.session_id === r.id).map((f) => this.toFinding(f)),
        reportRows.find((x) => x.session_id === r.id) ?? null,
      ),
    );
  }

  override async listSessions(): Promise<SessionRecord[]> {
    const rows = check(await this.sb.from("sessions").select("*").order("created_at", { ascending: false }).limit(200)) as Row[];
    return this.hydrate(rows);
  }

  override async getSession(id: string): Promise<SessionRecord | null> {
    const r = check(await this.sb.from("sessions").select("*").eq("id", id).maybeSingle()) as Row | null;
    if (!r) return null;
    return (await this.hydrate([r]))[0] ?? null;
  }

  override async saveSession(s: SessionRecord): Promise<void> {
    check(await this.sb.from("sessions").upsert(this.sessionRow(s)));
    // Replace children (cascade removes measurements).
    check(await this.sb.from("strokes").delete().eq("session_id", s.id));
    if (s.strokes.length) {
      check(
        await this.sb.from("strokes").insert(
          s.strokes.map((st) => ({
            id: st.id, session_id: s.id, user_id: this.userId, idx: st.index, type: st.type, type_source: st.typeSource,
            type_confidence: st.typeConfidence, type_reasons: st.typeReasons, t0: st.t0, t1: st.t1, contact_t: st.contactT,
            phases: st.phases, quality: st.quality, visibility: st.visibility, recovery_observed: st.recoveryObserved,
            excluded: st.excluded, key_frame_times: st.keyFrameTimes,
          })),
        ),
      );
      const ms = s.strokes.flatMap((st) =>
        st.metrics.map((m) => ({ stroke_id: st.id, user_id: this.userId, key: m.key, label: m.label, value: m.value, unit: m.unit, confidence: m.confidence, method: m.method, note: m.note ?? null })),
      );
      for (let i = 0; i < ms.length; i += 500) check(await this.sb.from("measurements").insert(ms.slice(i, i + 500)));
    }
    check(await this.sb.from("feedback").delete().eq("session_id", s.id));
    const findings = s.localReport?.findings ?? [];
    if (findings.length) {
      check(
        await this.sb.from("feedback").insert(
          findings.map((f) => ({
            id: f.id, session_id: s.id, user_id: this.userId, source: f.source, rule_id: f.ruleId ?? null, category: f.category,
            title: f.title, observation: f.observation, evidence: f.evidence, why_it_matters: f.whyItMatters, adjustment: f.adjustment,
            drill_id: f.drillId, priority: f.priority, confidence: f.confidence, severity: f.severity, stroke_ids: f.strokeIds,
            t0: f.t0, t1: f.t1, cue: f.cue ?? null,
          })),
        ),
      );
    }
    if (s.report && s.reportMeta) {
      check(await this.sb.from("reports").upsert({ session_id: s.id, user_id: this.userId, report: s.report, model: s.reportMeta.model, mode: s.reportMeta.mode }));
    }
    emitChange();
  }

  override async deleteSession(id: string): Promise<void> {
    const s = await this.getSession(id);
    if (s?.recordingCloudPath) await this.sb.storage.from(RECORDINGS_BUCKET).remove([s.recordingCloudPath]);
    check(await this.sb.from("sessions").delete().eq("id", id));
    await super.deleteSession(id); // local media cache
  }

  // ---- recordings: local cache + optional private cloud copy ------------------------------------
  /** Upload a recording to private storage. Returns the object path. */
  async uploadRecording(sessionId: string, blob: Blob, onProgress?: (p: number) => void): Promise<string> {
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
    const path = `${this.userId}/${sessionId}.${ext}`;
    onProgress?.(0);
    check(await this.sb.storage.from(RECORDINGS_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || "video/webm" }));
    onProgress?.(1);
    return path;
  }

  /** Short-lived signed URL for a private recording. */
  async signedRecordingUrl(path: string): Promise<string | null> {
    const { data, error } = await this.sb.storage.from(RECORDINGS_BUCKET).createSignedUrl(path, 60 * 30);
    return error ? null : data.signedUrl;
  }

  async deleteCloudRecording(path: string): Promise<void> {
    await this.sb.storage.from(RECORDINGS_BUCKET).remove([path]);
  }

  // ---- plans ----------------------------------------------------------------------------------------
  override async listPlans(): Promise<TrainingPlan[]> {
    const rows = check(await this.sb.from("training_plans").select("*").order("created_at", { ascending: false })) as Row[];
    return rows.map((r) => ({
      id: r.id as string, createdAt: ms(r.created_at as string) ?? 0, source: r.source as TrainingPlan["source"], title: r.title as string,
      rationale: r.rationale as string, weeklyGoals: r.weekly_goals as string[], days: r.days as TrainingPlan["days"], active: r.active as boolean,
    }));
  }
  override async savePlan(p: TrainingPlan): Promise<void> {
    if (p.active) check(await this.sb.from("training_plans").update({ active: false }).eq("active", true).neq("id", p.id));
    check(
      await this.sb.from("training_plans").upsert({
        id: p.id, user_id: this.userId, created_at: iso(p.createdAt), source: p.source, title: p.title, rationale: p.rationale,
        weekly_goals: p.weeklyGoals, days: p.days, active: p.active,
      }),
    );
    emitChange();
  }
  override async deletePlan(id: string): Promise<void> {
    check(await this.sb.from("training_plans").delete().eq("id", id));
    emitChange();
  }

  // ---- drill logs ---------------------------------------------------------------------------------------
  override async listDrillLogs(): Promise<DrillLog[]> {
    const rows = check(await this.sb.from("drill_logs").select("*").order("completed_at", { ascending: false })) as Row[];
    return rows.map((r) => ({
      id: r.id as string, drillId: r.drill_id as string, completedAt: ms(r.completed_at as string) ?? 0, reps: r.reps as number | null,
      rating: r.rating as DrillLog["rating"], notes: r.notes as string, sessionId: r.session_id as string | null,
    }));
  }
  override async addDrillLog(l: DrillLog): Promise<void> {
    check(
      await this.sb.from("drill_logs").insert({
        id: l.id, user_id: this.userId, drill_id: l.drillId, completed_at: iso(l.completedAt), reps: l.reps, rating: l.rating, notes: l.notes, session_id: l.sessionId,
      }),
    );
    emitChange();
  }
  override async deleteDrillLog(id: string): Promise<void> {
    check(await this.sb.from("drill_logs").delete().eq("id", id));
    emitChange();
  }

  // ---- goals ------------------------------------------------------------------------------------------------
  override async listGoals(): Promise<Goal[]> {
    const rows = check(await this.sb.from("goals").select("*").order("created_at", { ascending: false })) as Row[];
    return rows.map((r) => ({
      id: r.id as string, createdAt: ms(r.created_at as string) ?? 0, title: r.title as string, category: r.category as Goal["category"],
      metricKey: r.metric_key as string | null, strokeType: r.stroke_type as Goal["strokeType"], active: r.active as boolean, notes: r.notes as string,
    }));
  }
  override async saveGoal(g: Goal): Promise<void> {
    check(
      await this.sb.from("goals").upsert({
        id: g.id, user_id: this.userId, created_at: iso(g.createdAt), title: g.title, category: g.category, metric_key: g.metricKey,
        stroke_type: g.strokeType, active: g.active, notes: g.notes,
      }),
    );
    emitChange();
  }
  override async deleteGoal(id: string): Promise<void> {
    check(await this.sb.from("goals").delete().eq("id", id));
    emitChange();
  }

  // ---- conversations ----------------------------------------------------------------------------------------
  override async listConversations(): Promise<Conversation[]> {
    const rows = check(await this.sb.from("conversations").select("*").order("updated_at", { ascending: false }).limit(50)) as Row[];
    return rows.map((r) => ({
      id: r.id as string, createdAt: ms(r.created_at as string) ?? 0, updatedAt: ms(r.updated_at as string) ?? 0, title: r.title as string,
      sessionIds: r.session_ids as string[], messages: [],
    }));
  }
  override async getConversation(id: string): Promise<Conversation | null> {
    const r = check(await this.sb.from("conversations").select("*").eq("id", id).maybeSingle()) as Row | null;
    if (!r) return null;
    const msgs = check(await this.sb.from("messages").select("*").eq("conversation_id", id).order("created_at")) as Row[];
    return {
      id, createdAt: ms(r.created_at as string) ?? 0, updatedAt: ms(r.updated_at as string) ?? 0, title: r.title as string,
      sessionIds: r.session_ids as string[],
      messages: msgs.map((m): ChatMessage => ({
        id: m.id as string, role: m.role as ChatMessage["role"], content: m.content as string, details: m.details as string | null,
        references: m.refs as ChatMessage["references"], followUps: m.follow_ups as string[], at: ms(m.created_at as string) ?? 0,
        mode: (m.mode as ChatMessage["mode"]) ?? undefined,
      })),
    };
  }
  override async saveConversation(c: Conversation): Promise<void> {
    check(
      await this.sb.from("conversations").upsert({
        id: c.id, user_id: this.userId, created_at: iso(c.createdAt), updated_at: iso(c.updatedAt), title: c.title, session_ids: c.sessionIds,
      }),
    );
    const existing = new Set((check(await this.sb.from("messages").select("id").eq("conversation_id", c.id)) as Row[]).map((r) => r.id as string));
    const fresh = c.messages.filter((m) => !existing.has(m.id));
    if (fresh.length) {
      check(
        await this.sb.from("messages").insert(
          fresh.map((m) => ({
            id: m.id, conversation_id: c.id, user_id: this.userId, role: m.role, content: m.content, details: m.details ?? null,
            refs: m.references ?? [], follow_ups: m.followUps ?? [], mode: m.mode ?? null, created_at: iso(m.at),
          })),
        ),
      );
    }
    emitChange();
  }
  override async deleteConversation(id: string): Promise<void> {
    check(await this.sb.from("conversations").delete().eq("id", id));
    emitChange();
  }

  // ---- favorites ------------------------------------------------------------------------------------------------
  override async listFavorites(): Promise<Favorite[]> {
    const rows = check(await this.sb.from("favorites").select("*").order("created_at", { ascending: false })) as Row[];
    return rows.map((r) => ({ id: r.id as string, kind: r.kind as Favorite["kind"], refId: r.ref_id as string, label: r.label as string, createdAt: ms(r.created_at as string) ?? 0 }));
  }
  override async toggleFavorite(f: Omit<Favorite, "id" | "createdAt">): Promise<boolean> {
    const existing = check(await this.sb.from("favorites").select("id").eq("kind", f.kind).eq("ref_id", f.refId).maybeSingle()) as Row | null;
    if (existing) check(await this.sb.from("favorites").delete().eq("id", existing.id as string));
    else check(await this.sb.from("favorites").insert({ id: uid("fav"), user_id: this.userId, kind: f.kind, ref_id: f.refId, label: f.label }));
    emitChange();
    return !existing;
  }

  // ---- jobs (mirrored to the cloud for visibility; executed by the client job runner) -------------------------------
  override async saveJob(j: AnalysisJob): Promise<void> {
    await super.saveJob(j);
    const { error } = await this.sb.from("analysis_jobs").upsert({
      id: j.id, user_id: this.userId, session_id: j.sessionId, kind: j.kind, status: j.status, attempts: j.attempts, error: j.error, created_at: iso(j.createdAt),
    });
    if (error) console.warn("[store] analysis job not mirrored:", error.code);
  }

  override async exportAll(): Promise<Record<string, unknown>> {
    return {
      exportedAt: new Date().toISOString(),
      storage: "cloud",
      profile: await this.getProfile(),
      settings: await this.getSettings(),
      sessions: await this.listSessions(),
      plans: await this.listPlans(),
      drillLogs: await this.listDrillLogs(),
      goals: await this.listGoals(),
      conversations: await Promise.all((await this.listConversations()).map((c) => this.getConversation(c.id))),
      favorites: await this.listFavorites(),
      note: "Recordings are not included in this JSON export; download them individually from each session.",
    };
  }
}
