"use client";

import { ChartNoAxesColumn, Flag, Info, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassButton, GlassCard, GlassLinkButton, GlassMetric, GlassModal, GlassSegmentedControl } from "@/components/glass/glass";
import { TrendChart, WeeklyBars } from "@/components/charts";
import { Chip, EmptyState, ErrorState, Field, MethodBadge, PageHeader, PageSkeleton, Section, TextInput } from "@/components/ui";
import { useStore, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { buildSeries, findImprovements, recurringFindings, weekStreak, weeklyActivity, type MetricSeries } from "@/lib/progress/trends";
import { getDrill } from "@/lib/tennis/drills";
import { CATEGORY_LABEL, STROKE_LABEL, VIEW_GUIDES, formatValue } from "@/lib/tennis/labels";
import type { Category } from "@/lib/tennis/types";

export default function ProgressPage() {
  const store = useStore();
  const q = useStoreQuery(async (s) => {
    const [sessions, goals, logs] = await Promise.all([s.listSessions(), s.listGoals(), s.listDrillLogs()]);
    return { sessions, goals, logs };
  });
  const [range, setRange] = useState<"7" | "28">("7");
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalCat, setGoalCat] = useState<Category>("preparation");

  const d = useMemo(() => {
    if (!q.data) return null;
    const series = buildSeries(q.data.sessions);
    return {
      series,
      improvements: findImprovements(series),
      recurring: recurringFindings(q.data.sessions),
      week: weeklyActivity(q.data.sessions, Number(range)),
      streak: weekStreak(q.data.sessions),
    };
  }, [q.data, range]);

  if (q.error) return <ErrorState body="Progress data couldn't be loaded." onRetry={q.reload} />;
  if (q.loading || !q.data || !d) return <PageSkeleton />;
  const { sessions, goals, logs } = q.data;

  if (!sessions.length) {
    return (
      <div>
        <PageHeader eyebrow="Progress" title="Your progress" />
        <EmptyState icon={<ChartNoAxesColumn className="size-7" />} title="Nothing to chart yet" body="Trends appear after a few sessions recorded from the same camera angle." action={<GlassLinkButton href="/coach/live" variant="primary">Start a session</GlassLinkButton>} />
      </div>
    );
  }

  const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationMs, 0) / 60000);
  const totalStrokes = sessions.reduce((s, x) => s + x.strokes.filter((y) => !y.excluded).length, 0);
  const charted = d.series.filter((s) => s.points.length >= 2);
  const single = d.series.filter((s) => s.points.length === 1);

  return (
    <div>
      <PageHeader eyebrow="Progress" title="Your progress" subtitle="Trends only compare like with like: same stroke, same camera angle, same measurement method." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassMetric label="Sessions" value={sessions.length} />
        <GlassMetric label="Practice time" value={totalMin} unit="min" />
        <GlassMetric label="Strokes analysed" value={totalStrokes} hint="Detected automatically; may include corrections" />
        <GlassMetric label="Weekly streak" value={d.streak} unit={d.streak === 1 ? "week" : "weeks"} tone="accent" hint="Weeks in a row with at least one session" />
      </div>

      <Section title="Practice frequency" action={<GlassSegmentedControl size="sm" label="Range" value={range} onChange={setRange} segments={[{ value: "7", label: "7 days" }, { value: "28", label: "28 days" }]} />}>
        <GlassCard>
          <WeeklyBars data={d.week.map((x, i) => ({ ...x, label: range === "28" ? (i % 7 === 0 ? x.label : "") : x.label }))} label={`Practice minutes over the last ${range} days`} />
          <p className="mt-2 text-sm text-fg-3">{logs.length} drill{logs.length === 1 ? "" : "s"} completed in total.</p>
        </GlassCard>
      </Section>

      {d.improvements.length > 0 && (
        <Section title="Personal bests">
          <div className="grid gap-3 md:grid-cols-2">
            {d.improvements.map((i) => (
              <GlassCard key={i.key + i.strokeType} className="flex gap-3">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" />
                <p className="text-[15px]">{i.message}</p>
              </GlassCard>
            ))}
          </div>
        </Section>
      )}

      <Section title="Technique trends">
        {charted.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {charted.slice(0, 8).map((s) => (
              <SeriesCard key={`${s.key}${s.strokeType}${s.view}${s.method}`} s={s} />
            ))}
          </div>
        ) : (
          <GlassCard className="flex gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <p className="text-[15px] text-fg-2">
              Record at least two sessions of the same stroke from the same camera angle to see trends.
              {single.length > 0 && ` You have ${single.length} measurement${single.length === 1 ? "" : "s"} with a single comparable session so far.`}
            </p>
          </GlassCard>
        )}
      </Section>

      <Section title="Recurring patterns">
        {d.recurring.length ? (
          <GlassCard padded={false}>
            <ul className="divide-y divide-[var(--hairline)]">
              {d.recurring.slice(0, 6).map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-sm text-fg-2">
                      {CATEGORY_LABEL[r.category as Category] ?? r.category} · seen in {r.count} of your last {Math.min(8, sessions.length)} sessions · {r.confidence} confidence
                    </p>
                  </div>
                  {r.drillId && (
                    <GlassLinkButton href={`/training/drills?d=${r.drillId}`} size="sm">
                      {getDrill(r.drillId)?.title}
                    </GlassLinkButton>
                  )}
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : (
          <p className="text-[15px] text-fg-2">No issue has recurred across sessions.</p>
        )}
      </Section>

      <Section title="Goals" action={<GlassButton size="sm" icon={<Plus className="size-4" />} onClick={() => setGoalOpen(true)}>Add goal</GlassButton>}>
        {goals.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {goals.map((g) => {
              const related = d.recurring.find((r) => r.category === g.category);
              return (
                <GlassCard key={g.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow flex items-center gap-1.5"><Flag className="size-3.5" /> {CATEGORY_LABEL[g.category]}</p>
                      <p className="mt-1 font-semibold">{g.title}</p>
                      <p className="mt-1 text-sm text-fg-2">
                        {related ? `Still flagged in ${related.count} recent session${related.count === 1 ? "" : "s"}.` : "Not flagged in your recent sessions."}{" "}
                        <span className="text-fg-3">This tracks what was observed — it doesn’t prove a drill caused a change.</span>
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <GlassButton size="sm" variant="ghost" onClick={() => store?.saveGoal({ ...g, active: !g.active })}>{g.active ? "Done" : "Reopen"}</GlassButton>
                      <GlassButton size="sm" variant="ghost" className="!size-9 !p-0" aria-label="Delete goal" onClick={() => store?.deleteGoal(g.id)}>
                        <Trash2 className="size-4" />
                      </GlassButton>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <p className="text-[15px] text-fg-2">Pick a goal from any session report, or add one here.</p>
        )}
      </Section>

      <GlassModal open={goalOpen} onClose={() => setGoalOpen(false)} title="New goal" footer={
        <>
          <GlassButton variant="ghost" onClick={() => setGoalOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" disabled={!goalTitle.trim()} onClick={async () => {
            await store?.saveGoal({ id: uid("goal"), createdAt: Date.now(), title: goalTitle.trim().slice(0, 200), category: goalCat, metricKey: null, strokeType: null, active: true, notes: "" });
            setGoalTitle("");
            setGoalOpen(false);
          }}>Save goal</GlassButton>
        </>
      }>
        <div className="space-y-4">
          <Field label="Goal">
            <TextInput value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Prepare earlier on my forehand" />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-fg-2">Area</p>
            <div className="flex flex-wrap gap-2">
              {(["preparation", "balance", "legs", "rotation", "follow_through", "recovery", "footwork", "serve_toss", "consistency"] as Category[]).map((c) => (
                <Chip key={c} selected={goalCat === c} onClick={() => setGoalCat(c)}>{CATEGORY_LABEL[c]}</Chip>
              ))}
            </div>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}

function SeriesCard({ s }: { s: MetricSeries }) {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const delta = last.value - first.value;
  const better = s.better === "neutral" ? null : (s.better === "higher" ? delta > 0 : delta < 0);
  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{s.label}</p>
          <p className="text-sm text-fg-2">{STROKE_LABEL[s.strokeType]} · {VIEW_GUIDES[s.view].title}</p>
        </div>
        <MethodBadge method={s.method} />
      </div>
      <TrendChart points={s.points} unit={s.unit} label={s.label} better={s.better} />
      <p className="text-sm text-fg-2">
        First {formatValue(first.value, s.unit)} → latest {formatValue(last.value, s.unit)} over {s.points.length} sessions
        {better !== null && Math.abs(delta) > 0 ? (better ? " · moving in a positive direction" : " · moving away from the usual target") : ""}.
      </p>
    </GlassCard>
  );
}
