"use client";

import { GitCompareArrows, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassCard, GlassLinkButton } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { AngleTimeline } from "@/components/charts";
import { ReviewPlayer, type ReviewPlayerHandle } from "@/components/video/review-player";
import { EmptyState, ErrorState, MethodBadge, PageHeader, PageSkeleton, Section } from "@/components/ui";
import { ApiError, postJson } from "@/lib/api/client";
import type { Comparison, CompareRequest } from "@/lib/ai/schemas";
import { FeatureTracker } from "@/lib/cv/features";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { decodeTrace } from "@/lib/cv/trace";
import { defaultProfile, useStore, useStoreQuery } from "@/lib/data/provider";
import type { SessionRecord, StrokeRecord } from "@/lib/data/types";
import { STROKE_LABEL, VIEW_GUIDES, formatStamp, formatValue } from "@/lib/tennis/labels";
import { METRIC_META } from "@/lib/progress/trends";

interface Pick {
  sessionId: string;
  strokeId: string;
}

interface Loaded {
  session: SessionRecord;
  stroke: StrokeRecord;
  trace: PoseFrame[] | null;
  src: string | null;
}

function strokeOptions(sessions: SessionRecord[]) {
  return sessions.flatMap((s) =>
    s.strokes.filter((x) => !x.excluded).map((x) => ({
      value: `${s.id}|${x.id}`,
      label: `${new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${STROKE_LABEL[x.type]} #${x.index + 1} (${s.cameraView})`,
    })),
  );
}

export default function ComparePage() {
  const store = useStore();
  const toast = useToast();
  const q = useStoreQuery(async (s) => ({ sessions: await s.listSessions(), profile: await s.getProfile() }));
  const [pickA, setPickA] = useState<Pick | null>(null);
  const [pickB, setPickB] = useState<Pick | null>(null);
  const [la, setLa] = useState<Loaded | null>(null);
  const [lb, setLb] = useState<Loaded | null>(null);
  const [offset, setOffset] = useState(0);
  const [ai, setAi] = useState<Comparison | null>(null);
  const [aiMode, setAiMode] = useState<"live" | "fixture" | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [playing, setPlaying] = useState(false);
  const pa = useRef<ReviewPlayerHandle>(null);
  const pb = useRef<ReviewPlayerHandle>(null);

  // Sensible defaults until the user chooses: the two most recent strokes of the same type and view.
  const defaults = useMemo(() => {
    if (!q.data) return { a: null, b: null };
    const all = q.data.sessions.flatMap((s) => s.strokes.filter((x) => !x.excluded && x.type !== "unknown").map((x) => ({ s, x })));
    if (all.length < 2) return { a: null, b: null };
    const latest = all[0];
    const match = all.find((o) => o.x.id !== latest.x.id && o.x.type === latest.x.type && o.s.cameraView === latest.s.cameraView && o.s.id !== latest.s.id)
      ?? all.find((o) => o.x.id !== latest.x.id && o.x.type === latest.x.type);
    if (!match) return { a: null, b: null };
    return { a: { sessionId: match.s.id, strokeId: match.x.id }, b: { sessionId: latest.s.id, strokeId: latest.x.id } };
  }, [q.data]);
  const a = pickA ?? defaults.a;
  const b = pickB ?? defaults.b;
  const choose = (which: "a" | "b", p: Pick | null) => {
    (which === "a" ? setPickA : setPickB)(p);
    setAi(null);
    setOffset(0);
  };

  const aKey = a ? `${a.sessionId}|${a.strokeId}` : "";
  const bKey = b ? `${b.sessionId}|${b.strokeId}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the selection, not object identity
  useEffect(() => loadInto(store, q.data?.sessions, a, setLa), [store, q.data, aKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the selection, not object identity
  useEffect(() => loadInto(store, q.data?.sessions, b, setLb), [store, q.data, bKey]);

  const comparable = useMemo(() => {
    if (!la || !lb) return null;
    const sameView = la.session.cameraView === lb.session.cameraView;
    const sameType = la.stroke.type === lb.stroke.type;
    const rows = la.stroke.metrics.map((m) => {
      const o = lb.stroke.metrics.find((x) => x.key === m.key);
      const ok = Boolean(o && sameView && sameType && o.method === m.method && m.confidence !== "low" && o.confidence !== "low");
      return { m, o, ok };
    });
    return { sameView, sameType, rows, keys: rows.filter((r) => r.ok).map((r) => r.m.key) };
  }, [la, lb]);

  const angles = useMemo(() => {
    if (!la?.trace || !lb?.trace) return null;
    const norm = (l: Loaded) => {
      const tr = new FeatureTracker({ handedness: l.session.handedness, aspect: l.session.videoSize ? l.session.videoSize.w / l.session.videoSize.h : 16 / 9 });
      const fs = l.trace!.map((f) => tr.push(f)).filter((f) => f.t >= l.stroke.t0 && f.t <= l.stroke.t1);
      const span = l.stroke.t1 - l.stroke.t0 || 1;
      return fs.map((f) => ({ t: Math.round(((f.t - l.stroke.t0) / span) * 100), elbow: f.valid ? f.domElbow : null, knee: f.valid ? f.minKnee : null }));
    };
    const A = norm(la);
    const B = norm(lb);
    return {
      elbow: [
        { name: "First", color: "#8e8e93", data: A.map((p) => ({ t: p.t, v: p.elbow })) },
        { name: "Second", color: "#3a78d6", data: B.map((p) => ({ t: p.t, v: p.elbow })) },
      ],
      knee: [
        { name: "First", color: "#8e8e93", data: A.map((p) => ({ t: p.t, v: p.knee })) },
        { name: "Second", color: "#2b8a4f", data: B.map((p) => ({ t: p.t, v: p.knee })) },
      ],
    };
  }, [la, lb]);

  if (q.error) return <ErrorState body="Sessions couldn't be loaded." onRetry={q.reload} />;
  if (q.loading || !q.data) return <PageSkeleton />;
  const options = strokeOptions(q.data.sessions);
  if (options.length < 2) {
    return (
      <div>
        <PageHeader eyebrow="Compare" title="Compare strokes" />
        <EmptyState icon={<GitCompareArrows className="size-7" />} title="Two strokes needed" body="Record at least two strokes — ideally from the same camera angle — to compare them side by side." action={<GlassLinkButton href="/coach/live" variant="primary">Record a session</GlassLinkButton>} />
      </div>
    );
  }

  const playBoth = () => {
    if (!la || !lb) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    // align on the estimated contact moment, plus the manual offset
    const lead = Math.min(la.stroke.contactT - la.stroke.t0, lb.stroke.contactT - lb.stroke.t0);
    pa.current?.seek(la.stroke.contactT - lead);
    pb.current?.seek(lb.stroke.contactT - lead + offset);
    setTimeout(() => {
      pa.current?.play();
      pb.current?.play();
    }, 120);
    setPlaying(true);
    setTimeout(() => setPlaying(false), 4000);
  };

  const runAi = async () => {
    if (!la || !lb || !comparable || !store) return;
    setLoadingAi(true);
    try {
      const profile = q.data!.profile ?? defaultProfile();
      const frames = async (l: Loaded) => (await store.getKeyFrames(l.session.id, l.stroke.id)).slice(0, 3).map((f) => ({ t: f.t, phase: f.phase, image: f.dataUrl }));
      const toInput = async (l: Loaded) => ({
        sessionId: l.session.id,
        cameraView: l.session.cameraView,
        date: new Date(l.session.startedAt).toISOString().slice(0, 10),
        stroke: {
          id: l.stroke.id, type: l.stroke.type, typeSource: l.stroke.typeSource, typeConfidence: l.stroke.typeConfidence, t0: l.stroke.t0, t1: l.stroke.t1,
          contactT: l.stroke.contactT, quality: l.stroke.quality, phases: l.stroke.phases,
          metrics: l.stroke.metrics.map((m) => ({ key: m.key, label: m.label, value: m.value, unit: m.unit, confidence: m.confidence, method: m.method })),
          frames: await frames(l),
        },
      });
      const body: CompareRequest = {
        player: { experience: profile.experience, handedness: profile.handedness, backhand: profile.backhand, goals: profile.goals.slice(0, 10), challenges: [] },
        first: await toInput(la),
        second: await toInput(lb),
        comparableKeys: comparable.keys,
      };
      const { data, meta } = await postJson<Comparison>("/api/ai/compare", body);
      setAi(data);
      setAiMode(meta.mode);
    } catch (e) {
      toast({ tone: "warning", title: "AI comparison unavailable", body: e instanceof ApiError ? e.message : "Try again later." });
    } finally {
      setLoadingAi(false);
    }
  };

  const sel = (p: Pick | null) => (p ? `${p.sessionId}|${p.strokeId}` : "");
  const parse = (v: string): Pick | null => {
    const [sessionId, strokeId] = v.split("|");
    return sessionId && strokeId ? { sessionId, strokeId } : null;
  };

  return (
    <div>
      <PageHeader eyebrow="Compare" title="Compare strokes" subtitle="Side by side, aligned on the estimated contact moment. Adjust the alignment by hand if needed." />

      <div className="grid gap-4 lg:grid-cols-2">
        {([["First stroke", a, "a", la, pa], ["Second stroke", b, "b", lb, pb]] as const).map(([label, pick, which, loaded, ref]) => (
          <GlassCard key={label}>
            <label className="mb-3 block">
              <span className="eyebrow">{label}</span>
              <select value={sel(pick)} onChange={(e) => choose(which, parse(e.target.value))} className="mt-1.5 h-11 w-full rounded-2xl border border-[var(--hairline)] bg-surface/70 px-3 text-[15px] font-medium">
                <option value="">Choose a stroke…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {loaded ? (
              <ReviewPlayer
                ref={ref}
                compact
                src={loaded.src}
                trace={loaded.trace}
                durationMs={loaded.session.durationMs}
                strokes={[loaded.stroke]}
                markers={[]}
                handedness={loaded.session.handedness}
                window={{ start: Math.max(0, loaded.stroke.t0 - 200), end: loaded.stroke.t1 + 200 }}
                label={label}
              />
            ) : (
              <div className="skeleton aspect-video w-full" />
            )}
          </GlassCard>
        ))}
      </div>

      <GlassCard className="mt-4 flex flex-wrap items-center gap-4">
        <GlassButton variant="primary" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={playBoth} disabled={!la || !lb}>
          Play both (synced)
        </GlassButton>
        <label className="flex min-w-[240px] flex-1 items-center gap-3 text-sm">
          <span className="font-medium whitespace-nowrap text-fg-2">Manual alignment</span>
          <input type="range" className="scrubber" min={-500} max={500} step={10} value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Second stroke time offset in milliseconds" />
          <span className="w-16 text-right font-semibold tabular">{offset > 0 ? "+" : ""}{offset} ms</span>
        </label>
      </GlassCard>

      {comparable && (
        <Section title="Measurements side by side">
          {(!comparable.sameView || !comparable.sameType) && (
            <p className="mb-3 rounded-2xl bg-watch-soft px-4 py-3 text-sm font-medium text-watch" role="note">
              {!comparable.sameType ? "These are different stroke types. " : ""}
              {!comparable.sameView ? `Camera angles differ (${VIEW_GUIDES[la!.session.cameraView].title} vs ${VIEW_GUIDES[lb!.session.cameraView].title}). ` : ""}
              Measurements are shown for reference only and are not compared.
            </p>
          )}
          <GlassCard padded={false}>
            <table className="w-full text-sm">
              <caption className="sr-only">Measurement comparison</caption>
              <thead>
                <tr className="text-left text-xs text-fg-3">
                  <th className="px-5 py-3 font-medium">Measurement</th>
                  <th className="px-2 py-3 font-medium">First</th>
                  <th className="px-2 py-3 font-medium">Second</th>
                  <th className="px-5 py-3 font-medium">Comparison</th>
                </tr>
              </thead>
              <tbody>
                {comparable.rows.map(({ m, o, ok }) => {
                  const better = METRIC_META[m.key]?.better ?? "neutral";
                  const diff = o ? o.value - m.value : 0;
                  const improved = ok && better !== "neutral" && Math.abs(diff) > Math.abs(m.value) * 0.05 ? (better === "higher" ? diff > 0 : diff < 0) : null;
                  return (
                    <tr key={m.key} className="border-t border-[var(--hairline)]">
                      <td className="px-5 py-2.5">
                        {m.label}
                        <div className="mt-1"><MethodBadge method={m.method} /></div>
                      </td>
                      <td className="px-2 py-2.5 font-semibold tabular">{formatValue(m.value, m.unit)}</td>
                      <td className="px-2 py-2.5 font-semibold tabular">{o ? formatValue(o.value, o.unit) : "—"}</td>
                      <td className="px-5 py-2.5">
                        {!ok ? (
                          <span className="text-fg-3">Not comparable</span>
                        ) : improved === null ? (
                          <span className="text-fg-2">Similar / no target direction</span>
                        ) : improved ? (
                          <span className="font-semibold text-ok">Moved in a positive direction</span>
                        ) : (
                          <span className="font-semibold text-watch">Moved away from target</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        </Section>
      )}

      {angles && (
        <Section title="Joint angles through the stroke">
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <p className="font-semibold">Hitting elbow (2D)</p>
              <AngleTimeline series={angles.elbow} label="Hitting elbow angle over the stroke, first vs second" />
            </GlassCard>
            <GlassCard>
              <p className="font-semibold">Most-bent knee (2D)</p>
              <AngleTimeline series={angles.knee} label="Knee angle over the stroke, first vs second" />
            </GlassCard>
          </div>
          <p className="mt-2 text-xs text-fg-3">X axis: percent of the stroke from ready to recovery. Gray = first, colour = second. Image-plane angles; only meaningful with the same camera angle.</p>
        </Section>
      )}

      <Section title="AI comparison">
        <GlassCard>
          {ai ? (
            <div>
              {aiMode === "fixture" && <p className="mb-2 inline-block rounded-full bg-watch-soft px-2 py-0.5 text-xs font-semibold text-watch">Test mode — fixture data</p>}
              <p className="text-[17px]">{ai.summary}</p>
              <ul className="mt-4 space-y-2">
                {ai.differences.map((d, i) => (
                  <li key={i} className="rounded-2xl bg-[var(--hairline)] p-3 text-sm">
                    <p className="font-semibold">{d.aspect} · <span className="capitalize">{d.assessment.replace("_", " ")}</span> <span className="font-normal text-fg-3">({d.confidence} confidence)</span></p>
                    <p className="mt-1 text-fg-2">{d.evidence}</p>
                  </li>
                ))}
              </ul>
              {ai.caveats.length > 0 && <p className="mt-3 text-sm text-fg-3">Caveats: {ai.caveats.join(" ")}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] text-fg-2">Ask the AI coach to describe the differences, using up to three key frames from each stroke plus the comparable measurements.</p>
              <GlassButton variant="primary" icon={<Sparkles className="size-4" />} loading={loadingAi} disabled={!la || !lb} onClick={runAi}>
                Compare with AI
              </GlassButton>
            </div>
          )}
        </GlassCard>
      </Section>
      {la && lb && <p className="mt-4 text-xs text-fg-3">Contact estimates: {formatStamp(la.stroke.contactT)} and {formatStamp(lb.stroke.contactT)}.</p>}
    </div>
  );
}

function loadInto(
  store: ReturnType<typeof useStore>,
  sessions: SessionRecord[] | undefined,
  pick: Pick | null,
  set: (l: Loaded | null) => void,
) {
  if (!store || !sessions || !pick) return;
  const session = sessions.find((s) => s.id === pick.sessionId);
  const stroke = session?.strokes.find((x) => x.id === pick.strokeId);
  if (!session || !stroke) return;
  let url: string | null = null;
  let cancelled = false;
  (async () => {
    const [blob, buf] = await Promise.all([store.getRecording(session.id), store.getTrace(session.id)]);
    if (cancelled) return;
    url = blob ? URL.createObjectURL(blob) : null;
    let trace: PoseFrame[] | null = null;
    try {
      trace = buf ? decodeTrace(buf) : null;
    } catch {
      trace = null;
    }
    set({ session, stroke, trace, src: url });
  })();
  return () => {
    cancelled = true;
    if (url) URL.revokeObjectURL(url);
  };
}
