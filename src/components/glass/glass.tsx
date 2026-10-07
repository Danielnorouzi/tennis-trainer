"use client";

// Reusable glass component system: GlassCard, GlassButton, GlassToolbar, GlassModal,
// GlassSegmentedControl, GlassMetric (GlassNavigation and GlassToast live in their own files).
// Every component respects reduced motion (via <MotionConfig reducedMotion="user">) and reduced
// transparency (via the .glass utilities in globals.css).

import { clsx } from "clsx";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import { X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";

export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 30 } as const;

// ---------------------------------------------------------------------------------------------
// GlassCard
// ---------------------------------------------------------------------------------------------
export interface GlassCardProps extends HTMLMotionProps<"div"> {
  strong?: boolean;
  padded?: boolean;
  interactive?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { strong, padded = true, interactive, className, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      className={clsx(
        strong ? "glass-strong" : "glass",
        "rounded-[var(--radius)]",
        padded && "p-5 sm:p-6",
        interactive && "cursor-pointer transition-shadow hover:shadow-[var(--shadow-lift)]",
        className,
      )}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      transition={spring}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

// ---------------------------------------------------------------------------------------------
// GlassButton
// ---------------------------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "glass" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg" | "xl";

const variantClass: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-105",
  secondary: "bg-fg text-bg hover:opacity-90",
  glass: "glass text-fg hover:brightness-[1.03]",
  ghost: "text-fg hover:bg-[var(--hairline)]",
  danger: "bg-issue text-white hover:brightness-105",
  dark: "glass-dark text-white",
};
const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-full",
  md: "h-11 px-5 text-[15px] gap-2 rounded-full",
  lg: "h-13 px-6 text-base gap-2 rounded-full",
  xl: "h-16 px-8 text-lg gap-2.5 rounded-full",
};

interface ButtonBase {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

export type GlassButtonProps = ButtonBase & Omit<HTMLMotionProps<"button">, "children">;

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = "glass", size = "md", icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      whileTap={{ scale: 0.96 }}
      transition={spring}
      className={clsx(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[filter,opacity,background-color] disabled:pointer-events-none disabled:opacity-45",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </motion.button>
  );
});

export function GlassLinkButton({
  href, variant = "glass", size = "md", icon, className, children, ...rest
}: ButtonBase & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[filter,transform] active:scale-[0.96]",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// GlassToolbar
// ---------------------------------------------------------------------------------------------
export function GlassToolbar({ className, children, dark, ...rest }: ComponentProps<"div"> & { dark?: boolean }) {
  return (
    <div
      role="toolbar"
      className={clsx(dark ? "glass-dark" : "glass", "flex items-center gap-1.5 rounded-full p-1.5", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// GlassSegmentedControl
// ---------------------------------------------------------------------------------------------
export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export function GlassSegmentedControl<T extends string>({
  value, onChange, segments, label, size = "md", dark, className,
}: {
  value: T;
  onChange: (v: T) => void;
  segments: Segment<T>[];
  label: string;
  size?: "sm" | "md";
  dark?: boolean;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    for (let k = 1; k <= segments.length; k++) {
      const j = (i + dir * k + segments.length) % segments.length;
      if (!segments[j].disabled) {
        onChange(segments[j].value);
        refs.current[j]?.focus();
        break;
      }
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        dark ? "bg-white/12" : "bg-[var(--hairline)]",
        "relative inline-flex rounded-full p-1",
        size === "sm" ? "text-[13px]" : "text-sm",
        className,
      )}
    >
      {segments.map((s, i) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={s.disabled}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(s.value)}
            className={clsx(
              "relative z-10 flex-1 rounded-full font-semibold whitespace-nowrap transition-colors disabled:opacity-40",
              size === "sm" ? "h-8 px-3" : "h-9 px-4",
              active ? (dark ? "text-black" : "text-fg") : dark ? "text-white/80" : "text-fg-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className={clsx("absolute inset-0 -z-10 rounded-full shadow-sm", dark ? "bg-white" : "bg-surface")}
              />
            )}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// GlassMetric
// ---------------------------------------------------------------------------------------------
export function GlassMetric({
  label, value, unit, hint, tone = "default", icon, className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "default" | "accent" | "blue" | "ok" | "watch" | "issue" | "muted";
  icon?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    default: "text-fg",
    accent: "text-accent",
    blue: "text-accent-2",
    ok: "text-ok",
    watch: "text-watch",
    issue: "text-issue",
    muted: "text-fg-3",
  }[tone];
  return (
    <div className={clsx("glass rounded-[20px] p-4", className)}>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className={clsx("display mt-1.5 flex items-baseline gap-1 text-[28px] leading-none tabular", toneClass)}>
        <motion.span key={String(value)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
          {value}
        </motion.span>
        {unit && <span className="text-sm font-semibold text-fg-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs text-fg-3">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// GlassModal (accessible dialog with focus trap + escape)
// ---------------------------------------------------------------------------------------------
export function GlassModal({
  open, onClose, title, children, footer, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={spring}
            className={clsx(
              "glass-strong relative m-0 max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:m-4 sm:rounded-[28px] sm:pb-6",
              { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size],
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id={titleId} className="display text-xl">
                {title}
              </h2>
              <button onClick={onClose} aria-label="Close" className="-m-1 rounded-full p-2 text-fg-2 hover:bg-[var(--hairline)]">
                <X className="size-5" />
              </button>
            </div>
            {children}
            {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
