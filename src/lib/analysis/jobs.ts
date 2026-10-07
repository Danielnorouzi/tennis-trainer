"use client";

// Persistent analysis job queue. Jobs are stored (IndexedDB, and mirrored to Supabase for
// signed-in users) so a report request survives navigation and reloads: on start-up, jobs left
// "running" are re-queued. One job runs at a time; transient failures retry with back-off.

import { ApiError, postJson } from "../api/client";
import type { CoachingReport } from "../ai/schemas";
import type { DataStore } from "../data/store";
import { uid } from "../data/store";
import type { AnalysisJob } from "../data/types";
import { defaultProfile } from "../data/provider";
import { buildAnalyzeRequest } from "./request";

const MAX_ATTEMPTS = 3;
const controllers = new Map<string, AbortController>();
let running = false;

export async function enqueueReport(store: DataStore, sessionId: string): Promise<void> {
  const jobs = await store.listJobs();
  // de-duplicate: one open job per session
  if (jobs.some((j) => j.sessionId === sessionId && (j.status === "queued" || j.status === "running"))) return;
  const now = Date.now();
  await store.saveJob({ id: uid("job"), sessionId, kind: "session_report", status: "queued", attempts: 0, createdAt: now, updatedAt: now, error: null });
  const s = await store.getSession(sessionId);
  if (s) await store.saveSession({ ...s, analysisStatus: "queued", analysisError: null });
  void runQueue(store);
}

export async function cancelReport(store: DataStore, sessionId: string): Promise<void> {
  for (const j of await store.listJobs()) {
    if (j.sessionId !== sessionId || (j.status !== "queued" && j.status !== "running")) continue;
    controllers.get(j.id)?.abort();
    await store.saveJob({ ...j, status: "cancelled", updatedAt: Date.now() });
  }
  const s = await store.getSession(sessionId);
  if (s) await store.saveSession({ ...s, analysisStatus: s.report ? "complete" : "cancelled" });
}

/** Re-queue jobs interrupted by a reload, then process the queue. */
export async function resumeJobs(store: DataStore): Promise<void> {
  for (const j of await store.listJobs()) {
    if (j.status === "running" && !controllers.has(j.id)) await store.saveJob({ ...j, status: "queued", updatedAt: Date.now() });
  }
  void runQueue(store);
}

async function runQueue(store: DataStore): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = (await store.listJobs()).find((j) => j.status === "queued");
      if (!job) break;
      await runJob(store, job);
    }
  } finally {
    running = false;
  }
}

async function runJob(store: DataStore, job: AnalysisJob): Promise<void> {
  const session = await store.getSession(job.sessionId);
  if (!session) {
    await store.saveJob({ ...job, status: "cancelled", error: "Session deleted", updatedAt: Date.now() });
    return;
  }
  const ctrl = new AbortController();
  controllers.set(job.id, ctrl);
  await store.saveJob({ ...job, status: "running", attempts: job.attempts + 1, updatedAt: Date.now() });
  await store.saveSession({ ...session, analysisStatus: "running", analysisError: null });
  try {
    const [profile, settings, previous] = await Promise.all([store.getProfile(), store.getSettings(), store.listSessions()]);
    const body = await buildAnalyzeRequest({ store, session, profile: profile ?? defaultProfile(), settings, previous });
    if (!body.strokes.length) throw new ApiError(422, "no_strokes", "No strokes were detected, so there is nothing for the AI coach to review.");
    const { data, meta } = await postJson<CoachingReport>("/api/ai/report", body, { signal: ctrl.signal, retries: 1, timeoutMs: 150_000 });
    const latest = (await store.getSession(job.sessionId)) ?? session;
    await store.saveSession({
      ...latest,
      report: data,
      reportMeta: { model: meta.model, mode: meta.mode, createdAt: Date.now() },
      analysisStatus: "complete",
      analysisError: null,
    });
    await store.saveJob({ ...job, status: "complete", attempts: job.attempts + 1, updatedAt: Date.now(), error: null });
    if (settings.retention === "delete_after_analysis" && latest.hasRecording) {
      await store.deleteRecording(job.sessionId);
      await store.saveSession({ ...(await store.getSession(job.sessionId))!, hasRecording: false });
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, "error", e instanceof Error ? e.message : "Analysis failed");
    const latest = (await store.getSession(job.sessionId)) ?? session;
    if (err.code === "cancelled") return;
    const permanent = ["ai_unavailable", "invalid_request", "no_strokes", "budget_user", "budget_global", "too_large"].includes(err.code);
    const attempts = job.attempts + 1;
    if (!permanent && attempts < MAX_ATTEMPTS) {
      await store.saveJob({ ...job, status: "queued", attempts, error: err.message, updatedAt: Date.now() });
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempts));
    } else {
      await store.saveJob({ ...job, status: "failed", attempts, error: err.message, updatedAt: Date.now() });
      await store.saveSession({
        ...latest,
        analysisStatus: err.code === "ai_unavailable" ? "unavailable" : "failed",
        analysisError: err.message,
      });
    }
  } finally {
    controllers.delete(job.id);
  }
}
