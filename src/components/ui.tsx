"use client";

// Small shared UI primitives: page header, badges, empty/error/loading states, toggles, fields.

import { clsx } from "clsx";
import { motion } from "motion/react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { GlassButton, GlassCard, softSpring } from "./glass/glass";
import { CONFIDENCE_LABEL, PRIORITY_LABEL, SEVERITY_LABEL } from "@/lib/tennis/labels";
import type { Confidence, Priority, Severity } from "@/lib/tennis/types";

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="display text-[32px] leading-[1.08] sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-fg-2 sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const SEV_STYLE: Record<Severity, string> = {
  ok: "bg-ok-soft text-ok",
  watch: "bg-watch-soft text-watch",
  issue: "bg-issue-soft text-issue",
  insufficient: "bg-insufficient-soft text-insufficient",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", SEV_STYLE[severity], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function ConfidenceBadge({ confidence, className }: { confidence: Confidence; className?: string }) {
  const bars = { low: 1, medium: 2, high: 3 }[confidence];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full bg-[var(--hairline)] px-2.5 py-1 text-xs font-medium text-fg-2", className)} title={CONFIDENCE_LABEL[confidence]}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((b) => (
          <span key={b} className={clsx("w-[3px] rounded-sm", b <= bars ? "bg-fg-2" : "bg-fg-3/30")} style={{ height: 4 + b * 2.5 }} />
        ))}
      </span>
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        priority === "high" ? "bg-accent-2-soft text-accent-2" : "bg-[var(--hairline)] text-fg-2",
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function MethodBadge({ method }: { method: "measured_2d" | "estimated_3d" | "derived" | "ai" }) {
  const label = { measured_2d: "Measured (2D)", estimated_3d: "Estimated (3D model)", derived: "Derived timing", ai: "AI interpretation" }[method];
  const cls = {
    measured_2d: "border-accent/40 text-accent",
    estimated_3d: "border-watch/50 text-watch",
    derived: "border-accent-2/40 text-accent-2",
    ai: "border-fg-3/40 text-fg-2",
  }[method];
  return <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <GlassCard className="flex flex-col items-center px-6 py-12 text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <h2 className="display text-xl">{title}</h2>
      {body && <p className="mt-2 max-w-sm text-[15px] text-fg-2">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </GlassCard>
  );
}

export function ErrorState({ title = "Something went wrong", body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <GlassCard className="flex flex-col items-center px-6 py-10 text-center" role="alert">
      <AlertCircle className="mb-3 size-8 text-issue" aria-hidden />
      <h2 className="display text-lg">{title}</h2>
      {body && <p className="mt-1.5 max-w-sm text-sm text-fg-2">{body}</p>}
      {onRetry && (
        <GlassButton className="mt-5" onClick={onRetry} icon={<RefreshCw className="size-4" />}>
          Try again
        </GlassButton>
      )}
    </GlassCard>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-44 w-full rounded-[22px]" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-[20px]" />
        <Skeleton className="h-28 rounded-[20px]" />
        <Skeleton className="h-28 rounded-[20px]" />
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("flex cursor-pointer items-start justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-50")}>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-fg-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-[31px] w-[51px] shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-fg-3/35")}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
          className={clsx("absolute top-[2px] size-[27px] rounded-full bg-white shadow-md", checked ? "right-[2px]" : "left-[2px]")}
        />
      </button>
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={clsx(
        "h-12 w-full rounded-2xl border border-[var(--hairline)] bg-surface/70 px-4 text-[16px] outline-none transition focus:border-accent-2 focus:ring-4 focus:ring-accent-2-soft",
        props.className,
      )}
    />
  );
}

export function TextArea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full rounded-2xl border border-[var(--hairline)] bg-surface/70 px-4 py-3 text-[16px] outline-none transition focus:border-accent-2 focus:ring-4 focus:ring-accent-2-soft",
        props.className,
      )}
    />
  );
}

export function Chip({ selected, onClick, children, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
        selected ? "border-accent bg-accent-soft text-accent" : "border-[var(--hairline)] bg-surface/60 text-fg-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("mt-8", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="display text-[21px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
