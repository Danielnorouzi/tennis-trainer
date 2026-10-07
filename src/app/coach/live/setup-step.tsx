"use client";

// Step 1–3 of the practice workflow: what to practise, which mode, and where the camera is.

import { clsx } from "clsx";
import { motion } from "motion/react";
import { Camera, CircleHelp, Footprints, Repeat, Sparkles, Target, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { GlassButton, GlassSegmentedControl, softSpring } from "@/components/glass/glass";
import { Chip, Toggle } from "@/components/ui";
import { DRILLS } from "@/lib/tennis/drills";
import { CATEGORY_LABEL, VIEW_GUIDES } from "@/lib/tennis/labels";
import type { CameraView, Category, SessionStrokeSelection } from "@/lib/tennis/types";
import type { SessionRecord } from "@/lib/data/types";

export interface SessionPlan {
  selection: SessionStrokeSelection;
  mode: SessionRecord["mode"];
  view: CameraView;
  focus: Category | null;
  drillId: string | null;
  drillTarget: number;
  facing: "user" | "environment";
  resolution: "480p" | "720p" | "1080p";
  record: boolean;
  countdown: number;
}

const STROKES: { value: SessionStrokeSelection; label: string; hint: string }[] = [
  { value: "forehand", label: "Forehand", hint: "Groundstroke on your dominant side" },
  { value: "backhand", label: "Backhand", hint: "One- or two-handed" },
  { value: "serve", label: "Serve", hint: "Toss, trophy, reach, landing" },
  { value: "volley", label: "Volleys", hint: "Compact punches at the net" },
  { value: "footwork", label: "Footwork", hint: "Split steps, movement, recovery" },
  { value: "auto", label: "Automatic", hint: "Rally AI guesses each stroke — you can correct it" },
];

const FOCUS_OPTIONS: Category[] = ["preparation", "balance", "legs", "follow_through", "recovery", "rotation", "serve_toss"];

export function SetupStep({ plan, onChange, onContinue, recordAllowed }: {
  plan: SessionPlan;
  onChange: (p: Partial<SessionPlan>) => void;
  onContinue: () => void;
  recordAllowed: boolean;
}) {
  const guide = VIEW_GUIDES[plan.view];
  return (
    <div className="mx-auto max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+72px)] pb-[calc(env(safe-area-inset-bottom)+120px)] text-white">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="display text-[32px] leading-tight sm:text-[40px]">
        What are we practising?
      </motion.h1>

      <section className="mt-6" aria-label="Stroke">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {STROKES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={plan.selection === s.value}
              onClick={() => onChange({ selection: s.value })}
              className={clsx(
                "glass-dark rounded-[20px] p-4 text-left transition-[transform,box-shadow] active:scale-[0.98]",
                plan.selection === s.value && "ring-2 ring-[var(--accent)]",
              )}
            >
              <span className="flex items-center gap-2 text-[17px] font-semibold">
                {s.value === "auto" ? <Wand2 className="size-4" /> : s.value === "footwork" ? <Footprints className="size-4" /> : null}
                {s.label}
              </span>
              <span className="mt-1 block text-[13px] text-white/65">{s.hint}</span>
            </button>
          ))}
        </div>
        {plan.selection === "auto" && (
          <p className="mt-2 text-[13px] text-white/60">Automatic classification is a best guess from body motion. For the most reliable feedback, pick the stroke.</p>
        )}
      </section>

      <section className="mt-8" aria-label="Mode">
        <h2 className="mb-3 text-[15px] font-semibold text-white/80">Mode</h2>
        <GlassSegmentedControl
          dark
          label="Session mode"
          value={plan.mode}
          onChange={(mode) => onChange({ mode, focus: mode === "focus" ? plan.focus ?? "preparation" : plan.focus })}
          segments={[
            { value: "standard", label: "Standard" },
            { value: "shadow", label: "Shadow swing" },
            { value: "focus", label: "Focus" },
            { value: "drill", label: "Drill" },
          ]}
          className="w-full sm:w-auto"
        />
        <p className="mt-2 text-[13px] text-white/60">
          {plan.mode === "shadow" && "Swing without a ball — ideal at home. Contact timing is always an estimate."}
          {plan.mode === "focus" && "Live feedback will only talk about the one movement you choose."}
          {plan.mode === "drill" && "A structured set with a rep counter you can correct by hand."}
          {plan.mode === "standard" && "Balanced feedback on the most important, best-supported issues."}
        </p>
        {plan.mode === "focus" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map((f) => (
              <Chip key={f} selected={plan.focus === f} onClick={() => onChange({ focus: f })} className="!border-white/15 !bg-white/10 !text-white aria-pressed:!bg-[var(--accent)]">
                <Target className="size-3.5" /> {CATEGORY_LABEL[f]}
              </Chip>
            ))}
          </div>
        )}
        {plan.mode === "drill" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <select
              aria-label="Drill"
              value={plan.drillId ?? ""}
              onChange={(e) => onChange({ drillId: e.target.value || null })}
              className="glass-dark h-12 rounded-2xl px-4 text-[15px] outline-none"
            >
              <option value="">Free set (no specific drill)</option>
              {DRILLS.filter((d) => d.category !== "warmup").map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <div className="glass-dark flex h-12 items-center gap-3 rounded-2xl px-3">
              <Repeat className="size-4 text-white/70" aria-hidden />
              <label className="text-sm text-white/80" htmlFor="reps">Reps</label>
              <input id="reps" type="number" min={1} max={100} value={plan.drillTarget} onChange={(e) => onChange({ drillTarget: Math.max(1, Math.min(100, Number(e.target.value) || 10)) })} className="w-16 bg-transparent text-right text-[17px] font-semibold outline-none" />
            </div>
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Camera position">
        <h2 className="mb-3 text-[15px] font-semibold text-white/80">Where is your camera?</h2>
        <GlassSegmentedControl
          dark
          label="Camera position"
          value={plan.view}
          onChange={(view) => onChange({ view })}
          segments={[
            { value: "side", label: "Side" },
            { value: "front", label: "Front" },
            { value: "rear", label: "Behind" },
            { value: "diagonal", label: "Diagonal" },
          ]}
          className="w-full sm:w-auto"
        />
        <div className="glass-dark mt-3 rounded-[20px] p-5">
          <div className="flex gap-4">
            <ViewDiagram view={plan.view} />
            <div className="min-w-0 text-[14px]">
              <p className="font-semibold">{guide.title}</p>
              <p className="mt-1 text-white/70">{guide.placement}</p>
              <p className="mt-3 text-[13px] font-semibold text-[var(--accent)]">Best for</p>
              <p className="text-white/75">{guide.bestFor.join(" · ")}</p>
              <p className="mt-2 text-[13px] font-semibold text-white/55">Limited</p>
              <p className="text-white/55">{guide.limited.join(" · ")}</p>
            </div>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/55">
          <CircleHelp className="size-3.5" /> Tip: {plan.selection === "serve" ? "for serves, a side view shows the trophy position and reach best." : plan.selection === "footwork" ? "for footwork, a front or rear view shows lateral movement best." : "a side or diagonal view works well for groundstrokes."}
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Camera options">
        <div className="glass-dark rounded-[20px] p-4">
          <p className="mb-3 text-[15px] font-semibold text-white/80">Camera</p>
          <GlassSegmentedControl dark size="sm" label="Camera" value={plan.facing} onChange={(facing) => onChange({ facing })}
            segments={[{ value: "environment", label: "Rear" }, { value: "user", label: "Front (selfie)" }]} />
          <div className="mt-3">
            <GlassSegmentedControl dark size="sm" label="Resolution" value={plan.resolution} onChange={(resolution) => onChange({ resolution })}
              segments={[{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }]} />
          </div>
          <p className="mt-2 text-[12px] text-white/55">720p is a good balance of tracking accuracy and battery.</p>
        </div>
        <div className="glass-dark rounded-[20px] px-4 py-1">
          <DarkToggle>
            <Toggle checked={plan.record && recordAllowed} disabled={!recordAllowed} onChange={(record) => onChange({ record })} label="Record video"
              description={recordAllowed ? "Saved privately on this device for slow-motion review." : "Disabled by your privacy setting (never record)."} />
          </DarkToggle>
          <div className="flex items-center justify-between py-3">
            <span className="text-[15px] font-medium">Countdown</span>
            <GlassSegmentedControl dark size="sm" label="Countdown" value={String(plan.countdown)} onChange={(v) => onChange({ countdown: Number(v) })}
              segments={[{ value: "3", label: "3 s" }, { value: "5", label: "5 s" }, { value: "10", label: "10 s" }]} />
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <GlassButton variant="primary" size="xl" onClick={onContinue} icon={<Camera className="size-5" />} className="w-full max-w-md">
          Set up camera
        </GlassButton>
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-[13px] text-white/50">
        <Sparkles className="size-3.5" /> Tracking runs on this device. Nothing is uploaded while you practise.
      </p>
    </div>
  );
}

function DarkToggle({ children }: { children: ReactNode }) {
  return <div className="[&_.text-fg-2]:text-white/60">{children}</div>;
}

/** Simple top-down diagram: player (circle), net line, camera position. Original artwork. */
function ViewDiagram({ view }: { view: CameraView }) {
  const cam = { side: [92, 50], front: [50, 8], rear: [50, 92], diagonal: [84, 18] }[view];
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0 rounded-2xl bg-white/[0.06]" aria-hidden>
      <line x1="6" y1="30" x2="94" y2="30" stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />
      <text x="8" y="26" fontSize="8" fill="rgba(255,255,255,.45)">net</text>
      <circle cx="50" cy="62" r="7" fill="var(--accent)" />
      <line x1="50" y1="62" x2="50" y2="44" stroke="rgba(255,255,255,.6)" strokeWidth="2" markerEnd="url(#arrow)" />
      <rect x={cam[0] - 6} y={cam[1] - 4} width="12" height="8" rx="2" fill="#fff" />
      <line x1={cam[0]} y1={cam[1]} x2="50" y2="62" stroke="rgba(255,255,255,.3)" strokeDasharray="2 2" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,.6)" />
        </marker>
      </defs>
    </svg>
  );
}
