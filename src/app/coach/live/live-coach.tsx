"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, ChevronDown, ChevronLeft, ChevronUp, Mic, MicOff, Minus, Pause, Play, Plus, RotateCcw, Settings2, Square, SwitchCamera, Volume2, VolumeX, X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassModal, GlassSegmentedControl, spring, softSpring } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { Chip, Toggle } from "@/components/ui";
import { useLiveCoach } from "@/hooks/use-live-coach";
import { finalizeCapture } from "@/lib/analysis/finalize";
import { SEVERITY_COLOR } from "@/lib/cv/overlay";
import { useSettings, useStore, useStoreContext, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import type { VoiceMode } from "@/lib/data/types";
import { getDrill } from "@/lib/tennis/drills";
import { CATEGORY_LABEL, STROKE_LABEL, formatClock, formatValue } from "@/lib/tennis/labels";
import { CATEGORIES, type Category } from "@/lib/tennis/types";
import { listenForCommands, Speaker, speechRecognitionSupported, type VoiceCommand } from "@/lib/voice/speech";
import { startRealtimeCoach, type RealtimeHandle } from "@/lib/voice/realtime";
import { SetupStep, type SessionPlan } from "./setup-step";

const PHASE_TEXT: Record<string, string> = {
  setup: "Waiting for player",
  ready: "Ready",
  preparation: "Preparation",
  swing: "Swing",
  follow_through: "Follow-through",
  recovery: "Recovery",
};

export function LiveCoach() {
  const router = useRouter();
  const params = useSearchParams();
  const store = useStore();
  const { status: server } = useStoreContext();
  const toast = useToast();
  const { settings, save: saveSettings } = useSettings();
  const profileQ = useStoreQuery((s) => s.getProfile());
  const handedness = profileQ.data?.handedness ?? "right";

  const [step, setStep] = useState<"plan" | "camera">("plan");
  const initialFocus = params.get("focus") as Category | null;
  const initialDrill = params.get("drill");
  // `view`/`record` stay null until the user picks them, so saved settings (loaded async) apply.
  const [rawPlan, setRawPlan] = useState<Omit<SessionPlan, "view" | "record"> & { view: SessionPlan["view"] | null; record: boolean | null }>(() => ({
    selection: (params.get("stroke") as SessionPlan["selection"]) ?? "forehand",
    mode: initialDrill ? "drill" : initialFocus && CATEGORIES.includes(initialFocus) ? "focus" : "standard",
    view: null,
    focus: initialFocus && CATEGORIES.includes(initialFocus) ? initialFocus : null,
    drillId: initialDrill && getDrill(initialDrill) ? initialDrill : null,
    drillTarget: 10,
    facing: "environment",
    resolution: "720p",
    record: null,
    countdown: 5,
  }));
  const plan: SessionPlan = useMemo(
    () => ({ ...rawPlan, view: rawPlan.view ?? settings.defaultView, record: rawPlan.record ?? settings.retention !== "never_record" }),
    [rawPlan, settings.defaultView, settings.retention],
  );
  const [mirrorOverride, setMirror] = useState<boolean | null>(null);
  const setPlan = (patch: Partial<SessionPlan>) => {
    if (patch.facing && patch.facing !== rawPlan.facing) setMirror(null); // front camera mirrors by default
    setRawPlan((p) => ({ ...p, ...patch }));
  };
  const mirror = mirrorOverride ?? plan.facing === "user";
  const [voiceOverride, setVoiceMode] = useState<VoiceMode | null>(null);
  const voiceMode = voiceOverride ?? settings.voiceMode;
  const [skeletonOverride, setShowSkeleton] = useState<boolean | null>(null);
  const showSkeleton = skeletonOverride ?? settings.showSkeleton;
  const [anglesOverride, setShowAngles] = useState<boolean | null>(null);
  const showAngles = anglesOverride ?? settings.showAngles;
  const [mutedOverride, setMuted] = useState<string[] | null>(null);
  const muted = mutedOverride ?? settings.mutedCueCategories;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drillAdjust, setDrillAdjust] = useState(0);
  const stopListening = useRef<(() => void) | null>(null);
  const realtime = useRef<RealtimeHandle | null>(null);
  const [coachConnected, setCoachConnected] = useState(false);

  const [speaker] = useState(() => (typeof window === "undefined" ? null : new Speaker()));
  /** Spoken replies to explicit requests (voice commands) — silent in Quiet mode. */
  const reply = useCallback((text: string) => {
    if (voiceMode !== "quiet") speaker?.speak(text, { interrupt: true });
  }, [speaker, voiceMode]);

  const speak = useCallback((text: string) => {
    if (voiceMode === "training" || voiceMode === "coach") speaker?.speak(text);
  }, [speaker, voiceMode]);

  const {
    videoRef, canvasRef, status, ui, cue, countdown, cueHistory, visionInfo, error: cameraError,
    startCamera, startSession, cancelCountdown, pause, resume, stopSession, discardSession, releaseCamera, dismissCue,
  } = useLiveCoach({
    selection: plan.selection,
    view: plan.view,
    handedness,
    facing: plan.facing,
    resolution: plan.resolution,
    mirror,
    showSkeleton,
    showAngles,
    record: plan.record && settings.retention !== "never_record",
    focus: plan.mode === "focus" ? plan.focus : null,
    mutedCategories: muted,
    speak,
    isSpeaking: () => Boolean(speaker?.speaking),
  });
  const recording = status === "recording" || status === "paused";
  const drill = plan.mode === "drill" ? getDrill(plan.drillId) : undefined;
  const reps = Math.max(0, ui.strokeCount + drillAdjust);

  // start the camera when entering the camera step; restart when camera options change
  useEffect(() => {
    if (step !== "camera") return;
    void startCamera();
  }, [step, plan.facing, plan.resolution, startCamera]);
  useEffect(() => () => releaseCamera(), [releaseCamera]);

  // drill completion announcement
  const announced = useRef(false);
  useEffect(() => {
    if (plan.mode !== "drill" || !recording) return;
    if (reps >= plan.drillTarget && !announced.current) {
      announced.current = true;
      speak("Set complete. Nice work.");
      toast({ tone: "success", title: "Set complete", body: `${reps} reps recorded. Stop when you're ready.` });
    }
  }, [reps, plan.mode, plan.drillTarget, recording, speak, toast]);

  const finish = useCallback(async () => {
    if (!store) return;
    setSaving(true);
    try {
      const result = await stopSession();
      stopListening.current?.();
      realtime.current?.close();
      if (!result) {
        setSaving(false);
        return;
      }
      const session = await finalizeCapture(
        store,
        {
          id: uid("sess"),
          source: "live",
          mode: plan.mode,
          selection: plan.selection,
          view: plan.view,
          handedness,
          mirrored: false,
          focus: plan.mode === "focus" ? plan.focus : null,
          drillId: plan.drillId,
          startedAt: result.startedAt,
          durationMs: result.durationMs,
          poseFrames: result.poseFrames,
          features: result.features,
          liveKeyFrames: result.liveKeyFrames,
          recording: result.recording,
          videoSize: result.videoSize,
          liveCues: result.cues.map((c) => ({ t: c.t, text: c.text, category: c.category })),
          notes: plan.mode === "drill" && drillAdjust !== 0 ? `Drill rep count corrected manually to ${reps} (detected ${ui.strokeCount}).` : "",
        },
        settings,
      );
      if (plan.mode === "drill" && plan.drillId) {
        await store.addDrillLog({ id: uid("log"), drillId: plan.drillId, completedAt: Date.now(), reps, rating: null, notes: "", sessionId: session.id });
      }
      if (voiceMode === "review" || voiceMode === "coach") {
        const top = session.localReport?.findings.find((f) => f.severity === "issue" || f.severity === "watch");
        speaker?.speak(`Session saved. ${session.strokes.length} strokes detected.${top ? ` Main thing to work on: ${top.title}.` : ""}`);
      }
      router.push(`/sessions/${session.id}?fresh=1`);
    } catch (e) {
      setSaving(false);
      toast({ tone: "error", title: "Couldn't save the session", body: e instanceof Error ? e.message : undefined });
    }
  }, [store, stopSession, plan, handedness, settings, reps, drillAdjust, ui.strokeCount, voiceMode, speaker, router, toast]);

  // voice commands
  const onCommand = useCallback((c: VoiceCommand) => {
    switch (c) {
      case "start":
        if (status === "setup") startSession(3);
        break;
      case "stop":
        if (recording) void finish();
        break;
      case "pause":
        pause();
        break;
      case "resume":
        resume();
        break;
      case "mute":
        setVoiceMode("quiet");
        break;
      case "unmute":
        setVoiceMode("training");
        speaker?.speak("Coach on.", { interrupt: true });
        break;
      case "repeat":
        reply(speaker?.lastSpoken || "Nothing to repeat yet.");
        break;
      case "what_to_fix": {
        const last = cueHistory[0];
        reply(last ? `Focus on this: ${last.text}` : "Nothing stands out yet. Keep swinging.");
        break;
      }
      case "analyze_last": {
        const s = ui.lastStroke;
        if (!s) reply("I haven't detected a stroke yet.");
        else {
          const knee = s.metrics.find((m) => m.key === "min_knee_deg");
          reply(`Last stroke: ${STROKE_LABEL[s.type]}, tracking ${s.quality}.${knee && knee.confidence !== "low" ? ` Knee bend ${Math.round(knee.value)} degrees.` : ""}`);
        }
        break;
      }
    }
  }, [status, recording, startSession, pause, resume, cueHistory, reply, finish, speaker, ui.lastStroke]);
  const onCommandRef = useRef(onCommand);
  useEffect(() => {
    onCommandRef.current = onCommand;
  });

  const toggleListening = () => {
    if (listening) {
      stopListening.current?.();
      stopListening.current = null;
      setListening(false);
      return;
    }
    stopListening.current = listenForCommands(
      (cmd) => onCommandRef.current(cmd),
      (msg) => {
        toast({ tone: "warning", title: "Voice commands", body: msg });
        setListening(false);
      },
    );
    setListening(true);
  };
  useEffect(() => () => stopListening.current?.(), []);

  const connectCoach = async () => {
    if (coachConnected) {
      realtime.current?.close();
      realtime.current = null;
      setCoachConnected(false);
      return;
    }
    try {
      const sessions = store ? await store.listSessions() : [];
      const last = sessions[0];
      const context = last
        ? `Last session "${last.title}": ${last.strokes.length} strokes. Findings: ${(last.localReport?.findings ?? []).filter((f) => f.severity !== "ok").map((f) => f.title).join("; ") || "none flagged"}. ${last.report?.summary ?? ""}`
        : "No previous sessions.";
      realtime.current = await startRealtimeCoach({ context: context.slice(0, 3800), experience: profileQ.data?.experience ?? "intermediate" });
      setCoachConnected(true);
      toast({ tone: "success", title: "Voice coach connected", body: "Ask a question any time — e.g. “What should I fix?”" });
    } catch (e) {
      toast({ tone: "warning", title: "Voice coach unavailable", body: e instanceof Error ? e.message : "Spoken cues still work." });
    }
  };

  const exit = async () => {
    if (recording) await discardSession();
    releaseCamera();
    router.push("/dashboard");
  };

  if (step === "plan") {
    return (
      <div className="min-h-dvh bg-[radial-gradient(900px_500px_at_80%_-10%,rgba(76,194,122,.18),transparent_60%),#08090a]">
        <TopBar onBack={() => router.push("/dashboard")} title="Live Coach" />
        <SetupStep plan={plan} onChange={setPlan} onContinue={() => setStep("camera")} recordAllowed={settings.retention !== "never_record"} />
      </div>
    );
  }

  const cueColor = cue ? SEVERITY_COLOR[cue.severity] : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white select-none">
      {/* camera */}
      <motion.video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 size-full object-cover"
        style={{ transform: mirror ? "scaleX(-1)" : undefined }}
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: status === "starting" || status === "idle" ? 0 : 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        aria-label="Camera preview"
      />
      <motion.canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-5">
        <GlassButton variant="dark" size="md" className="!size-12 !p-0" aria-label={recording ? "Discard session and exit" : "Exit Live Coach"} onClick={exit}>
          {recording ? <X className="size-5" /> : <ChevronLeft className="size-6" />}
        </GlassButton>
        <motion.div layout transition={spring} className="glass-dark flex h-12 items-center gap-2.5 rounded-full px-4 text-[15px] font-semibold tabular" role="status" aria-live="polite">
          {recording ? (
            <>
              <span className={clsx("size-2.5 rounded-full bg-[#ff453a]", status === "recording" && "rec-dot")} aria-hidden />
              <span>{status === "paused" ? "Paused" : "REC"}</span>
              <span className="text-white/80">{formatClock(ui.elapsedMs)}</span>
            </>
          ) : status === "countdown" ? (
            <span>Starting…</span>
          ) : (
            <>
              <Activity className="size-4" aria-hidden />
              <span>{status === "starting" ? "Starting camera" : "Setup"}</span>
            </>
          )}
          <span className="mx-0.5 h-4 w-px bg-white/25" aria-hidden />
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/80" title="Tracking confidence">
            <span className="size-2 rounded-full" style={{ background: { good: "#30d158", fair: "#ffb020", poor: "#ff453a", none: "#8e8e93" }[ui.quality.label] }} />
            {ui.quality.label === "none" ? "No player" : `${Math.round(ui.quality.score * 100)}%`}
          </span>
        </motion.div>
        <GlassButton variant="dark" size="md" className="!size-12 !p-0" aria-label="Session settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-5" />
        </GlassButton>
      </div>

      {/* phase + stroke counter */}
      {recording && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+70px)] left-3 z-10 flex flex-col gap-2 sm:left-5">
          <span className="glass-dark rounded-full px-3 py-1.5 text-[13px] font-semibold">{PHASE_TEXT[ui.phase]}</span>
          <motion.div key={ui.strokeCount} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={spring} className="glass-dark rounded-[18px] px-3.5 py-2">
            <p className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">{drill ? drill.title : "Strokes"}</p>
            <p className="display text-[28px] leading-none tabular">
              {plan.mode === "drill" ? `${reps}/${plan.drillTarget}` : ui.strokeCount}
            </p>
          </motion.div>
          {plan.mode === "drill" && (
            <div className="flex gap-1.5">
              <button className="glass-dark grid size-10 place-items-center rounded-full" aria-label="Decrease rep count" onClick={() => setDrillAdjust((a) => a - 1)}>
                <Minus className="size-4" />
              </button>
              <button className="glass-dark grid size-10 place-items-center rounded-full" aria-label="Increase rep count" onClick={() => setDrillAdjust((a) => a + 1)}>
                <Plus className="size-4" />
              </button>
            </div>
          )}
          {plan.mode === "focus" && plan.focus && <span className="glass-dark rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)]">Focus: {CATEGORY_LABEL[plan.focus]}</span>}
        </div>
      )}

      {/* coaching cue (one at a time, readable from a distance) */}
      <AnimatePresence>
        {cue && (
          <motion.button
            key={cue.issuedAt}
            onClick={dismissCue}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={spring}
            className="glass-dark absolute top-[calc(env(safe-area-inset-top)+76px)] left-1/2 z-20 max-w-[min(90vw,640px)] -translate-x-1/2 rounded-[26px] px-6 py-4 text-center"
            style={{ borderColor: cueColor, boxShadow: `0 0 0 1px ${cueColor}55, 0 20px 50px rgba(0,0,0,.35)` }}
            aria-live="assertive"
          >
            <span className="display block text-[28px] leading-tight sm:text-[40px]">{cue.text}</span>
            <span className="mt-1 block text-[12px] font-semibold tracking-wide text-white/60 uppercase">
              {cue.category === "setup" ? "Camera" : CATEGORY_LABEL[cue.category as Category]} · {cue.confidence} confidence
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* countdown */}
      <AnimatePresence>
        {status === "countdown" && (
          <motion.div className="absolute inset-0 z-30 grid place-items-center bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.span key={countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} className="display text-[120px] leading-none tabular" aria-live="assertive">
              {countdown}
            </motion.span>
            <GlassButton variant="dark" className="absolute bottom-[calc(env(safe-area-inset-bottom)+40px)]" onClick={cancelCountdown}>
              Cancel
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* camera setup assistant */}
      <AnimatePresence>
        {(status === "setup" || status === "starting") && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={softSpring}
            className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:px-5 landscape:right-0 landscape:left-auto landscape:w-[380px] landscape:max-lg:top-[calc(env(safe-area-inset-top)+70px)]"
          >
            <div className="glass-dark mx-auto max-w-xl rounded-[28px] p-4 landscape:max-h-full landscape:overflow-y-auto">
              <p className="display text-[20px] leading-snug" aria-live="polite">
                {status === "starting" ? "Starting camera and tracking…" : ui.readiness.headline}
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                {ui.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2" title={c.message}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: { pass: "#30d158", warn: "#ffb020", fail: "#ff453a", manual: "#8e8e93", pending: "#8e8e93" }[c.status] }}
                      aria-hidden
                    />
                    <span className={clsx(c.status === "manual" ? "text-white/60" : "text-white/90")}>
                      {c.label}
                      <span className="sr-only">: {c.status === "manual" ? "check manually" : c.status}. {c.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-white/50">Gray items can’t be verified automatically — check them yourself.</p>
              <div className="mt-4 flex items-center gap-2">
                <GlassButton variant="primary" size="lg" className="flex-1" disabled={status !== "setup"} onClick={() => startSession(plan.countdown)}>
                  {ui.readiness.ready ? `Start · ${plan.countdown}s countdown` : "Start anyway"}
                </GlassButton>
                <GlassButton variant="dark" size="lg" className="!px-4" aria-label="Switch camera" onClick={() => setPlan({ facing: plan.facing === "user" ? "environment" : "user" })}>
                  <SwitchCamera className="size-5" />
                </GlassButton>
              </div>
              {visionInfo && (
                <p className="mt-2 text-center text-[11px] text-white/40">
                  On-device tracking · {visionInfo.model} model · {visionInfo.delegate} · {ui.fps} fps
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* recording controls */}
      {recording && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={softSpring}
          className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:px-5"
        >
          <AnimatePresence>
            {panelOpen && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={softSpring} className="glass-dark mx-auto mb-3 max-h-[38dvh] max-w-xl overflow-y-auto rounded-[24px] p-4">
                <p className="text-[12px] font-semibold tracking-wide text-white/55 uppercase">Last stroke</p>
                {ui.lastStroke ? (
                  <div className="mt-1.5">
                    <p className="font-semibold">
                      {STROKE_LABEL[ui.lastStroke.type]} <span className="text-[13px] font-normal text-white/60">· tracking {ui.lastStroke.quality}</span>
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                      {ui.lastStroke.metrics.filter((m) => m.confidence !== "low").slice(0, 6).map((m) => (
                        <div key={m.key} className="rounded-xl bg-white/[0.07] px-3 py-2">
                          <p className="text-white/60">{m.label}</p>
                          <p className="font-semibold tabular">{formatValue(m.value, m.unit)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-white/60">No stroke detected yet. Swing at a natural pace.</p>
                )}
                <p className="mt-4 text-[12px] font-semibold tracking-wide text-white/55 uppercase">Feedback history</p>
                {cueHistory.length ? (
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {cueHistory.map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: SEVERITY_COLOR[c.severity] }} aria-hidden />
                        <span className="tabular text-white/50">{formatClock(c.t)}</span>
                        <span>{c.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-white/60">Cues appear only when the evidence supports them.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
            <div className="flex gap-2">
              <GlassButton variant="dark" className="!size-14 !p-0" aria-label={voiceMode === "quiet" ? "Turn voice cues on" : "Mute voice cues"} onClick={() => setVoiceMode((v) => (v === "quiet" ? "training" : "quiet"))}>
                {voiceMode === "quiet" ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </GlassButton>
              {speechRecognitionSupported() && (
                <GlassButton variant="dark" className={clsx("!size-14 !p-0", listening && "!bg-[var(--accent)]")} aria-label={listening ? "Stop voice commands" : "Start voice commands"} aria-pressed={listening} onClick={toggleListening}>
                  {listening ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </GlassButton>
              )}
            </div>
            <div className="flex items-center gap-3">
              <GlassButton variant="dark" className="!size-14 !p-0" aria-label={status === "paused" ? "Resume" : "Pause"} onClick={status === "paused" ? resume : pause}>
                {status === "paused" ? <Play className="size-6" /> : <Pause className="size-6" />}
              </GlassButton>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={finish}
                disabled={saving}
                aria-label="Stop and save session"
                className="grid size-[76px] place-items-center rounded-full border-[5px] border-white/90 bg-transparent"
              >
                <span className="grid size-[54px] place-items-center rounded-[14px] bg-[#ff453a]">
                  {saving ? <span className="size-6 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Square className="size-5 fill-white" />}
                </span>
              </motion.button>
            </div>
            <GlassButton variant="dark" className="!size-14 !p-0" aria-label={panelOpen ? "Hide coaching panel" : "Show coaching panel"} aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
              {panelOpen ? <ChevronDown className="size-6" /> : <ChevronUp className="size-6" />}
            </GlassButton>
          </div>
        </motion.div>
      )}

      {/* finishing overlay */}
      <AnimatePresence>
        {(status === "finishing" || saving) && (
          <motion.div className="absolute inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center" role="status">
              <span className="mx-auto mb-4 block size-10 animate-spin rounded-full border-[3px] border-white border-r-transparent" />
              <p className="display text-2xl">Analysing your session</p>
              <p className="mt-1 text-white/65">Measuring every stroke on your device…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* errors */}
      {status === "error" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black p-6">
          <div className="max-w-sm text-center" role="alert">
            <p className="display text-2xl">Camera unavailable</p>
            <p className="mt-2 text-white/70">{cameraError}</p>
            <div className="mt-6 flex justify-center gap-2">
              <GlassButton variant="primary" onClick={() => void startCamera()} icon={<RotateCcw className="size-4" />}>
                Try again
              </GlassButton>
              <GlassButton variant="dark" onClick={() => router.push("/analyze")}>
                Upload a video instead
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      {/* paused because the app went to the background */}
      {status === "paused" && (
        <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <GlassButton variant="dark" size="xl" onClick={resume} icon={<Play className="size-6" />}>
            Resume
          </GlassButton>
        </div>
      )}

      <GlassModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Session settings">
        <div className="divide-y divide-[var(--hairline)]">
          <Toggle checked={showSkeleton} onChange={setShowSkeleton} label="Skeleton overlay" />
          <Toggle checked={showAngles} onChange={setShowAngles} label="Joint angles" description="2D image angles — affected by camera perspective." />
          <Toggle checked={mirror} onChange={setMirror} label="Mirror preview" description="Display only; analysis always uses the real orientation." />
          <div className="py-3">
            <p className="mb-2 text-[15px] font-medium">Voice</p>
            <GlassSegmentedControl
              label="Voice mode"
              size="sm"
              value={voiceMode}
              onChange={(v) => {
                setVoiceMode(v);
                void saveSettings({ voiceMode: v });
              }}
              segments={[{ value: "quiet", label: "Quiet" }, { value: "training", label: "Training" }, { value: "coach", label: "Coach" }, { value: "review", label: "Review" }]}
            />
            <p className="mt-2 text-sm text-fg-2">
              {voiceMode === "quiet" && "Visual feedback only."}
              {voiceMode === "training" && "Short spoken cues between repetitions."}
              {voiceMode === "coach" && "Spoken cues plus a conversational AI coach you can talk to."}
              {voiceMode === "review" && "No cues while practising; a spoken summary when you stop."}
            </p>
            {voiceMode === "coach" && (
              <GlassButton className="mt-3" variant={coachConnected ? "secondary" : "primary"} size="sm" onClick={connectCoach} disabled={!server?.realtime && !coachConnected}>
                {coachConnected ? "Disconnect voice coach" : server?.realtime ? "Connect conversational coach" : "Conversational coach not enabled on this server"}
              </GlassButton>
            )}
          </div>
          <div className="py-3">
            <p className="mb-2 text-[15px] font-medium">Mute feedback about…</p>
            <div className="flex flex-wrap gap-2">
              {(["preparation", "rotation", "legs", "balance", "follow_through", "arm", "recovery", "serve_toss"] as Category[]).map((c) => (
                <Chip key={c} selected={muted.includes(c)} onClick={() => setMuted(muted.includes(c) ? muted.filter((x) => x !== c) : [...muted, c])}>
                  {CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="py-3 text-sm text-fg-2">
            {visionInfo ? `Tracking: ${visionInfo.model} model on ${visionInfo.delegate}, ~${ui.inferenceMs} ms per frame, ${ui.fps} analysed fps.` : "Tracking not started."}
          </div>
        </div>
      </GlassModal>
    </div>
  );
}

function TopBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-3 text-white sm:px-5">
      <GlassButton variant="dark" className="!size-11 !p-0" aria-label="Back" onClick={onBack}>
        <ChevronLeft className="size-6" />
      </GlassButton>
      <span className="text-[17px] font-semibold">{title}</span>
    </div>
  );
}
