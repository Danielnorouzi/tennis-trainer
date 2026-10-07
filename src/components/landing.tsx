"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 200, damping: 28, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Original hero illustration: an abstract player skeleton mid-forehand with a glowing swing arc,
 * phase markers and a floating "coaching card" — rendered as SVG, no photos or third-party art.
 */
export function HeroFigure() {
  const reduce = useReducedMotion();
  const joints: [number, number][] = [
    [200, 92], [178, 132], [226, 128], [150, 168], [262, 160], [128, 204], [300, 176],
    [184, 220], [222, 220], [172, 286], [236, 282], [150, 352], [262, 350],
  ];
  const bones: [number, number][] = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12]];
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-[440px]">
      <div className="glass absolute inset-0 overflow-hidden rounded-[36px]">
        <div aria-hidden className="absolute -top-16 -left-10 size-72 rounded-full bg-accent/25 blur-3xl" />
        <div aria-hidden className="absolute -right-16 -bottom-10 size-72 rounded-full bg-accent-2/20 blur-3xl" />
        <svg viewBox="0 0 400 480" className="relative size-full" role="img" aria-label="Illustration of a tracked tennis swing with body landmarks and a swing path">
          <defs>
            <linearGradient id="arc" x1="0" x2="1">
              <stop offset="0" stopColor="var(--accent-2)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <line x1="40" y1="372" x2="360" y2="372" stroke="var(--hairline)" strokeWidth="2" />
          <motion.path
            d="M 330 250 C 300 120, 150 110, 96 150"
            fill="none"
            stroke="url(#arc)"
            strokeWidth="7"
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: reduce ? 0 : Infinity, repeatDelay: 1.2 }}
          />
          {bones.map(([a, b], i) => (
            <line key={i} x1={joints[a][0]} y1={joints[a][1]} x2={joints[b][0]} y2={joints[b][1]} stroke="var(--fg)" strokeOpacity="0.75" strokeWidth="5" strokeLinecap="round" />
          ))}
          {joints.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 0 ? 14 : i === 9 || i === 10 ? 8 : 6} fill={i === 9 || i === 10 ? "var(--accent)" : "var(--fg)"} fillOpacity={i === 0 ? 0.9 : 1} />
          ))}
          <text x="248" y="300" fontSize="13" fontWeight="600" fill="var(--accent)">
            142°
          </text>
          {[["Preparation", 96, 150], ["Contact (est.)", 300, 176]].map(([t, x, y]) => (
            <g key={t as string}>
              <circle cx={x as number} cy={y as number} r="5" fill="var(--accent-2)" />
              <text x={(x as number) - 10} y={(y as number) - 14} fontSize="11" fill="var(--fg-2)">
                {t}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <motion.div
        className="glass-strong absolute -bottom-5 left-4 right-4 rounded-[22px] p-4 sm:-right-6 sm:left-auto sm:w-64"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 220, damping: 26 }}
      >
        <p className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Live cue · example</p>
        <p className="display mt-1 text-lg">Prepare earlier.</p>
        <p className="mt-1 text-xs text-fg-2">Illustration only — real cues appear only when your tracked movement supports them.</p>
      </motion.div>
    </div>
  );
}
