"use client";

import { motion } from "motion/react";
import { BookOpen, Check, ChevronRight, Dumbbell, RefreshCw, ScanLine, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CompleteButton } from "@/components/complete-button";
import { GlassButton, GlassCard, GlassLinkButton, GlassModal, spring } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { ErrorState, PageHeader, PageSkeleton, Section } from "@/components/ui";
import { ApiError, postJson } from "@/lib/api/client";
import type { PlanResponse } from "@/lib/ai/schemas";
import { defaultProfile, useStore, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { nowMs } from "@/lib/clock";
import { generateLocalPlan } from "@/lib/plan/generate";
import { recurringFindings } from "@/lib/progress/trends";
import { getDrill } from "@/lib/tennis/drills";
import { TECHNIQUE, type TechniqueGuide } from "@/lib/tennis/technique";
import type { Category } from "@/lib/tennis/types";

export default function TrainingPage() {
  const store = useStore();
  const toast = useToast();
  const q = useStoreQuery(async (s) => {
    const [profile, sessions, plans, logs, goals] = await Promise.all([s.getProfile(), s.listSessions(), s.listPlans(), s.listDrillLogs(), s.listGoals()]);
    return { profile: profile ?? defaultProfile(), sessions, plans, logs, goals };
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [guide, setGuide] = useState<TechniqueGuide | null>(null);

  const recurring = useMemo(() => (q.data ? recurringFindings(q.data.sessions) : []), [q.data]);
  const plan = q.data?.plans.find((p) => p.active) ?? null;
  const today = new Date().toLocaleDateString("en-US", { weekday: "short" });
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }, []);

  if (q.error) return <ErrorState body="Training data couldn't be loaded." onRetry={q.reload} />;
  if (q.loading || !q.data) return <PageSkeleton />;
  const { profile, logs } = q.data;
  const doneThisWeek = logs.filter((l) => l.completedAt >= weekStart);
  const challengeTarget = { occasional: 2, weekly: 3, "2-3_per_week": 5, "4+_per_week": 8 }[profile.frequency];

  const makeLocal = async () => {
    const p = generateLocalPlan(profile, recurring.map((r) => ({ ...r })), logs.map((l) => l.drillId));
    await store?.savePlan(p);
    toast({ tone: "success", title: "New plan ready", body: p.title });
  };

  const makeAi = async () => {
    if (!store) return;
    setAiBusy(true);
    try {
      const { data, meta } = await postJson<PlanResponse>("/api/ai/plan", {
        player: {
          experience: profile.experience, handedness: profile.handedness, backhand: profile.backhand, goals: profile.goals.slice(0, 10), challenges: profile.challenges.slice(0, 10),
          frequency: profile.frequency, environment: profile.environment, withBall: profile.withBall, equipment: profile.equipment.slice(0, 10),
        },
        recurringFindings: recurring.slice(0, 12).map((r) => ({ title: r.title, category: r.category as Category, count: r.count, confidence: r.confidence })),
        completedDrills: logs.slice(0, 40).map((l) => l.drillId),
        goals: q.data!.goals.filter((g) => g.active).map((g) => g.title).slice(0, 10),
      });
      await store.savePlan({ id: uid("plan"), createdAt: nowMs(), source: "ai", ...data, title: meta.mode === "fixture" ? data.title : data.title, active: true });
      toast({ tone: "success", title: "AI plan ready", body: meta.mode === "fixture" ? "Test mode — fixture plan." : data.title });
    } catch (e) {
      toast({ tone: "warning", title: "AI planning unavailable", body: e instanceof ApiError ? `${e.message} A plan was built on your device instead.` : undefined });
      await makeLocal();
    } finally {
      setAiBusy(false);
    }
  };

  const complete = async (drillId: string) => {
    await store?.addDrillLog({ id: uid("log"), drillId, completedAt: nowMs(), reps: null, rating: null, notes: "", sessionId: null });
    setCelebrate(drillId);
    setTimeout(() => setCelebrate(null), 1600);
  };

  const nextDrill = getDrill(plan?.days.find((d) => d.day === today)?.drillIds[0] ?? recurring.find((r) => r.drillId)?.drillId ?? "early-unit-turn");

  return (
    <div>
      <PageHeader
        eyebrow="Training"
        title="Your training plan"
        subtitle="Built from what Rally AI has actually observed in your sessions, your goals and your practice setup."
        actions={
          <>
            <GlassButton icon={<RefreshCw className="size-4" />} onClick={makeLocal}>Rebuild plan</GlassButton>
            <GlassButton variant="primary" icon={<Sparkles className="size-4" />} loading={aiBusy} onClick={makeAi}>Personalise with AI</GlassButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard strong className="lg:col-span-2">
          <p className="eyebrow">Next up</p>
          {nextDrill && (
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="display text-2xl">{nextDrill.title}</h2>
                <p className="mt-1 text-fg-2">{nextDrill.objective}</p>
                <p className="mt-2 text-sm text-fg-3">{nextDrill.reps} · {nextDrill.durationMin} min · {nextDrill.difficulty}</p>
              </div>
              <div className="flex gap-2">
                <GlassLinkButton href={`/coach/live?drill=${nextDrill.id}`} variant="primary" icon={<ScanLine className="size-4" />}>Guided practice</GlassLinkButton>
                <CompleteButton done={celebrate === nextDrill.id} onClick={() => complete(nextDrill.id)} />
              </div>
            </div>
          )}
        </GlassCard>
        <GlassCard>
          <p className="eyebrow flex items-center gap-1.5"><Trophy className="size-3.5" /> This week’s challenge</p>
          <p className="display mt-2 text-xl">Complete {challengeTarget} drills</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--hairline)]" role="progressbar" aria-valuemin={0} aria-valuemax={challengeTarget} aria-valuenow={doneThisWeek.length}>
            <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (doneThisWeek.length / challengeTarget) * 100)}%` }} transition={spring} />
          </div>
          <p className="mt-2 text-sm text-fg-2 tabular">{doneThisWeek.length} of {challengeTarget} · paced to your training frequency, no pressure.</p>
        </GlassCard>
      </div>

      <Section title={plan ? plan.title : "No plan yet"}>
        {plan ? (
          <>
            <GlassCard>
              <p className="text-[15px] text-fg-2">{plan.rationale}</p>
              {plan.weeklyGoals.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {plan.weeklyGoals.map((g, i) => (
                    <li key={i} className="rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">{g}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-fg-3">{plan.source === "ai" ? "Generated by the AI coach" : "Generated on your device"} · {new Date(plan.createdAt).toLocaleDateString()}</p>
            </GlassCard>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {plan.days.map((d) => (
                <GlassCard key={d.day} className={d.day === today ? "ring-2 ring-[var(--accent)]" : ""}>
                  <div className="flex items-center justify-between">
                    <p className="display text-lg">{d.day}{d.day === today && <span className="ml-2 text-sm font-semibold text-accent">Today</span>}</p>
                    <span className="text-sm text-fg-3">{d.focus}</span>
                  </div>
                  <p className="mt-2 text-sm text-fg-2">Warm-up: {getDrill(d.warmup)?.title ?? d.warmup}</p>
                  <ul className="mt-3 space-y-2">
                    {d.drillIds.map((id) => {
                      const dr = getDrill(id);
                      if (!dr) return null;
                      const done = logs.some((l) => l.drillId === id && l.completedAt >= weekStart);
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--hairline)] p-3">
                          <Link href={`/training/drills?d=${id}`} className="min-w-0 text-sm font-semibold hover:text-accent">
                            <Dumbbell className="mr-1.5 inline size-4 text-accent" />
                            {dr.title}
                          </Link>
                          {done ? <Check className="size-4 shrink-0 text-ok" aria-label="Done this week" /> : <ChevronRight className="size-4 shrink-0 text-fg-3" />}
                        </li>
                      );
                    })}
                  </ul>
                  {d.notes && <p className="mt-3 text-xs text-fg-3">{d.notes}</p>}
                </GlassCard>
              ))}
            </div>
          </>
        ) : (
          <GlassCard className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-fg-2">Create a weekly plan from your sessions and goals.</p>
            <GlassButton variant="primary" onClick={makeLocal}>Create my plan</GlassButton>
          </GlassCard>
        )}
      </Section>

      <Section title="Technique library" action={<Link href="/training/drills" className="text-sm font-semibold text-accent">All drills</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TECHNIQUE.map((t) => (
            <GlassCard key={t.id} interactive onClick={() => setGuide(t)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setGuide(t)}>
              <BookOpen className="size-5 text-accent-2" />
              <p className="display mt-2 text-lg">{t.title}</p>
              <p className="mt-1 line-clamp-3 text-sm text-fg-2">{t.summary}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {logs.length > 0 && (
        <Section title="Recently completed">
          <GlassCard padded={false}>
            <ul className="divide-y divide-[var(--hairline)]">
              {logs.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium">{getDrill(l.drillId)?.title ?? l.drillId}</span>
                  <span className="text-fg-3">{new Date(l.completedAt).toLocaleDateString()}{l.reps !== null ? ` · ${l.reps} reps` : ""}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </Section>
      )}

      <GlassModal open={!!guide} onClose={() => setGuide(null)} title={guide?.title ?? ""} size="lg">
        {guide && (
          <div className="space-y-5 text-[15px]">
            <p className="text-fg-2">{guide.summary}</p>
            {guide.phases.map((p) => (
              <div key={p.name}>
                <p className="eyebrow mb-1">{p.name}</p>
                <ul className="space-y-1">{p.points.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-ok-soft p-4">
                <p className="mb-1 text-sm font-semibold text-ok">What the camera can see</p>
                <ul className="space-y-0.5 text-sm">{guide.visible.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
              <div className="rounded-2xl bg-insufficient-soft p-4">
                <p className="mb-1 text-sm font-semibold text-fg-2">What it can’t measure</p>
                <ul className="space-y-0.5 text-sm">{guide.notVisible.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            </div>
            <div>
              <p className="eyebrow mb-1">Valid variations</p>
              <p className="text-fg-2">{guide.validVariations.join(" · ")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {guide.drillIds.map((id) => (
                <GlassLinkButton key={id} href={`/training/drills?d=${id}`} size="sm" icon={<Dumbbell className="size-4" />}>{getDrill(id)?.title}</GlassLinkButton>
              ))}
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}
