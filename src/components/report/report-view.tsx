"use client";

// The coaching report. Keeps four kinds of information visibly separate:
//   Measured (2D) / Estimated (3D model) data, AI interpretation, and Recommendations.
// The top three improvements come first; the full detail lives in an expandable section.

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Clock, Dumbbell, Info, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GlassCard, softSpring } from "../glass/glass";
import { ScoreRing } from "../charts";
import { ConfidenceBadge, MethodBadge, PriorityBadge, SeverityBadge } from "../ui";
import type { CoachingReport, Observation } from "@/lib/ai/schemas";
import type { LocalReport, SessionRecord } from "@/lib/data/types";
import { getDrill } from "@/lib/tennis/drills";
import { CATEGORY_LABEL, STROKE_LABEL, formatStamp, formatValue } from "@/lib/tennis/labels";
import type { Category, Finding } from "@/lib/tennis/types";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: softSpring } };

export function TopPriorities({ session, onSeek }: { session: SessionRecord; onSeek: (ms: number) => void }) {
  const ai = session.report;
  const local = (session.localReport?.findings ?? []).filter((f) => f.severity === "issue" || f.severity === "watch");
  const items: { title: string; cue: string; drillId: string | null; t: number | null; source: "ai" | "local"; confidence: Finding["confidence"] }[] = ai?.topPriorities.length
    ? ai.topPriorities.map((p) => {
        const o = ai.observations.find((x) => x.id === p.observationId);
        return { title: p.title, cue: p.cue, drillId: o?.drillId ?? null, t: o?.timestampStart !== null && o?.timestampStart !== undefined ? o.timestampStart * 1000 : null, source: "ai" as const, confidence: o?.confidence ?? "low" };
      })
    : local.slice(0, 3).map((f) => ({ title: f.title, cue: f.cue ?? f.adjustment, drillId: f.drillId, t: f.t0, source: "local" as const, confidence: f.confidence }));

  if (!items.length) {
    return (
      <GlassCard>
        <p className="eyebrow">Top improvements</p>
        <p className="mt-2 text-[15px] text-fg-2">
          Nothing was flagged consistently in this session. That can mean solid technique — or that the camera view didn’t show enough. Check the limitations below.
        </p>
      </GlassCard>
    );
  }
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-3">
      {items.slice(0, 3).map((it, i) => {
        const drill = getDrill(it.drillId);
        return (
          <motion.div key={i} variants={rise}>
            <GlassCard className="h-full">
              <div className="flex items-center justify-between gap-2">
                <span className="display grid size-8 place-items-center rounded-full bg-accent text-sm text-white">{i + 1}</span>
                <MethodBadge method={it.source === "ai" ? "ai" : "measured_2d"} />
              </div>
              <h3 className="display mt-3 text-[19px] leading-snug">{it.title}</h3>
              <p className="mt-1.5 text-[15px] text-fg-2">“{it.cue}”</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfidenceBadge confidence={it.confidence} />
                {it.t !== null && (
                  <button onClick={() => onSeek(it.t!)} className="inline-flex items-center gap-1 rounded-full bg-accent-2-soft px-2.5 py-1 text-xs font-semibold text-accent-2">
                    <Clock className="size-3" /> {formatStamp(it.t)}
                  </button>
                )}
              </div>
              {drill && (
                <Link href={`/training/drills?d=${drill.id}`} className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--hairline)] p-3 text-sm font-semibold hover:text-accent">
                  <Dumbbell className="size-4 text-accent" /> Drill: {drill.title}
                </Link>
              )}
            </GlassCard>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function CategoryScores({ local }: { local: LocalReport }) {
  return (
    <GlassCard>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="display text-lg">Technique snapshot</h3>
        <span className="flex items-center gap-1 text-xs text-fg-3">
          <Info className="size-3.5" /> Coaching heuristics from on-device checks — not validated ratings.
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-8">
        {local.scores.map((s) => (
          <div key={s.category} className="flex flex-col items-center text-center" title={s.basis}>
            <ScoreRing score={s.score} size={64} label={CATEGORY_LABEL[s.category as Category]} />
            <p className="mt-1.5 text-[12px] font-semibold leading-tight">{CATEGORY_LABEL[s.category as Category]}</p>
            <p className="text-[11px] text-fg-3">{s.score === null ? "not assessed" : s.basis}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function FindingCard({ f, onSeek, defaultOpen }: { f: Finding; onSeek: (ms: number) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const drill = getDrill(f.drillId);
  return (
    <GlassCard padded={false} className="overflow-hidden" layout>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <span className="text-xs font-semibold text-fg-3">{CATEGORY_LABEL[f.category]}</span>
          </div>
          <h4 className="mt-2 text-[17px] font-semibold">{f.title}</h4>
          <p className="mt-1 text-[15px] text-fg-2">{f.observation}</p>
        </div>
        <ChevronDown className={clsx("mt-1 size-5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden">
            <div className="space-y-4 border-t border-[var(--hairline)] px-5 pt-4 pb-5 text-[15px]">
              <div>
                <p className="eyebrow mb-1.5">Evidence</p>
                <ul className="space-y-1.5">
                  {f.evidence.map((e, i) => (
                    <li key={i} className="flex gap-2 text-fg-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-3" aria-hidden />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {f.severity !== "ok" && (
                <>
                  <div>
                    <p className="eyebrow mb-1">Why it matters</p>
                    <p className="text-fg-2">{f.whyItMatters}</p>
                  </div>
                  <div>
                    <p className="eyebrow mb-1">How to fix it</p>
                    <p>{f.adjustment}</p>
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={f.priority} />
                <ConfidenceBadge confidence={f.confidence} />
                {f.t0 !== null && (
                  <button onClick={() => onSeek(f.t0!)} className="inline-flex items-center gap-1 rounded-full bg-accent-2-soft px-2.5 py-1 text-xs font-semibold text-accent-2">
                    <Clock className="size-3" /> {formatStamp(f.t0)}
                  </button>
                )}
              </div>
              {drill && (
                <Link href={`/training/drills?d=${drill.id}`} className="flex items-center gap-2 rounded-2xl bg-[var(--hairline)] p-3 text-sm font-semibold hover:text-accent">
                  <Dumbbell className="size-4 text-accent" /> Practice drill: {drill.title} · {drill.reps}
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

export function AiObservationCard({ o, onSeek }: { o: Observation; onSeek: (ms: number) => void }) {
  const [open, setOpen] = useState(false);
  const drill = getDrill(o.drillId);
  return (
    <GlassCard padded={false} className="overflow-hidden" layout>
      <button onClick={() => setOpen((x) => !x)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method="ai" />
            <span className="text-xs font-semibold text-fg-3">{CATEGORY_LABEL[o.category]}</span>
            {o.timestampStart !== null && <span className="text-xs font-semibold text-accent-2 tabular">{formatStamp(o.timestampStart * 1000)}</span>}
          </div>
          <h4 className="mt-2 text-[17px] font-semibold">{o.finding}</h4>
        </div>
        <ChevronDown className={clsx("mt-1 size-5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden">
            <div className="space-y-4 border-t border-[var(--hairline)] px-5 pt-4 pb-5 text-[15px]">
              <div>
                <p className="eyebrow mb-1.5">Evidence ({o.evidenceType === "both" ? "frames + measurements" : o.evidenceType === "visual" ? "video frames" : "measurements"})</p>
                <ul className="space-y-1.5">
                  {o.evidence.map((e, i) => (
                    <li key={i} className="flex gap-2 text-fg-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-3" aria-hidden />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-1">Why it matters</p>
                <p className="text-fg-2">{o.whyItMatters}</p>
              </div>
              <div>
                <p className="eyebrow mb-1">Recommendation</p>
                <p>{o.improvement}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={o.priority} />
                <ConfidenceBadge confidence={o.confidence} />
                {o.timestampStart !== null && (
                  <button onClick={() => onSeek(o.timestampStart! * 1000)} className="inline-flex items-center gap-1 rounded-full bg-accent-2-soft px-2.5 py-1 text-xs font-semibold text-accent-2">
                    <Clock className="size-3" /> Watch {formatStamp(o.timestampStart * 1000)}
                  </button>
                )}
              </div>
              {drill && (
                <Link href={`/training/drills?d=${drill.id}`} className="flex items-center gap-2 rounded-2xl bg-[var(--hairline)] p-3 text-sm font-semibold hover:text-accent">
                  <Dumbbell className="size-4 text-accent" /> Practice drill: {drill.title}
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

export function AiSummary({ report, meta }: { report: CoachingReport; meta: SessionRecord["reportMeta"] }) {
  return (
    <GlassCard strong className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-accent-2/15 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-5 text-accent-2" />
          <p className="eyebrow">AI coach summary</p>
          {meta?.mode === "fixture" && <span className="rounded-full bg-watch-soft px-2 py-0.5 text-[11px] font-semibold text-watch">Test mode — fixture data</span>}
        </div>
        <p className="mt-3 text-[17px] leading-relaxed">{report.summary}</p>
        {report.whatWentWell.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-1.5">What went well</p>
            <ul className="space-y-1">
              {report.whatWentWell.map((w, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <Star className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.recommendedNextSteps.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-1.5">What to practise next</p>
            <ul className="list-inside list-decimal space-y-1 text-[15px] text-fg-2">
              {report.recommendedNextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {meta && <p className="mt-4 text-xs text-fg-3">Generated by {meta.model} · {new Date(meta.createdAt).toLocaleString()}</p>}
      </div>
    </GlassCard>
  );
}

/** Full measurement table per stroke (advanced section). */
export function MeasurementTable({ session, onSeek }: { session: SessionRecord; onSeek: (ms: number) => void }) {
  const strokes = session.strokes.filter((s) => !s.excluded);
  if (!strokes.length) return <p className="text-sm text-fg-2">No strokes detected.</p>;
  return (
    <div className="space-y-4">
      {strokes.map((s) => (
        <div key={s.id} className="rounded-2xl border border-[var(--hairline)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              #{s.index + 1} {STROKE_LABEL[s.type]} <span className="text-sm font-normal text-fg-3">· tracking {s.quality}</span>
            </p>
            <button onClick={() => onSeek(s.t0)} className="text-sm font-semibold text-accent-2 tabular">
              {formatStamp(s.contactT)}
            </button>
          </div>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Measurements for stroke {s.index + 1}</caption>
            <thead>
              <tr className="text-left text-xs text-fg-3">
                <th className="py-1 font-medium">Measurement</th>
                <th className="py-1 font-medium">Value</th>
                <th className="hidden py-1 font-medium sm:table-cell">Type</th>
                <th className="py-1 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {s.metrics.map((m) => (
                <tr key={m.key} className="border-t border-[var(--hairline)] align-top">
                  <td className="py-1.5 pr-2">
                    {m.label}
                    {m.note && <span className="block text-xs text-fg-3">{m.note}</span>}
                  </td>
                  <td className="py-1.5 pr-2 font-semibold whitespace-nowrap tabular">{formatValue(m.value, m.unit)}</td>
                  <td className="hidden py-1.5 pr-2 sm:table-cell">
                    <MethodBadge method={m.method} />
                  </td>
                  <td className="py-1.5 capitalize">{m.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-fg-3">TL = torso lengths (shoulders to hips), used to compare players and camera distances fairly.</p>
    </div>
  );
}
