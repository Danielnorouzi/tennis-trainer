"use client";

import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/glass/glass";
import { finalizeCapture } from "@/lib/analysis/finalize";
import { FeatureTracker } from "@/lib/cv/features";
import { PoseSmoother } from "@/lib/cv/smoothing";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { useSettings, useStore } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import type { CameraView, SessionStrokeSelection } from "@/lib/tennis/types";
import { synthForehands, synthServes } from "../../../../tests/fixtures/synthetic";

export function SeedTool() {
  const store = useStore();
  const { settings } = useSettings();
  const [log, setLog] = useState<string[]>([]);

  const make = async (kind: "forehand" | "late" | "serve", daysAgo: number) => {
    if (!store) return;
    const src = kind === "serve" ? synthServes(3) : synthForehands({ reps: 6, lateTurn: kind === "late", kneeBend: kind === "late" ? 4 : 25, jitter: 3 });
    const frames: PoseFrame[] = src.frames;
    const tracker = new FeatureTracker({ handedness: "right", aspect: 16 / 9 });
    const smoother = new PoseSmoother();
    const smoothed = frames.map((f) => smoother.smooth(f));
    const features = smoothed.map((f) => tracker.push(f));
    const selection: SessionStrokeSelection = kind === "serve" ? "serve" : "forehand";
    const view: CameraView = "front";
    const startedAt = Date.now() - daysAgo * 86_400_000;
    const s = await finalizeCapture(
      store,
      {
        id: uid("sess"), source: "live", mode: "shadow", selection, view, handedness: "right", mirrored: false, focus: null, drillId: null,
        startedAt, durationMs: frames[frames.length - 1].t, poseFrames: smoothed, features, liveKeyFrames: [], recording: null,
        videoSize: { w: 1280, h: 720 }, liveCues: [], notes: "[Synthetic test data — generated from a stick-figure fixture, not a real player]",
      },
      settings,
    );
    await store.saveSession({ ...s, title: `[Synthetic] ${s.title}` });
    setLog((l) => [`Created ${s.id} with ${s.strokes.length} strokes (${kind}, ${daysAgo} days ago)`, ...l]);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="display text-3xl">Developer seed tool</h1>
      <p className="mt-2 text-fg-2">Creates sessions from synthetic stick-figure pose traces. They are labelled “[Synthetic]” and are for testing only. Not available in production.</p>
      <GlassCard className="mt-6 flex flex-wrap gap-2">
        <GlassButton data-testid="seed-forehand" onClick={() => make("forehand", 0)}>Forehand session (today)</GlassButton>
        <GlassButton data-testid="seed-late" onClick={() => make("late", 7)}>Late-turn forehand (7 days ago)</GlassButton>
        <GlassButton data-testid="seed-serve" onClick={() => make("serve", 2)}>Serve session</GlassButton>
      </GlassCard>
      <ul className="mt-4 space-y-1 text-sm text-fg-2" data-testid="seed-log">
        {log.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </main>
  );
}
