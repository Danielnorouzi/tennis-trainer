"use client";

// Interactive review player: recording (or a pose-only replay when no video was kept) with the
// skeleton overlay synced from the stored pose trace, phase-coloured timeline, annotation
// markers, slow motion, frame stepping, jump-to-stroke, fullscreen and frame screenshots.

import { clsx } from "clsx";
import { Camera, ChevronsLeft, ChevronsRight, Maximize, Pause, Play, SkipBack, SkipForward, User } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { GlassButton, GlassSegmentedControl } from "../glass/glass";
import { contentRect, drawOverlay } from "@/lib/cv/overlay";
import { frameAt } from "@/lib/cv/trace";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { LM } from "@/lib/cv/landmarks";
import type { StrokeRecord } from "@/lib/data/types";
import { PHASE_COLOR, PHASE_LABEL, STROKE_LABEL, formatStamp } from "@/lib/tennis/labels";
import type { Handedness, Severity } from "@/lib/tennis/types";
import { SEVERITY_COLOR } from "@/lib/cv/overlay";

export interface Marker {
  t: number;
  label: string;
  severity: Severity;
}

export interface ReviewPlayerHandle {
  seek: (ms: number) => void;
  play: () => void;
}

interface Props {
  src: string | null;
  trace: PoseFrame[] | null;
  durationMs: number;
  strokes: StrokeRecord[];
  markers: Marker[];
  handedness: Handedness;
  /** offset applied to the media clock (ms), e.g. for manual alignment in compare */
  offsetMs?: number;
  compact?: boolean;
  /** restrict playback to a window (compare mode) */
  window?: { start: number; end: number } | null;
  onTime?: (ms: number) => void;
  label?: string;
}

const FRAME_MS = 1000 / 30;

export const ReviewPlayer = forwardRef<ReviewPlayerHandle, Props>(function ReviewPlayer(
  { src, trace, durationMs, strokes, markers, handedness, offsetMs = 0, compact, window: win, onTime, label },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(win?.start ?? 0);
  const [rate, setRate] = useState("1");
  const [skeleton, setSkeleton] = useState(true);
  const raf = useRef(0);
  const poseClock = useRef<{ start: number; from: number } | null>(null);
  const tRef = useRef(t);
  const total = durationMs;

  const draw = useCallback((ms: number) => {
    const c = canvas.current;
    const el = box.current;
    if (!c || !el) return;
    const r = el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const v = video.current;
    const f = trace ? frameAt(trace, ms) : null;
    const usable = f && Math.abs(f.t - ms) < 250 ? f : null;
    const vw = v?.videoWidth || 16;
    const vh = v?.videoHeight || 9;
    // trail of the hitting wrist over the last ~400 ms
    const trail: { x: number; y: number }[] = [];
    if (trace && usable) {
      const wi = handedness === "right" ? LM.rightWrist : LM.leftWrist;
      for (let k = 12; k >= 0; k--) {
        const p = frameAt(trace, ms - k * 33)?.image[wi];
        if (p && p.v > 0.5) trail.push({ x: p.x, y: p.y });
      }
    }
    const marker = markers.find((m) => Math.abs(m.t - ms) < 600);
    drawOverlay(ctx, skeleton ? (usable?.image ?? null) : null, {
      width: W,
      height: H,
      mirror: false,
      handedness,
      showSkeleton: true,
      showAngles: true,
      trail,
      highlight: marker ? { joints: [], severity: marker.severity } : null,
      content: contentRect(W, H, vw, vh, "contain"),
    });
  }, [trace, handedness, skeleton, markers]);

  const setTime = useCallback((ms: number) => {
    tRef.current = ms;
    setT(ms);
    onTime?.(ms);
    draw(ms);
  }, [draw, onTime]);

  // media clock → overlay
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    let handle = 0;
    const step = () => {
      const ms = v.currentTime * 1000 + offsetMs;
      if (win && ms >= win.end) {
        v.pause();
      }
      setTime(ms);
      handle = "requestVideoFrameCallback" in v ? v.requestVideoFrameCallback(step) : requestAnimationFrame(step);
    };
    handle = "requestVideoFrameCallback" in v ? v.requestVideoFrameCallback(step) : requestAnimationFrame(step);
    return () => {
      if ("cancelVideoFrameCallback" in v) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(handle);
    };
  }, [src, offsetMs, setTime, win]);

  // pose-only replay clock (no recording)
  useEffect(() => {
    if (src || !playing) return;
    poseClock.current = { start: performance.now(), from: tRef.current };
    const loop = () => {
      const pc = poseClock.current!;
      const ms = pc.from + (performance.now() - pc.start) * Number(rate);
      const end = win?.end ?? total;
      if (ms >= end) {
        setPlaying(false);
        setTime(end);
        return;
      }
      setTime(ms);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [src, playing, rate, total, win, setTime]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = Number(rate);
  }, [rate]);
  useEffect(() => {
    draw(tRef.current);
  }, [draw, skeleton]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw(tRef.current));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [draw]);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(win?.start ?? 0, Math.min(win?.end ?? total, ms));
    if (src && video.current) video.current.currentTime = Math.max(0, (clamped - offsetMs) / 1000);
    if (!src && poseClock.current) poseClock.current = { start: performance.now(), from: clamped };
    setTime(clamped);
  }, [src, total, offsetMs, setTime, win]);

  const play = useCallback(() => {
    if (win && tRef.current >= win.end - 30) seek(win.start);
    if (src) void video.current?.play();
    else setPlaying(true);
  }, [src, win, seek]);

  const pause = useCallback(() => {
    if (src) video.current?.pause();
    else setPlaying(false);
  }, [src]);

  useImperativeHandle(ref, () => ({ seek, play }), [seek, play]);

  const stepFrame = (dir: 1 | -1) => {
    pause();
    seek(tRef.current + dir * FRAME_MS);
  };
  const jumpStroke = (dir: 1 | -1) => {
    const list = strokes.filter((s) => !s.excluded).map((s) => s.t0);
    const target = dir > 0 ? list.find((x) => x > tRef.current + 100) : [...list].reverse().find((x) => x < tRef.current - 300);
    if (target !== undefined) seek(target);
  };
  const fullscreen = () => {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) void el.requestFullscreen();
    else if (video.current && "webkitEnterFullscreen" in video.current) (video.current as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
  };
  const screenshot = () => {
    const v = video.current;
    const c = document.createElement("canvas");
    const w = v?.videoWidth || canvas.current?.width || 1280;
    const h = v?.videoHeight || canvas.current?.height || 720;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (v && src) ctx.drawImage(v, 0, 0, w, h);
    const f = trace ? frameAt(trace, tRef.current) : null;
    if (f && skeleton) drawOverlay(ctx, f.image, { width: w, height: h, mirror: false, handedness, showSkeleton: true, showAngles: true });
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `rally-frame-${formatStamp(tRef.current).replace(/[:.]/g, "-")}.png`;
    a.click();
  };

  const isPlaying = playing;
  const currentStroke = strokes.find((s) => !s.excluded && t >= s.t0 && t <= s.t1);
  const currentPhase = currentStroke?.phases.find((p) => t >= p.start && t <= p.end);
  const span = { start: win?.start ?? 0, end: win?.end ?? Math.max(1, total) };
  const pct = (ms: number) => `${((ms - span.start) / (span.end - span.start)) * 100}%`;

  return (
    <div className="w-full">
      <div ref={box} className={clsx("relative w-full overflow-hidden rounded-[22px] bg-black", compact ? "aspect-video" : "aspect-video max-h-[70dvh]")}>
        {src ? (
          <video
            ref={video}
            src={src}
            playsInline
            muted
            preload="auto"
            className="absolute inset-0 size-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            aria-label={label ?? "Session recording"}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#1d2a22,#050605)]">
            {!trace && (
              <p className="flex items-center gap-2 text-sm text-white/60">
                <User className="size-4" /> No recording or pose data stored for this session.
              </p>
            )}
          </div>
        )}
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
          {!src && trace && <span className="glass-dark rounded-full px-2.5 py-1 text-[11px] font-semibold">Pose replay (no video kept)</span>}
          {currentStroke && (
            <span className="glass-dark rounded-full px-2.5 py-1 text-[12px] font-semibold">
              #{currentStroke.index + 1} {STROKE_LABEL[currentStroke.type]}
              {currentPhase && (
                <>
                  {" · "}
                  <span style={{ color: PHASE_COLOR[currentPhase.name] }}>
                    {PHASE_LABEL[currentPhase.name]}
                    {currentPhase.estimated ? " ≈" : ""}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white tabular">{formatStamp(t)}</span>
      </div>

      {/* timeline */}
      <div className="relative mt-3 px-1">
        <div className="relative h-3">
          {strokes.filter((s) => !s.excluded).flatMap((s) =>
            s.phases.map((p) => (
              <span
                key={`${s.id}-${p.name}`}
                className="absolute top-0 h-3 rounded-sm"
                style={{ left: pct(Math.max(span.start, p.start)), width: `calc(${pct(Math.min(span.end, p.end))} - ${pct(Math.max(span.start, p.start))})`, background: PHASE_COLOR[p.name], opacity: p.estimated ? 0.55 : 0.9 }}
                title={`${STROKE_LABEL[s.type]} · ${PHASE_LABEL[p.name]}${p.estimated ? " (approximate)" : ""}`}
              />
            )),
          )}
          {markers.map((m, i) => (
            <button
              key={i}
              onClick={() => seek(m.t)}
              className="absolute -top-1.5 size-6 -translate-x-1/2 rounded-full border-2 border-white shadow"
              style={{ left: pct(m.t), background: SEVERITY_COLOR[m.severity] }}
              aria-label={`Jump to ${formatStamp(m.t)}: ${m.label}`}
              title={m.label}
            />
          ))}
        </div>
        <input
          type="range"
          className="scrubber mt-1"
          min={span.start}
          max={span.end}
          step={FRAME_MS}
          value={Math.min(span.end, Math.max(span.start, t))}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Timeline"
          aria-valuetext={formatStamp(t)}
        />
      </div>

      {/* controls */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Previous stroke" onClick={() => jumpStroke(-1)}>
            <SkipBack className="size-4" />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Previous frame" onClick={() => stepFrame(-1)}>
            <ChevronsLeft className="size-5" />
          </GlassButton>
          <GlassButton variant="secondary" size="md" className="!size-12 !p-0" aria-label={isPlaying ? "Pause" : "Play"} onClick={isPlaying ? pause : play} disabled={!src && !trace}>
            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Next frame" onClick={() => stepFrame(1)}>
            <ChevronsRight className="size-5" />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Next stroke" onClick={() => jumpStroke(1)}>
            <SkipForward className="size-4" />
          </GlassButton>
        </div>
        <div className="flex items-center gap-1.5">
          <GlassSegmentedControl size="sm" label="Playback speed" value={rate} onChange={setRate} segments={[{ value: "0.25", label: "¼×" }, { value: "0.5", label: "½×" }, { value: "1", label: "1×" }]} />
          <GlassButton variant="ghost" size="sm" className={clsx("!h-10 !px-3", skeleton && "text-accent")} aria-pressed={skeleton} onClick={() => setSkeleton((s) => !s)}>
            Skeleton
          </GlassButton>
          {!compact && (
            <>
              <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Save frame as image" onClick={screenshot}>
                <Camera className="size-4" />
              </GlassButton>
              <GlassButton variant="ghost" size="sm" className="!size-10 !p-0" aria-label="Fullscreen" onClick={fullscreen}>
                <Maximize className="size-4" />
              </GlassButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
