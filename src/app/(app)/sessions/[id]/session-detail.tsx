"use client";

import { clsx } from "clsx";
import { motion } from "motion/react";
import {
  ArrowLeft, Ban, Download, FileJson, Flag, RefreshCw, Share2, Sparkles, Star, Trash2, Undo2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassCard, GlassLinkButton, GlassModal, Spinner, softSpring } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { AiObservationCard, AiSummary, CategoryScores, FindingCard, MeasurementTable, TopPriorities } from "@/components/report/report-view";
import { ReviewPlayer, type Marker, type ReviewPlayerHandle } from "@/components/video/review-player";
import { ConfidenceBadge, EmptyState, ErrorState, MethodBadge, PageSkeleton, Section, TextArea } from "@/components/ui";
import { cancelReport, enqueueReport } from "@/lib/analysis/jobs";
import { correctStrokeType, setStrokeExcluded } from "@/lib/analysis/correct";
import { decodeTrace } from "@/lib/cv/trace";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { useSettings, useStore, useStoreContext, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { nowMs } from "@/lib/clock";
import type { SessionRecord } from "@/lib/data/types";
import { getDrill } from "@/lib/tennis/drills";
import { CATEGORY_LABEL, SELECTION_LABEL, STROKE_LABEL, VIEW_GUIDES, formatClock, formatStamp, formatValue } from "@/lib/tennis/labels";
import { STROKE_TYPES, type StrokeType } from "@/lib/tennis/types";
import { prioritizeFindings } from "@/lib/cv/rules";

export function SessionDetail({ id }: { id: string }) {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { status: server } = useStoreContext();
  const { settings } = useSettings();
  const q = useStoreQuery((s) => s.getSession(id), [id]);
  const session = q.data ?? null;
  const player = useRef<ReviewPlayerHandle>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [trace, setTrace] = useState<PoseFrame[] | null>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [notesDraft, setNotes] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyStroke, setBusyStroke] = useState<string | null>(null);

  // media (recording + pose trace)
  useEffect(() => {
    if (!store || !session) return;
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      const [blob, buf] = await Promise.all([store.getRecording(session.id), store.getTrace(session.id)]);
      if (cancelled) return;
      if (blob) url = URL.createObjectURL(blob);
      else if (session.recordingCloudPath && "signedRecordingUrl" in store) {
        url = await (store as unknown as { signedRecordingUrl: (p: string) => Promise<string | null> }).signedRecordingUrl(session.recordingCloudPath);
      }
      setSrc(url);
      try {
        setTrace(buf ? decodeTrace(buf) : null);
      } catch {
        setTrace(null);
      }
      setMediaLoaded(true);
    })();
    return () => {
      cancelled = true;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
    // reload media only when the session identity or recording availability changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, session?.id, session?.hasRecording, session?.recordingCloudPath]);


  // deep link: ?t=12.4 (seconds)
  useEffect(() => {
    const t = params.get("t");
    if (t && mediaLoaded) setTimeout(() => player.current?.seek(Number(t) * 1000), 300);
  }, [params, mediaLoaded]);
  useEffect(() => {
    if (params.get("fresh") && session) toast({ tone: "success", title: "Session saved", body: `${session.strokes.length} strokes analysed on your device.` });
  }, [params.get("fresh"), session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo<Marker[]>(() => {
    if (!session) return [];
    const local = (session.localReport?.findings ?? [])
      .filter((f) => (f.severity === "issue" || f.severity === "watch") && f.t0 !== null)
      .map((f) => ({ t: f.t0!, label: f.title, severity: f.severity }));
    const ai = (session.report?.observations ?? [])
      .filter((o) => o.timestampStart !== null)
      .map((o) => ({ t: o.timestampStart! * 1000, label: o.finding, severity: o.priority === "high" ? ("issue" as const) : ("watch" as const) }));
    // Merge markers that would overlap on the timeline into one, keeping the most severe colour.
    const rank = { issue: 3, watch: 2, ok: 1, insufficient: 0 } as const;
    const merged: Marker[] = [];
    for (const m of [...ai, ...local].sort((x, y) => x.t - y.t)) {
      const prev = merged[merged.length - 1];
      if (prev && m.t - prev.t < 400) {
        prev.label = `${prev.label} · ${m.label}`;
        if (rank[m.severity] > rank[prev.severity]) prev.severity = m.severity;
      } else merged.push({ ...m });
    }
    return merged;
  }, [session]);

  if (q.error) return <ErrorState body="This session couldn't be loaded." onRetry={q.reload} />;
  if (q.loading) return <PageSkeleton />;
  if (!session) {
    return (
      <EmptyState title="Session not found" body="It may have been deleted, or it belongs to a different account or device." action={<GlassLinkButton href="/sessions">All sessions</GlassLinkButton>} />
    );
  }

  const seek = (ms: number) => {
    player.current?.seek(ms);
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const notes = notesDraft ?? session.notes;
  const save = (patch: Partial<SessionRecord>) => store?.saveSession({ ...session, ...patch });
  const local = session.localReport;
  const findings = prioritizeFindings(local?.findings ?? []);
  const issues = findings.filter((f) => f.severity === "issue" || f.severity === "watch");
  const oks = findings.filter((f) => f.severity === "ok");
  const strokes = session.strokes;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...session, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rally-session-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const share = async () => {
    const top = session.report?.topPriorities.map((p) => `• ${p.title}`) ?? issues.slice(0, 3).map((f) => `• ${f.title}`);
    const text = `Rally AI — ${session.title}\n${formatClock(session.durationMs)} · ${strokes.filter((s) => !s.excluded).length} strokes\n${session.report?.summary ?? ""}\nFocus next:\n${top.join("\n") || "• Keep building consistency"}`;
    try {
      if (navigator.share) await navigator.share({ title: session.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ tone: "success", title: "Summary copied" });
      }
    } catch {
      /* user cancelled */
    }
  };
  const downloadRecording = async () => {
    const blob = await store?.getRecording(session.id);
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rally-${session.id}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const deleteRecording = async () => {
    if (!store) return;
    await store.deleteRecording(session.id);
    if (session.recordingCloudPath && "deleteCloudRecording" in store) {
      await (store as unknown as { deleteCloudRecording: (p: string) => Promise<void> }).deleteCloudRecording(session.recordingCloudPath);
    }
    await store.saveSession({ ...session, hasRecording: false, recordingCloudPath: null });
    setSrc(null);
    toast({ tone: "success", title: "Recording deleted", body: "Your analysis and pose replay are kept." });
  };
  const chooseGoal = async (title: string, category: string, drillId: string | null) => {
    if (!store) return;
    await store.saveGoal({ id: uid("goal"), createdAt: nowMs(), title, category: category as never, metricKey: null, strokeType: null, active: true, notes: `From session ${session.title}` });
    await save({ selectedGoal: title });
    toast({ tone: "success", title: "Goal saved", body: drillId ? `Recommended drill: ${getDrill(drillId)?.title}` : undefined });
  };

  const goalOptions = session.report?.topPriorities.length
    ? session.report.topPriorities.map((p) => {
        const o = session.report!.observations.find((x) => x.id === p.observationId);
        return { title: p.title, category: o?.category ?? "preparation", drillId: o?.drillId ?? null };
      })
    : issues.slice(0, 3).map((f) => ({ title: f.title, category: f.category, drillId: f.drillId }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <GlassButton variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/sessions")}>
          Sessions
        </GlassButton>
        <div className="flex gap-1.5">
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label={session.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={session.favorite}
            onClick={async () => {
              await save({ favorite: !session.favorite });
              await store?.toggleFavorite({ kind: "session", refId: session.id, label: session.title });
            }}>
            <Star className={clsx("size-5", session.favorite && "fill-[var(--watch)] text-watch")} />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Share summary" onClick={share}>
            <Share2 className="size-5" />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Export session data (JSON)" onClick={exportJson}>
            <FileJson className="size-5" />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0 text-issue" aria-label="Delete session" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" />
          </GlassButton>
        </div>
      </div>

      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="mb-6">
        <p className="eyebrow">{new Date(session.startedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</p>
        <h1 className="display mt-1 text-[30px] leading-tight sm:text-[38px]">{session.title}</h1>
        <p className="mt-2 text-[15px] text-fg-2 tabular">
          {formatClock(session.durationMs)} · {strokes.filter((s) => !s.excluded).length} strokes · {SELECTION_LABEL[session.selection]} · {VIEW_GUIDES[session.cameraView].title}
          {session.mode !== "standard" ? ` · ${session.mode} mode` : ""} · tracked {Math.round(session.trackedFraction * 100)}% of the time
        </p>
      </motion.header>

      {/* AI analysis status */}
      <AnalysisStatus
        session={session}
        serverAi={server?.ai ?? null}
        framesConsent={settings.aiFrames}
        onRun={() => store && enqueueReport(store, session.id)}
        onCancel={() => store && cancelReport(store, session.id)}
      />

      {/* review player */}
      <section id="review" className="mt-6 scroll-mt-6">
        <GlassCard>
          {mediaLoaded ? (
            <ReviewPlayer ref={player} src={src} trace={trace} durationMs={session.durationMs} strokes={strokes} markers={markers} handedness={session.handedness} />
          ) : (
            <div className="skeleton aspect-video w-full" />
          )}
          <div className="mt-4">
            <p className="eyebrow mb-2">Detected strokes · tap to review, correct if wrong</p>
            {strokes.length ? (
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {strokes.map((s) => (
                  <div key={s.id} className={clsx("glass flex shrink-0 flex-col gap-2 rounded-2xl p-3", s.excluded && "opacity-50")}>
                    <button className="text-left" onClick={() => seek(s.t0)}>
                      <p className="text-[13px] font-semibold tabular">
                        #{s.index + 1} · {formatStamp(s.contactT)}
                      </p>
                      <p className="text-[12px] text-fg-3">
                        {s.typeSource === "auto" ? `auto (${s.typeConfidence})` : s.typeSource === "user_corrected" ? "corrected" : "selected"} · tracking {s.quality}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label={`Stroke ${s.index + 1} type`}
                        value={s.type}
                        disabled={busyStroke === s.id}
                        onChange={async (e) => {
                          if (!store) return;
                          setBusyStroke(s.id);
                          await correctStrokeType(store, session, s.id, e.target.value as StrokeType);
                          setBusyStroke(null);
                        }}
                        className="h-9 rounded-xl border border-[var(--hairline)] bg-surface/70 px-2 text-[13px] font-semibold"
                      >
                        {STROKE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {STROKE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="grid size-9 place-items-center rounded-xl border border-[var(--hairline)] text-fg-2 hover:text-fg"
                        aria-label={s.excluded ? `Restore stroke ${s.index + 1}` : `Mark stroke ${s.index + 1} as not a stroke`}
                        title={s.excluded ? "Restore" : "Not a stroke"}
                        onClick={() => store && setStrokeExcluded(store, session, s.id, !s.excluded)}
                      >
                        {busyStroke === s.id ? <Spinner /> : s.excluded ? <Undo2 className="size-4" /> : <Ban className="size-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-2">
                No strokes were detected. Make sure your whole body is visible and swing at a natural pace — or use a front/rear view for footwork sessions.
              </p>
            )}
          </div>
        </GlassCard>
      </section>

      <Section title="Top three improvements">
        <TopPriorities session={session} onSeek={seek} />
      </Section>

      {session.report && (
        <Section title="Coaching summary">
          <AiSummary report={session.report} meta={session.reportMeta} />
        </Section>
      )}

      {local && (
        <Section title="Technique snapshot">
          <CategoryScores local={local} />
        </Section>
      )}

      <Section
        title="What Rally AI measured"
        action={<span className="hidden items-center gap-1.5 sm:flex"><MethodBadge method="measured_2d" /><MethodBadge method="estimated_3d" /><MethodBadge method="derived" /></span>}
      >
        {issues.length ? (
          <motion.div className="space-y-3" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}>
            {issues.map((f, i) => (
              <motion.div key={f.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: softSpring } }}>
                <FindingCard f={f} onSeek={seek} defaultOpen={i === 0} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <p className="text-[15px] text-fg-2">No recurring issues were found by the on-device checks.</p>
        )}
        {oks.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2">Looked good</p>
            <div className="flex flex-wrap gap-2">
              {oks.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1.5 text-sm font-semibold text-ok" title={f.evidence.join(" ")}>
                  <span className="size-1.5 rounded-full bg-current" /> {f.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {session.report && session.report.observations.length > 0 && (
        <Section title="AI coach observations">
          <div className="space-y-3">
            {session.report.observations.map((o) => (
              <AiObservationCard key={o.id} o={o} onSeek={seek} />
            ))}
          </div>
          {session.report.inconclusive.length > 0 && (
            <GlassCard className="mt-3">
              <p className="eyebrow mb-1.5">Couldn’t be assessed from this footage</p>
              <ul className="space-y-1 text-[15px] text-fg-2">
                {session.report.inconclusive.map((x, i) => (
                  <li key={i}>• {x}</li>
                ))}
              </ul>
            </GlassCard>
          )}
        </Section>
      )}

      {/* goal + drill (workflow steps 11–12) */}
      {goalOptions.length > 0 && (
        <Section title="Choose your next goal">
          <GlassCard>
            {session.selectedGoal ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px]">
                  <Flag className="mr-1.5 inline size-4 text-accent" /> Goal set: <strong>{session.selectedGoal}</strong>
                </p>
                <GlassLinkButton href="/training" variant="primary" size="sm">Go to training plan</GlassLinkButton>
              </div>
            ) : (
              <>
                <p className="text-[15px] text-fg-2">Pick one thing to work on. Rally AI will recommend a drill and track it in future sessions.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {goalOptions.map((g) => (
                    <button key={g.title} onClick={() => chooseGoal(g.title, g.category, g.drillId)} className="glass rounded-2xl p-4 text-left transition-transform active:scale-[0.98]">
                      <p className="text-xs font-semibold text-accent">{CATEGORY_LABEL[g.category as keyof typeof CATEGORY_LABEL] ?? g.category}</p>
                      <p className="mt-1 font-semibold">{g.title}</p>
                      {g.drillId && <p className="mt-1 text-xs text-fg-3">Drill: {getDrill(g.drillId)?.title}</p>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </Section>
      )}

      {local && local.sessionMetrics.length > 0 && (
        <Section title="Movement & footwork">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {local.sessionMetrics.map((m) => (
              <GlassCard key={m.key} className="!p-4">
                <p className="text-[13px] text-fg-2">{m.label}</p>
                <p className="display mt-1 text-2xl tabular">{formatValue(m.value, m.unit)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <MethodBadge method={m.method} />
                  <ConfidenceBadge confidence={m.confidence} />
                </div>
                {m.note && <p className="mt-2 text-xs text-fg-3">{m.note}</p>}
              </GlassCard>
            ))}
          </div>
        </Section>
      )}

      <Section title="Limitations of this footage">
        <GlassCard>
          <ul className="space-y-1.5 text-[15px] text-fg-2">
            {[...new Set([...(local?.limitations ?? []), ...(session.report?.limitations ?? [])])].map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
        </GlassCard>
      </Section>

      {session.liveCues.length > 0 && (
        <Section title="Live cues you received">
          <GlassCard>
            <ul className="space-y-1.5 text-[15px]">
              {session.liveCues.map((c, i) => (
                <li key={i}>
                  <button onClick={() => seek(c.t)} className="mr-2 font-semibold text-accent-2 tabular">
                    {formatStamp(c.t)}
                  </button>
                  {c.text}
                </li>
              ))}
            </ul>
          </GlassCard>
        </Section>
      )}

      <Section title="Session notes">
        <GlassCard>
          <TextArea rows={3} value={notes} maxLength={4000} placeholder="How did it feel? Anything you want to remember?" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== session.notes && save({ notes })} aria-label="Session notes" />
        </GlassCard>
      </Section>

      <Section
        title="Full analysis"
        action={
          <GlassButton variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
            {showAll ? "Hide" : "Show all measurements"}
          </GlassButton>
        }
      >
        {showAll ? (
          <GlassCard>
            <MeasurementTable session={session} onSeek={seek} />
          </GlassCard>
        ) : (
          <p className="text-sm text-fg-3">Every measurement for every stroke, with its method and confidence.</p>
        )}
      </Section>

      <Section title="Recording & privacy">
        <GlassCard className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-fg-2">
            {session.hasRecording
              ? `Video stored privately ${session.recordingCloudPath ? "on this device and in your private cloud storage" : "on this device only"}.`
              : "No video is stored for this session. The pose replay uses body landmarks only."}
          </p>
          {session.hasRecording && (
            <div className="flex gap-2">
              <GlassButton size="sm" icon={<Download className="size-4" />} onClick={downloadRecording}>
                Download
              </GlassButton>
              <GlassButton size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={deleteRecording}>
                Delete video
              </GlassButton>
            </div>
          )}
        </GlassCard>
      </Section>

      <GlassModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this session?"
        size="sm"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="danger"
              onClick={async () => {
                await store?.deleteSession(session.id);
                router.replace("/sessions");
              }}
            >
              Delete
            </GlassButton>
          </>
        }
      >
        <p className="text-fg-2">The recording, pose data, measurements and reports for this session will be permanently removed.</p>
      </GlassModal>
    </div>
  );
}

function AnalysisStatus({ session, serverAi, framesConsent, onRun, onCancel }: {
  session: SessionRecord;
  serverAi: "live" | "fixture" | "unavailable" | null;
  framesConsent: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  const s = session.analysisStatus;
  if (s === "complete" && session.report) return null;
  const noStrokes = !session.strokes.some((x) => !x.excluded);
  let title = "On-device report ready";
  let body = "Get a deeper review from the AI coach: it looks at a few sampled key frames together with these measurements.";
  if (s === "queued" || s === "running") {
    title = s === "queued" ? "AI analysis queued" : "AI coach is reviewing your strokes";
    body = "This usually takes under a minute. You can leave this page — it continues in the background.";
  } else if (s === "failed") {
    title = "AI analysis didn’t finish";
    body = session.analysisError ?? "Please try again.";
  } else if (s === "unavailable" || serverAi === "unavailable") {
    title = "AI coaching unavailable";
    body = "The on-device analysis below is complete. AI reports need an OpenAI key on the server.";
  } else if (s === "cancelled") {
    title = "AI analysis cancelled";
  }
  const running = s === "queued" || s === "running";
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-4" role="status" aria-live="polite">
      <div className="flex min-w-0 items-start gap-3">
        <span className={clsx("grid size-10 shrink-0 place-items-center rounded-2xl", running ? "bg-accent-2-soft text-accent-2" : "bg-accent-soft text-accent")}>
          {running ? <Spinner /> : <Sparkles className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-fg-2">{body}</p>
          {!running && serverAi !== "unavailable" && (
            <p className="mt-1 text-xs text-fg-3">
              {framesConsent ? "Up to 20 small key frames (not the full video) and the measurements are sent to OpenAI." : "Frame sharing is off in Settings — only measurements will be sent."}
            </p>
          )}
        </div>
      </div>
      {running ? (
        <GlassButton size="sm" variant="ghost" icon={<X className="size-4" />} onClick={onCancel}>
          Cancel
        </GlassButton>
      ) : serverAi !== "unavailable" && !noStrokes ? (
        <GlassButton size="sm" variant="primary" icon={s === "failed" ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />} onClick={onRun}>
          {s === "failed" ? "Retry" : "Get AI report"}
        </GlassButton>
      ) : (
        <Link href="/settings" className="text-sm font-semibold text-accent">
          Settings
        </Link>
      )}
    </GlassCard>
  );
}

