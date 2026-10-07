"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard, softSpring } from "@/components/glass/glass";
import { Chip, Field, TextInput } from "@/components/ui";
import { Logo } from "@/components/brand";
import { markOnboardingSkipped } from "@/components/onboarding-gate";
import { defaultProfile, useStore } from "@/lib/data/provider";
import type { Profile } from "@/lib/data/types";
import type { StrokeType } from "@/lib/tennis/types";

const GOALS = ["More consistent forehand", "Better backhand", "Stronger serve", "Faster footwork", "Better balance", "Earlier preparation", "Play matches with confidence"];
const CHALLENGES = ["Late preparation", "Mishits", "Losing balance", "Serve toss", "Slow recovery", "Backhand confidence", "Not sure"];
const EQUIPMENT = ["racket", "balls", "ball machine", "practice partner", "wall", "tripod"];

type Step = { key: string; title: string; subtitle: string };
const STEPS: Step[] = [
  { key: "basics", title: "Let's get to know your game", subtitle: "Everything here can be changed later in your profile." },
  { key: "style", title: "How do you play?", subtitle: "Rally AI uses this to read your strokes correctly." },
  { key: "goals", title: "What do you want to improve?", subtitle: "Pick as many as you like." },
  { key: "setup", title: "Where do you practise?", subtitle: "So drills fit your space and equipment." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(defaultProfile());
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggle = (k: "goals" | "challenges" | "equipment", v: string) =>
    setP((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const finish = async () => {
    if (!store) return;
    setSaving(true);
    const existing = await store.getProfile();
    await store.saveProfile({ ...p, id: existing?.id ?? p.id, onboarded: true, updatedAt: Date.now(), createdAt: existing?.createdAt ?? p.createdAt });
    router.replace("/dashboard");
  };
  const skip = () => {
    markOnboardingSkipped();
    router.replace("/dashboard");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="size-8" />
          <span className="display text-lg">Rally AI</span>
        </div>
        <button onClick={skip} className="rounded-full px-3 py-2 text-sm font-semibold text-fg-2 hover:text-fg">
          Skip for now
        </button>
      </div>

      <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
            <motion.div className="h-full bg-accent" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={softSpring} />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={softSpring} className="flex-1">
          <h1 className="display text-[30px] leading-tight">{STEPS[step].title}</h1>
          <p className="mt-2 text-fg-2">{STEPS[step].subtitle}</p>
          <GlassCard className="mt-6 space-y-6">
            {step === 0 && (
              <>
                <Field label="Your first name (optional)">
                  <TextInput value={p.name} onChange={(e) => set("name", e.target.value.slice(0, 40))} placeholder="Daniel" autoComplete="given-name" />
                </Field>
                <ChoiceRow label="Experience" value={p.experience} onChange={(v) => set("experience", v)} options={[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]} />
                <ChoiceRow
                  label="How often do you train?"
                  value={p.frequency}
                  onChange={(v) => set("frequency", v)}
                  options={[["occasional", "Occasionally"], ["weekly", "Weekly"], ["2-3_per_week", "2–3× a week"], ["4+_per_week", "4+× a week"]]}
                />
              </>
            )}
            {step === 1 && (
              <>
                <ChoiceRow label="Dominant hand" value={p.handedness} onChange={(v) => set("handedness", v)} options={[["right", "Right"], ["left", "Left"]]} />
                <ChoiceRow label="Backhand" value={p.backhand} onChange={(v) => set("backhand", v)} options={[["two", "Two-handed"], ["one", "One-handed"]]} />
                <div>
                  <p className="mb-2 text-sm font-medium text-fg-2">Strokes you most want to work on</p>
                  <div className="flex flex-wrap gap-2">
                    {(["forehand", "backhand", "serve", "forehand_volley", "slice"] as StrokeType[]).map((s) => (
                      <Chip
                        key={s}
                        selected={p.preferredStrokes.includes(s)}
                        onClick={() => set("preferredStrokes", p.preferredStrokes.includes(s) ? p.preferredStrokes.filter((x) => x !== s) : [...p.preferredStrokes, s])}
                      >
                        {s.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}
                      </Chip>
                    ))}
                  </div>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <MultiChips label="Main goals" items={GOALS} selected={p.goals} onToggle={(v) => toggle("goals", v)} />
                <MultiChips label="Current challenges" items={CHALLENGES} selected={p.challenges} onToggle={(v) => toggle("challenges", v)} />
              </>
            )}
            {step === 3 && (
              <>
                <ChoiceRow label="Training environment" value={p.environment} onChange={(v) => set("environment", v)} options={[["court", "On court"], ["home", "At home"], ["both", "Both"]]} />
                <ChoiceRow label="Practising with a ball?" value={p.withBall ? "yes" : "no"} onChange={(v) => set("withBall", v === "yes")} options={[["yes", "Usually"], ["no", "Mostly shadow swings"]]} />
                <MultiChips label="Available equipment" items={EQUIPMENT} selected={p.equipment} onToggle={(v) => toggle("equipment", v)} />
              </>
            )}
          </GlassCard>
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between gap-3">
        <GlassButton variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} icon={<ArrowLeft className="size-4" />}>
          Back
        </GlassButton>
        {step < STEPS.length - 1 ? (
          <GlassButton variant="primary" size="lg" onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="size-4" />
          </GlassButton>
        ) : (
          <GlassButton variant="primary" size="lg" onClick={finish} loading={saving} icon={<Check className="size-4" />}>
            Start training
          </GlassButton>
        )}
      </div>
    </main>
  );
}

function ChoiceRow<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-2 text-sm font-medium text-fg-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <Chip key={v} selected={value === v} onClick={() => onChange(v)}>
            {l}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MultiChips({ label, items, selected, onToggle }: { label: string; items: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-fg-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((g) => (
          <Chip key={g} selected={selected.includes(g)} onClick={() => onToggle(g)}>
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
