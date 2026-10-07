"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { StoreProvider, useSettings, useStore } from "@/lib/data/provider";
import { resumeJobs } from "@/lib/analysis/jobs";
import { ToastProvider } from "./glass/toast";

/** Mirrors theme/transparency settings onto <html> (and localStorage for the no-flash script). */
function ThemeSync() {
  const { settings, loading } = useSettings();
  useEffect(() => {
    if (loading) return;
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    if (settings.reducedTransparency) root.dataset.transparency = "reduced";
    else delete root.dataset.transparency;
    try {
      localStorage.setItem("rally.theme", settings.theme);
      localStorage.setItem("rally.transparency", settings.reducedTransparency ? "reduced" : "normal");
    } catch {
      /* storage blocked */
    }
  }, [settings.theme, settings.reducedTransparency, loading]);
  return null;
}

/** Resumes queued/interrupted AI analysis jobs whenever the store becomes available. */
function JobRunner() {
  const store = useStore();
  useEffect(() => {
    if (store) void resumeJobs(store);
  }, [store]);
  return null;
}

/** Applies the "automatically delete old sessions" setting once per app start. */
function RetentionSweeper() {
  const store = useStore();
  const { settings, loading } = useSettings();
  useEffect(() => {
    if (!store || loading || !settings.retentionDays) return;
    const cutoff = Date.now() - settings.retentionDays * 86_400_000;
    void store.listSessions().then(async (all) => {
      for (const s of all) if (s.startedAt < cutoff && !s.favorite) await store.deleteSession(s.id);
    });
  }, [store, loading, settings.retentionDays]);
  return null;
}

function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <ToastProvider>
          <ThemeSync />
          <JobRunner />
          <RetentionSweeper />
          <ServiceWorker />
          {children}
        </ToastProvider>
      </StoreProvider>
    </MotionConfig>
  );
}
