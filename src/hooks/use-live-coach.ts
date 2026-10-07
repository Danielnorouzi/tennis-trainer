"use client";

// The live coaching engine: camera → pose (MediaPipe, on-device) → smoothing → features →
// streaming stroke segmentation → evidence-gated rules → cue scheduler → voice/visual cues.
//
// Performance notes:
// - The per-frame loop lives in refs, never in React state. The UI is published ~8×/s.
// - Inference rate adapts to the device (measured detect time); rendering the <video> is never
//   blocked by inference or by any network request.
// - requestVideoFrameCallback is used where available so we only process new camera frames.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CueScheduler, type IssuedCue } from "@/lib/cv/cues";
import { FeatureTracker, type FeatureFrame } from "@/lib/cv/features";
import { FrameRing } from "@/lib/cv/keyframes";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { LM } from "@/lib/cv/landmarks";
import { CATEGORY_JOINTS, contentRect, drawOverlay } from "@/lib/cv/overlay";
import { buildStroke } from "@/lib/cv/pipeline";
import { evaluateSetup, readiness, trackingQuality, type SetupCheck } from "@/lib/cv/quality";
import { evaluateStroke, getRule } from "@/lib/cv/rules";
import { LiveSegmenter, type LivePhase } from "@/lib/cv/segmentation";
import { PoseSmoother } from "@/lib/cv/smoothing";
import { createSceneMeter, loadVision, nextTimestamp, toPoseFrame, type Vision, type VisionInfo } from "@/lib/cv/vision";
import { SessionRecorder } from "@/lib/media/recorder";
import type { KeyFrame, StrokeRecord } from "@/lib/data/types";
import type { CameraView, Category, Handedness, SessionStrokeSelection, Severity } from "@/lib/tennis/types";
import { CUES } from "@/lib/cv/config";

export type EngineStatus = "idle" | "starting" | "setup" | "countdown" | "recording" | "paused" | "finishing" | "error";

export interface LiveConfig {
  selection: SessionStrokeSelection;
  view: CameraView;
  handedness: Handedness;
  facing: "user" | "environment";
  resolution: "720p" | "1080p" | "480p";
  mirror: boolean;
  showSkeleton: boolean;
  showAngles: boolean;
  record: boolean;
  focus: Category | null;
  mutedCategories: string[];
  speak: (text: string) => void;
  isSpeaking: () => boolean;
}

export interface LiveUiState {
  fps: number;
  inferenceMs: number;
  quality: { score: number; label: "good" | "fair" | "poor" | "none" };
  phase: LivePhase;
  checks: SetupCheck[];
  readiness: { ready: boolean; headline: string };
  strokeCount: number;
  elapsedMs: number;
  lastStroke: StrokeRecord | null;
}

export interface CueEvent {
  t: number;
  text: string;
  category: string;
  severity: Severity;
}

export interface LiveResult {
  startedAt: number;
  durationMs: number;
  poseFrames: PoseFrame[];
  features: FeatureFrame[];
  liveKeyFrames: { contactT: number; frames: KeyFrame[] }[];
  recording: Blob | null;
  videoSize: { w: number; h: number } | null;
  cues: CueEvent[];
}

const RES = { "480p": { width: 854, height: 480 }, "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } };

function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow camera permission in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  if (typeof window !== "undefined" && !window.isSecureContext) return "Camera access needs a secure (https) connection.";
  return e instanceof Error ? e.message : "The camera could not be started.";
}

export function useLiveCoach(cfg: LiveConfig) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The frame loop reads the latest config through a ref (synced after each render).
  const cfgRef = useRef(cfg);
  useLayoutEffect(() => {
    cfgRef.current = cfg;
  });

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [visionInfo, setVisionInfo] = useState<VisionInfo | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [cue, setCue] = useState<(IssuedCue & { severity: Severity }) | null>(null);
  const [cueHistory, setCueHistory] = useState<CueEvent[]>([]);
  const [ui, setUi] = useState<LiveUiState>({
    fps: 0, inferenceMs: 0, quality: { score: 0, label: "none" }, phase: "setup", checks: [],
    readiness: { ready: false, headline: "Starting camera…" }, strokeCount: 0, elapsedMs: 0, lastStroke: null,
  });

  // Everything the frame loop touches.
  const L = useRef({
    running: false,
    stream: null as MediaStream | null,
    vision: null as Vision | null,
    handle: 0,
    lastInfer: 0,
    interval: 33,
    detectMs: 0,
    frames: 0,
    fpsSince: 0,
    fps: 0,
    lastUi: 0,
    smoother: new PoseSmoother(),
    tracker: new FeatureTracker({ handedness: "right", aspect: 16 / 9 }),
    segmenter: new LiveSegmenter(),
    scheduler: new CueScheduler(),
    ring: new FrameRing(),
    scene: null as ReturnType<typeof createSceneMeter> | null,
    lastScene: 0,
    luma: null as number | null,
    motion: null as number | null,
    recent: [] as FeatureFrame[],
    lastPose: null as PoseFrame | null,
    trail: [] as { x: number; y: number }[],
    // session
    recording: false,
    paused: false,
    sessionStart: 0,
    pausedTotal: 0,
    pausedAt: 0,
    poseFrames: [] as PoseFrame[],
    features: [] as FeatureFrame[],
    strokes: [] as StrokeRecord[],
    keyFrames: [] as { contactT: number; frames: KeyFrame[] }[],
    recorder: null as SessionRecorder | null,
    cues: [] as CueEvent[],
    pulseAt: 0,
    highlight: null as { joints: number[]; severity: Severity } | null,
    highlightUntil: 0,
    poorSince: null as number | null,
    countdownTimer: 0 as ReturnType<typeof setInterval> | 0,
  });

  // keep scheduler filters in sync with config
  useEffect(() => {
    L.current.scheduler.setMuted(cfg.mutedCategories);
    L.current.scheduler.setFocus(cfg.focus);
  }, [cfg.mutedCategories, cfg.focus]);
  useEffect(() => {
    L.current.tracker.setContext({ handedness: cfg.handedness });
  }, [cfg.handedness]);

  const sessionTime = (now: number) => now - L.current.sessionStart - L.current.pausedTotal;

  const issueCue = useCallback((c: IssuedCue) => {
    const l = L.current;
    const rule = getRule(c.key);
    const severity: Severity = c.category === "setup" ? "insufficient" : c.confidence === "high" && c.priority === "high" ? "issue" : "watch";
    const t = l.recording ? sessionTime(performance.now()) : 0;
    const ev: CueEvent = { t, text: c.text, category: c.category, severity };
    l.cues.push(ev);
    setCue({ ...c, severity });
    setCueHistory((h) => [ev, ...h].slice(0, 20));
    if (rule) {
      const joints = CATEGORY_JOINTS[rule.category]?.(cfgRef.current.handedness) ?? [];
      l.highlight = { joints, severity };
      l.highlightUntil = performance.now() + 5000;
    }
    cfgRef.current.speak(c.text);
  }, []);

  const onStroke = useCallback((w: ReturnType<LiveSegmenter["push"]>[number]) => {
    const l = L.current;
    const c = cfgRef.current;
    const stroke = buildStroke(l.features, w, { view: c.view, selection: c.selection }, l.strokes.length);
    l.strokes.push(stroke);
    l.pulseAt = performance.now();
    const frames = l.ring.keyFramesFor(w);
    if (frames.length) l.keyFrames.push({ contactT: w.contactT, frames });
    // Live cues only from single-stroke rule hits with at least medium confidence.
    for (const h of evaluateStroke({ id: stroke.id, type: stroke.type, t0: stroke.t0, t1: stroke.t1, contactT: stroke.contactT, metrics: stroke.metrics, recoveryObserved: stroke.recoveryObserved })) {
      const rule = getRule(h.ruleId);
      if (!rule) continue;
      l.scheduler.offer({ key: rule.id, text: rule.cue, category: rule.category, priority: rule.basePriority, confidence: h.hit.confidence, at: performance.now() });
    }
    setUi((u) => ({ ...u, strokeCount: l.strokes.length, lastStroke: stroke }));
  }, []);

  const tick = useCallback(() => {
    const l = L.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!l.running || !video || !canvas || !l.vision) return;
    const now = performance.now();
    const c = cfgRef.current;

    if (video.readyState >= 2 && now - l.lastInfer >= l.interval) {
      l.lastInfer = now;
      const t0 = performance.now();
      const result = l.vision.landmarker.detectForVideo(video, nextTimestamp());
      l.detectMs = 0.8 * l.detectMs + 0.2 * (performance.now() - t0);
      // adapt: leave headroom so rendering stays smooth (target 15–60 Hz inference)
      l.interval = Math.min(66, Math.max(16, l.detectMs * 1.3));
      l.frames += 1;

      const tSession = l.recording && !l.paused ? sessionTime(now) : now;
      const raw = toPoseFrame(result, tSession);
      const aspect = video.videoWidth / Math.max(1, video.videoHeight);
      l.tracker.setContext({ aspect });
      if (raw) {
        const pose = l.smoother.smooth(raw);
        l.lastPose = pose;
        const f = l.tracker.push(pose);
        l.recent.push(f);
        while (l.recent.length && f.t - l.recent[0].t > 1500) l.recent.shift();
        const domWrist = pose.image[c.handedness === "right" ? LM.rightWrist : LM.leftWrist];
        if (domWrist.v > 0.5) {
          l.trail.push({ x: domWrist.x, y: domWrist.y });
          if (l.trail.length > 14) l.trail.shift();
        }
        if (l.recording && !l.paused) {
          l.poseFrames.push(pose);
          l.features.push(f);
          for (const w of l.segmenter.push(f)) onStroke(w);
        }
      } else {
        l.lastPose = null;
        l.trail = [];
        l.recent.push({ t: tSession, valid: false, vis: { core: 0, arms: 0, legs: 0, feet: 0, overall: 0, inFrame: 0 }, people: 0 } as FeatureFrame);
        while (l.recent.length > 1 && tSession - l.recent[0].t > 1500) l.recent.shift();
      }
      if (l.recording && !l.paused) l.ring.capture(video, sessionTime(now));
    }

    // scene meter (lighting / camera motion) twice a second
    if (now - l.lastScene > 500 && l.scene && video.readyState >= 2) {
      l.lastScene = now;
      const last = l.recent[l.recent.length - 1];
      const m = l.scene(video, last?.valid ? last.bbox : null);
      l.luma = m.luma;
      l.motion = m.motion;
    }

    // tracking-quality cue during recording
    const q = trackingQuality(l.recent);
    if (l.recording && !l.paused) {
      if (q.label === "poor" || q.label === "none") {
        l.poorSince ??= now;
        if (now - l.poorSince > CUES.qualityPersistMs) {
          l.scheduler.offer({ key: "quality", text: q.label === "none" ? "I can't see you. Step back into the frame." : "Tracking is weak. Check the lighting and camera position.", category: "setup", priority: "high", confidence: "high", at: now });
        }
      } else l.poorSince = null;
      const busy = l.segmenter.livePhase === "swing" || l.segmenter.livePhase === "follow_through" || c.isSpeaking();
      const next = l.scheduler.next(now, busy);
      if (next) issueCue(next);
    }

    // overlay
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (now > l.highlightUntil) l.highlight = null;
      const pulse = Math.max(0, 1 - (now - l.pulseAt) / 600);
      drawOverlay(ctx, l.lastPose?.image ?? null, {
        width: W, height: H, mirror: c.mirror, handedness: c.handedness, showSkeleton: c.showSkeleton, showAngles: c.showAngles,
        highlight: l.highlight, trail: l.trail, quality: q.score, pulse,
        content: contentRect(W, H, video.videoWidth, video.videoHeight, "cover"),
      });
    }

    // publish UI state ~8×/s
    if (now - l.lastUi > 125) {
      if (now - l.fpsSince >= 1000) {
        l.fps = Math.round((l.frames * 1000) / (now - l.fpsSince));
        l.frames = 0;
        l.fpsSince = now;
      }
      l.lastUi = now;
      const checks = evaluateSetup({ recent: l.recent, luma: l.luma, backgroundMotion: l.motion });
      setUi((u) => ({
        ...u,
        fps: l.fps,
        inferenceMs: Math.round(l.detectMs),
        quality: q,
        phase: l.recording ? l.segmenter.livePhase : "setup",
        checks,
        readiness: readiness(checks),
        elapsedMs: l.recording ? sessionTime(l.paused ? l.pausedAt : now) : 0,
      }));
    }
  }, [issueCue, onStroke]);

  const schedule = useCallback(() => {
    const l = L.current;
    const video = videoRef.current;
    if (!l.running || !video) return;
    const request = () => {
      l.handle = "requestVideoFrameCallback" in video ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    function loop() {
      if (!L.current.running) return;
      tick();
      request();
    }
    request();
  }, [tick]);

  const stopLoop = useCallback(() => {
    const l = L.current;
    l.running = false;
    const video = videoRef.current;
    if (video && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(l.handle);
    cancelAnimationFrame(l.handle);
  }, []);

  const releaseCamera = useCallback(() => {
    const l = L.current;
    stopLoop();
    l.stream?.getTracks().forEach((t) => t.stop());
    l.stream = null;
    if (l.countdownTimer) clearInterval(l.countdownTimer);
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, [stopLoop]);

  /** Start (or restart with new camera options) the camera and tracking. */
  const startCamera = useCallback(async () => {
    const l = L.current;
    const c = cfgRef.current;
    setError(null);
    setStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser doesn't support camera access. Try Safari, Chrome or Edge.");
      releaseCamera();
      const res = RES[c.resolution];
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: c.facing, width: { ideal: res.width }, height: { ideal: res.height }, frameRate: { ideal: 30, max: 60 } },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        else throw e;
      }
      l.stream = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const vision = await loadVision(video);
      l.vision = vision;
      setVisionInfo(vision.info);
      l.scene = createSceneMeter();
      l.smoother.reset();
      l.tracker.reset();
      l.recent = [];
      l.running = true;
      l.fpsSince = performance.now();
      setStatus(l.recording ? (l.paused ? "paused" : "recording") : "setup");
      schedule();
    } catch (e) {
      releaseCamera();
      setStatus("error");
      setError(cameraErrorMessage(e));
    }
  }, [releaseCamera, schedule]);

  const beginRecording = useCallback(() => {
    const l = L.current;
    l.recording = true;
    l.paused = false;
    l.sessionStart = performance.now();
    l.pausedTotal = 0;
    l.poseFrames = [];
    l.features = [];
    l.strokes = [];
    l.keyFrames = [];
    l.cues = [];
    l.segmenter.reset();
    l.ring.clear();
    l.smoother.reset();
    l.tracker.reset();
    l.recorder = null;
    if (cfgRef.current.record && l.stream) {
      try {
        l.recorder = new SessionRecorder(l.stream);
        l.recorder.start();
      } catch {
        l.recorder = null; // recording unsupported: analysis still works from the live pose trace
      }
    }
    setCueHistory([]);
    setUi((u) => ({ ...u, strokeCount: 0, lastStroke: null, elapsedMs: 0 }));
    setStatus("recording");
  }, []);

  /** Countdown, then start recording + analysis. */
  const startSession = useCallback((seconds = 5) => {
    const l = L.current;
    if (seconds <= 0) {
      beginRecording();
      return;
    }
    setCountdown(seconds);
    setStatus("countdown");
    let left = seconds;
    l.countdownTimer = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left > 0 && left <= 3) cfgRef.current.speak(String(left));
      if (left <= 0) {
        clearInterval(l.countdownTimer);
        l.countdownTimer = 0;
        cfgRef.current.speak("Go");
        beginRecording();
      }
    }, 1000);
  }, [beginRecording]);

  const cancelCountdown = useCallback(() => {
    const l = L.current;
    if (l.countdownTimer) clearInterval(l.countdownTimer);
    l.countdownTimer = 0;
    setStatus("setup");
  }, []);

  const pause = useCallback(() => {
    const l = L.current;
    if (!l.recording || l.paused) return;
    l.paused = true;
    l.pausedAt = performance.now();
    l.recorder?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    const l = L.current;
    if (!l.recording || !l.paused) return;
    l.pausedTotal += performance.now() - l.pausedAt;
    l.paused = false;
    l.recorder?.resume();
    l.smoother.reset();
    setStatus("recording");
  }, []);

  /** Stop the session and hand back everything captured. */
  const stopSession = useCallback(async (): Promise<LiveResult | null> => {
    const l = L.current;
    if (!l.recording) return null;
    if (l.paused) resume();
    setStatus("finishing");
    const durationMs = sessionTime(performance.now());
    l.recording = false;
    const recording = l.recorder ? await l.recorder.stop() : null;
    const video = videoRef.current;
    const result: LiveResult = {
      startedAt: Date.now() - durationMs,
      durationMs,
      poseFrames: l.poseFrames,
      features: l.features,
      liveKeyFrames: l.keyFrames,
      recording,
      videoSize: video ? { w: video.videoWidth, h: video.videoHeight } : null,
      cues: l.cues,
    };
    releaseCamera();
    return result;
  }, [releaseCamera, resume]);

  /** Discard the current session without saving. */
  const discardSession = useCallback(async () => {
    const l = L.current;
    l.recording = false;
    await l.recorder?.stop();
    l.recorder = null;
    setStatus(l.running ? "setup" : "idle");
  }, []);

  // Browsers stop or throttle the camera in background tabs (always on iOS): pause the session.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && L.current.recording && !L.current.paused) pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  useEffect(() => () => releaseCamera(), [releaseCamera]);

  const dismissCue = useCallback(() => setCue(null), []);
  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setCue(null), 6000);
    return () => clearTimeout(t);
  }, [cue]);

  return {
    videoRef, canvasRef, status, error, ui, countdown, cue, cueHistory, visionInfo,
    startCamera, startSession, cancelCountdown, pause, resume, stopSession, discardSession, releaseCamera, dismissCue,
  };
}
