"use client";

// GlassNavigation: a floating translucent tab bar on phones (safe-area aware, 5 tabs) and a
// sidebar on desktop with the full set of destinations.

import { clsx } from "clsx";
import {
  ChartNoAxesColumn, Dumbbell, GitCompareArrows, House, LibraryBig, MessageCircle, ScanLine, Settings, UserRound, Video,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { spring } from "./glass";
import { Logo } from "../brand";

const TABS = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/coach/live", label: "Live Coach", icon: ScanLine },
  { href: "/analyze", label: "Analyze", icon: Video },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const SIDEBAR = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/coach/live", label: "Live Coach", icon: ScanLine },
  { href: "/analyze", label: "Analyze video", icon: Video },
  { href: "/sessions", label: "Sessions", icon: LibraryBig },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/assistant", label: "AI Coach", icon: MessageCircle },
] as const;

function isActive(path: string, href: string, aliasSessions = false) {
  if (href === "/dashboard") return path === "/dashboard";
  // The phone tab bar has no Sessions tab, so session pages highlight "Analyze" there.
  return path === href || path.startsWith(`${href}/`) || (aliasSessions && href === "/analyze" && path.startsWith("/sessions"));
}

export function MobileTabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden"
    >
      <ul className="glass-strong flex w-full max-w-md items-stretch justify-between rounded-[28px] p-1.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href, true);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-[10.5px] font-semibold transition-colors",
                  active ? "text-accent" : "text-fg-2",
                )}
              >
                {active && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 -z-10 rounded-[22px] bg-accent-soft" />}
                <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col px-4 py-6 lg:flex" aria-label="Sidebar">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-3">
        <Logo className="size-8" />
        <span className="display text-[19px]">Rally AI</span>
      </Link>
      <nav aria-label="Primary" className="flex-1">
        <ul className="space-y-0.5">
          {SIDEBAR.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "relative flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition-colors",
                    active ? "text-fg" : "text-fg-2 hover:text-fg",
                  )}
                >
                  {active && <motion.span layoutId="side-pill" transition={spring} className="glass absolute inset-0 -z-10 rounded-2xl" />}
                  <Icon className={clsx("size-5", active && "text-accent")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="space-y-0.5 border-t border-[var(--hairline)] pt-3">
        {[
          { href: "/profile", label: "Profile", icon: UserRound },
          { href: "/settings", label: "Settings", icon: Settings },
        ].map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx("flex h-10 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium", active ? "text-fg" : "text-fg-2 hover:text-fg")}
            >
              <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
