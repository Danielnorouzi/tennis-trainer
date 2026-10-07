"use client";

// Chart wrappers (Recharts) themed from CSS tokens. Each chart has an accessible text summary.

import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatValue } from "@/lib/tennis/labels";

/** Resolve CSS custom properties to concrete colours (SVG attributes can't use var()). */
export function useTokens() {
  const read = () => {
    if (typeof window === "undefined") return { accent: "#2b8a4f", accent2: "#3a78d6", fg2: "#5f5f66", fg3: "#8a8a91", hairline: "rgba(0,0,0,.08)", surface: "#fff" };
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { accent: v("--accent"), accent2: v("--accent-2"), fg2: v("--fg-2"), fg3: v("--fg-3"), hairline: v("--hairline"), surface: v("--surface") };
  };
  const [t, setT] = useState(read);
  useEffect(() => {
    const update = () => setT(read());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);
  return t;
}

const tooltipStyle = (surface: string) => ({
  background: surface,
  border: "none",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,.15)",
  fontSize: 13,
});

export function WeeklyBars({ data, valueKey = "minutes", label }: { data: { label: string; minutes: number; sessions: number }[]; valueKey?: "minutes" | "sessions"; label: string }) {
  const t = useTokens();
  const total = data.reduce((s, d) => s + d[valueKey], 0);
  return (
    <figure>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${d.label} ${d[valueKey]}`).join(", ")}. Total {Math.round(total)}.
      </figcaption>
      <div className="h-36" aria-hidden>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: t.fg3, fontSize: 12 }} />
            <Tooltip cursor={{ fill: t.hairline }} contentStyle={tooltipStyle(t.surface)} formatter={(v) => [`${v} ${valueKey === "minutes" ? "min" : "sessions"}`, ""]} />
            <Bar dataKey={valueKey} fill={t.accent} radius={[8, 8, 8, 8]} maxBarSize={28} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function TrendChart({
  points, unit, label, better,
}: {
  points: { date: number; value: number; n: number }[];
  unit: string;
  label: string;
  better: "higher" | "lower" | "neutral";
}) {
  const t = useTokens();
  const data = points.map((p) => ({ ...p, d: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  return (
    <figure>
      <figcaption className="sr-only">
        {label} across {points.length} sessions, from {formatValue(first ?? 0, unit)} to {formatValue(last ?? 0, unit)}.
        {better !== "neutral" ? ` ${better === "higher" ? "Higher" : "Lower"} is generally better.` : ""}
      </figcaption>
      <div className="h-44" aria-hidden>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={t.hairline} vertical={false} />
            <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: t.fg3, fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: t.fg3, fontSize: 11 }} width={48} domain={["auto", "auto"]} />
            <Tooltip contentStyle={tooltipStyle(t.surface)} formatter={(v, _n, item) => [`${formatValue(Number(v), unit)} (median of ${(item.payload as { n: number }).n})`, label]} />
            {first !== undefined && <ReferenceLine y={first} stroke={t.fg3} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="value" stroke={t.accent2} strokeWidth={2.5} dot={{ r: 3.5, fill: t.accent2 }} activeDot={{ r: 5 }} animationDuration={800} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function AngleTimeline({
  series, label,
}: {
  series: { name: string; color: string; data: { t: number; v: number | null }[] }[];
  label: string;
}) {
  const t = useTokens();
  const merged = new Map<number, Record<string, number | null>>();
  for (const s of series) for (const p of s.data) merged.set(p.t, { ...(merged.get(p.t) ?? { t: p.t }), [s.name]: p.v });
  const data = [...merged.values()].sort((a, b) => (a.t as number) - (b.t as number));
  return (
    <figure>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="h-48" aria-hidden>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={t.hairline} vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: t.fg3, fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: t.fg3, fontSize: 11 }} width={44} domain={[40, 180]} />
            <Tooltip contentStyle={tooltipStyle(t.surface)} labelFormatter={(v) => `${v}% of stroke`} formatter={(v) => (v === null ? "—" : `${Math.round(Number(v))}°`)} />
            {series.map((s) => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls animationDuration={600} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function ScoreRing({ score, size = 76, label }: { score: number | null; size?: number; label: string }) {
  const t = useTokens();
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={score === null ? `${label}: not enough evidence` : `${label}: ${score} out of 100 (heuristic)`}>
      <ResponsiveContainer>
        <RadialBarChart innerRadius="78%" outerRadius="100%" data={[{ v: score ?? 0 }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" cornerRadius={20} fill={score === null ? t.fg3 : score >= 80 ? t.accent : score >= 60 ? "#ffb020" : "#ff6961"} background={{ fill: t.hairline }} animationDuration={900} />
        </RadialBarChart>
      </ResponsiveContainer>
      <span className="display absolute inset-0 grid place-items-center text-lg tabular">{score === null ? "—" : score}</span>
    </div>
  );
}
