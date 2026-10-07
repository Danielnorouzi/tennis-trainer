"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { FileVideo, FlipHorizontal, ShieldCheck, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { GlassButton, GlassCard, GlassSegmentedControl, softSpring } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { Chip, PageHeader, Section, Toggle } from "@/components/ui";
import { finalizeCapture } from "@/lib/analysis/finalize";
import { processVideo, validateVideoFile, VideoValidationError, type ProcessProgress } from "@/lib/analysis/process-video";
import { useSettings, useStore, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { SELECTION_LABEL, VIEW_GUIDES } from "@/lib/tennis/labels";
import type { CameraView, SessionStrokeSelection } from "@/lib/tennis/types";

function fmtBytes(n: number) {
  return n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

export default function AnalyzePage() {
  const store = useStore();
  const router = useRouter();
  const toast = useToast();
  const { settings } = useSettings();
  const profile = useStoreQuery((s) => s.getProfile());
  const recent = useStoreQuery(async (s) => (await s.listSessions()).filter((x) => x.source === "upload").slice(0, 4));
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<{ duration: number; w: number; h: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<SessionStrokeSelection>("auto");
  const [view, setView] = useState<CameraView>(settings.defaultView);
  const [mirrored, setMirrored] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback((f: File | undefined | null) => {
    setError(null);
    setMeta(null);
    if (!f) return;
    try {
      validateVideoFile(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid file");
      return;
    }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    v.onloadedmetadata = () => setMeta({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => setError("This browser can’t decode the video (some iPhone HEVC .mov files only play in Safari). Try exporting as MP4 (H.264).");
  }, [preview]);

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setMeta(null);
    setError(null);
  };

  const run = async () => {
    if (!file || !store) return;
    setError(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ phase: "loading_model", fraction: 0 });
    try {
      const handedness = profile.data?.handedness ?? "right";
      const processed = await processVideo(file, { handedness, mirrored, signal: ctrl.signal, onProgress: setProgress });
      const id = uid("sess");
      const session = await finalizeCapture(
        store,
        {
          id,
          source: "upload",
          mode: "standard",
          selection,
          view,
          handedness,
          mirrored,
          focus: null,
          drillId: null,
          startedAt: file.lastModified || Date.now(),
          durationMs: processed.durationMs,
          poseFrames: processed.poseFrames,
          features: processed.features,
          liveKeyFrames: [],
          recording: file,
          videoSize: processed.size,
          liveCues: [],
          extractKeyFrames: processed.extractKeyFrames,
        },
        settings,
      );
      processed.dispose();
      if (!session.strokes.length) {
        toast({ tone: "warning", title: "No strokes detected", body: processed.features.some((f) => f.valid) ? "The player was tracked but no swings were found. Try selecting the stroke type or a clip with full swings." : "No person was detected. Make sure the whole body is visible." });
      }
      router.push(`/analyze/${session.id}?fresh=1`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast({ tone: "info", title: "Analysis cancelled" });
      } else {
        setError(e instanceof VideoValidationError || e instanceof Error ? e.message : "Analysis failed.");
      }
      setProgress(null);
    }
  };

  const phaseLabel = progress?.phase === "loading_model" ? "Loading the pose model…" : progress?.phase === "tracking" ? "Tracking your movement frame by frame…" : "Measuring strokes…";

  return (
    <div>
      <PageHeader eyebrow="Analyze" title="Video analysis" subtitle="Upload a clip from your camera roll. Tracking runs on this device — the video itself is never sent to the AI." />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div key="drop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={softSpring}>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    choose(e.dataTransfer.files?.[0]);
                  }}
                  className={clsx(
                    "glass flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed p-8 text-center transition-colors",
                    dragging ? "border-accent bg-accent-soft" : "border-[var(--hairline)]",
                  )}
                >
                  <span className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent">
                    <Upload className="size-7" />
                  </span>
                  <span className="display mt-5 text-2xl">Drop a video here</span>
                  <span className="mt-2 text-fg-2">or choose from your files or photo library</span>
                  <span className="mt-4 text-sm text-fg-3">MP4, MOV, M4V or WebM · up to 1 GB · up to 10 minutes</span>
                  <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} aria-label="Choose a video file" />
                </label>
              </motion.div>
            ) : (
              <motion.div key="file" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={softSpring}>
                <GlassCard>
                  <div className="relative overflow-hidden rounded-2xl bg-black">
                    {preview && <video src={preview} controls playsInline muted className="aspect-video w-full object-contain" style={{ transform: mirrored ? "scaleX(-1)" : undefined }} />}
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileVideo className="mt-0.5 size-5 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{file.name}</p>
                        <p className="text-sm text-fg-2 tabular">
                          {fmtBytes(file.size)}
                          {meta && ` · ${meta.duration.toFixed(1)} s · ${meta.w}×${meta.h}`}
                        </p>
                      </div>
                    </div>
                    {!progress && (
                      <GlassButton variant="ghost" size="sm" className="!size-9 !p-0" aria-label="Remove video" onClick={clear}>
                        <X className="size-4" />
                      </GlassButton>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-issue-soft px-4 py-3 text-sm font-medium text-issue">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <GlassCard>
            <p className="mb-2 text-[15px] font-semibold">Stroke</p>
            <div className="flex flex-wrap gap-2">
              {(["auto", "forehand", "backhand", "serve", "volley", "footwork"] as SessionStrokeSelection[]).map((s) => (
                <Chip key={s} selected={selection === s} onClick={() => setSelection(s)}>
                  {SELECTION_LABEL[s]}
                </Chip>
              ))}
            </div>
            <p className="mt-4 mb-2 text-[15px] font-semibold">Camera angle in this video</p>
            <GlassSegmentedControl label="Camera angle" value={view} onChange={setView} segments={[{ value: "side", label: "Side" }, { value: "front", label: "Front" }, { value: "rear", label: "Behind" }, { value: "diagonal", label: "Diagonal" }]} />
            <p className="mt-2 text-sm text-fg-3">Best for: {VIEW_GUIDES[view].bestFor.slice(0, 3).join(", ")}.</p>
            <div className="mt-2 border-t border-[var(--hairline)]">
              <Toggle checked={mirrored} onChange={setMirrored} label="Video is mirrored" description={<span className="inline-flex items-center gap-1"><FlipHorizontal className="size-3.5" /> Turn on for selfie-camera clips saved mirrored, so your hitting hand is read correctly.</span>} />
            </div>
          </GlassCard>

          <AnimatePresence mode="wait">
            {progress ? (
              <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <GlassCard role="status" aria-live="polite">
                  <p className="font-semibold">{phaseLabel}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--hairline)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
                    <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.max(3, progress.fraction * 100)}%` }} transition={{ ease: "linear", duration: 0.2 }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-fg-2">
                    <span className="tabular">{Math.round(progress.fraction * 100)}%</span>
                    <GlassButton variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
                      Cancel
                    </GlassButton>
                  </div>
                  <p className="mt-2 text-xs text-fg-3">Keep this tab open. Processing speed depends on your device.</p>
                </GlassCard>
              </motion.div>
            ) : (
              <motion.div key="go">
                <GlassButton variant="primary" size="xl" className="w-full" disabled={!file || !!error || !store} onClick={run} icon={<FileVideo className="size-5" />}>
                  Analyze video
                </GlassButton>
              </motion.div>
            )}
          </AnimatePresence>

          <GlassCard className="flex gap-3 !p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
            <p className="text-sm text-fg-2">
              The video is analysed on your device and stored {settings.retention === "never_record" ? "nowhere — only the measurements are kept" : "privately on this device"}
              {settings.cloudVideo ? " (and in your private cloud storage when signed in)" : ""}. If AI analysis is on, only a few small key frames are shared.
            </p>
          </GlassCard>
        </div>
      </div>

      {recent.data && recent.data.length > 0 && (
        <Section title="Recent video analyses">
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.data.map((s) => (
              <GlassCard key={s.id} interactive onClick={() => router.push(`/analyze/${s.id}`)} className="!p-4">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-fg-2">{s.strokes.length} strokes · {s.report ? "AI report" : "on-device report"}</p>
              </GlassCard>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
