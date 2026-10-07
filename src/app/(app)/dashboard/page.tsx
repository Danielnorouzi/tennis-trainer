"use client";

import { motion } from "motion/react";
import { ArrowRight, CalendarCheck, Flame, PlayCircle, ScanLine, Sparkles, Target, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { GlassCard, GlassLinkButton, softSpring } from "@/components/glass/glass";
import { WeeklyBars } from "@/components/charts";
import { EmptyState, ErrorState, PageSkeleton, Section, SeverityBadge } from "@/components/ui";
import { useStoreContext, useStoreQuery } from "@/lib/data/provider";
import { buildSeries, findImprovements, recurringFindings, weekStreak, weeklyActivity } from "@/lib/progress/trends";
import { getDrill } from "@/lib/tennis/drills";
import { formatClock } from "@/lib/tennis/labels";

function greeting(h: number) {
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: softSpring } };

export default function DashboardPage() {
  const { status } = useStoreContext();
  const q = useStoreQuery(async (s) => {
    const [profile, sessions, plans, logs] = await Promise.all([s.getProfile(), s.listSessions(), s.listPlans(), s.listDrillLogs()]);
    return { profile, sessions, plans, logs };
  });
  const derived = useMemo(() => {
    if (!q.data) return null;
    const { sessions, plans } = q.data;
    const activePlan = plans.find((p) => p.active) ?? null;
    const today = new Date().toLocaleDateString("en-US", { weekday: "short" });
    const todayPlan = activePlan?.days.find((d) => d.day === today) ?? null;
    const recurring = recurringFindings(sessions);
    const focus = recurring.find((r) => r.confidence !== "low") ?? recurring[0] ?? null;
    const drill = getDrill(todayPlan?.drillIds[0] ?? focus?.drillId ?? "early-unit-turn");
    return {
      week: weeklyActivity(sessions),
      streak: weekStreak(sessions),
      improvements: findImprovements(buildSeries(sessions)).slice(0, 2),
      last: sessions[0] ?? null,
      focus,
      todayPlan,
      drill,
    };
  }, [q.data]);

  if (q.error) return <ErrorState body="Your training data couldn't be loaded." onRetry={q.reload} />;
  if (q.loading || !q.data || !derived) return <PageSkeleton />;

  const name = q.data.profile?.name?.trim();
  const weekMinutes = Math.round(derived.week.reduce((s, d) => s + d.minutes, 0));
  const weekSessions = derived.week.reduce((s, d) => s + d.sessions, 0);
  const lastTop = derived.last?.localReport?.findings.find((f) => f.severity === "issue" || f.severity === "watch");

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.header variants={item} className="mb-6">
        <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="display mt-1 text-[34px] leading-tight sm:text-[42px]">
          {greeting(new Date().getHours())}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-[17px] text-fg-2">Ready to improve your game?</p>
      </motion.header>

      {/* Hero */}
      <motion.div variants={item}>
        <GlassCard strong className="relative overflow-hidden p-6 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-accent/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-accent-2/15 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p className="eyebrow text-accent">Live Coach</p>
              <h2 className="display mt-2 text-[28px] leading-tight sm:text-[34px]">
                {derived.focus ? `Today: ${derived.focus.title.toLowerCase()}` : "Start your first session"}
              </h2>
              <p className="mt-2 max-w-md text-fg-2">
                {derived.focus
                  ? "Rally AI will focus its feedback on this while you practise. Prop your phone up, step back, and swing."
                  : "Set up your camera, choose a stroke and get real-time, evidence-based feedback on your form."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <GlassLinkButton href={derived.focus ? `/coach/live?focus=${derived.focus.category}` : "/coach/live"} variant="primary" size="lg" icon={<ScanLine className="size-5" />}>
                  Start Training
                </GlassLinkButton>
                <GlassLinkButton href="/analyze" variant="glass" size="lg" icon={<Upload className="size-5" />}>
                  Analyze a video
                </GlassLinkButton>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={<CalendarCheck className="size-4" />} label="This week" value={`${weekSessions}`} unit={weekSessions === 1 ? "session" : "sessions"} />
              <MiniStat icon={<Flame className="size-4" />} label="Weekly streak" value={`${derived.streak}`} unit={derived.streak === 1 ? "week" : "weeks"} />
              <MiniStat icon={<PlayCircle className="size-4" />} label="Practice time" value={`${weekMinutes}`} unit="min" />
              <MiniStat icon={<Target className="size-4" />} label="Total sessions" value={`${q.data.sessions.length}`} unit="" />
            </div>
          </div>
        </GlassCard>
      </motion.div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <motion.div variants={item} className="lg:col-span-2">
          <GlassCard className="h-full">
            <div className="flex items-center justify-between">
              <h3 className="display text-lg">Weekly activity</h3>
              <span className="text-sm text-fg-3">minutes per day</span>
            </div>
            <WeeklyBars data={derived.week} label="Practice minutes over the last 7 days" />
          </GlassCard>
        </motion.div>

        <motion.div variants={item}>
          <GlassCard className="h-full">
            <p className="eyebrow">Recommended drill</p>
            {derived.drill ? (
              <Link href={`/training/drills?d=${derived.drill.id}`} className="group mt-2 block">
                <h3 className="display text-xl group-hover:text-accent">{derived.drill.title}</h3>
                <p className="mt-1.5 text-sm text-fg-2">{derived.drill.objective}</p>
                <p className="mt-3 text-sm font-semibold text-fg-3">
                  {derived.drill.reps} · {derived.drill.durationMin} min · {derived.drill.needsBall ? "with ball" : "no ball needed"}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  Open drill <ArrowRight className="size-4" />
                </span>
              </Link>
            ) : null}
          </GlassCard>
        </motion.div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <motion.div variants={item}>
          <GlassCard className="h-full">
            <p className="eyebrow">Last session</p>
            {derived.last ? (
              <Link href={`/sessions/${derived.last.id}`} className="group mt-2 block">
                <h3 className="display text-xl group-hover:text-accent">{derived.last.title}</h3>
                <p className="mt-1 text-sm text-fg-2 tabular">
                  {formatClock(derived.last.durationMs)} · {derived.last.strokes.filter((s) => !s.excluded).length} strokes detected ·{" "}
                  {derived.last.report ? "AI report ready" : derived.last.analysisStatus === "running" || derived.last.analysisStatus === "queued" ? "AI report in progress" : "On-device report"}
                </p>
                {lastTop ? (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[var(--hairline)] p-3">
                    <SeverityBadge severity={lastTop.severity} />
                    <p className="text-sm font-medium">{lastTop.title}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-fg-2">No recurring issues were flagged.</p>
                )}
              </Link>
            ) : (
              <p className="mt-2 text-sm text-fg-2">Your sessions will appear here.</p>
            )}
          </GlassCard>
        </motion.div>

        <motion.div variants={item}>
          <GlassCard className="h-full">
            <p className="eyebrow">Recent improvements</p>
            {derived.improvements.length ? (
              <ul className="mt-3 space-y-3">
                {derived.improvements.map((i) => (
                  <li key={i.key + i.strokeType} className="flex gap-3">
                    <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                    <p className="text-[15px]">{i.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-fg-2">
                Improvements are only highlighted when the same measurement improves across several comparable sessions (same stroke, same camera angle). Keep recording to see trends.
              </p>
            )}
            <Link href="/progress" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              View progress <ArrowRight className="size-4" />
            </Link>
          </GlassCard>
        </motion.div>
      </div>

      {q.data.sessions.length === 0 && (
        <Section title="Get started">
          <EmptyState
            icon={<ScanLine className="size-7" />}
            title="No sessions yet"
            body="Your first session takes two minutes: choose a stroke, follow the camera setup checks, and swing. Everything is analysed on your device."
            action={<GlassLinkButton href="/coach/live" variant="primary" size="lg">Open Live Coach</GlassLinkButton>}
          />
        </Section>
      )}

      {status && status.ai !== "live" && (
        <p className="mt-6 text-center text-xs text-fg-3">
          {status.ai === "fixture"
            ? "AI coaching is running in local test mode (fixture data, clearly labelled)."
            : "AI coaching isn't configured on this server — on-device tracking and reports work normally."}
        </p>
      )}
    </motion.div>
  );
}

function MiniStat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="rounded-[18px] bg-bg-2/70 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
        {icon}
        {label}
      </div>
      <p className="display mt-1 text-2xl tabular">
        {value} <span className="text-sm font-semibold text-fg-3">{unit}</span>
      </p>
    </div>
  );
}
