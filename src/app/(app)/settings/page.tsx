"use client";

import { Download, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard, GlassModal, GlassSegmentedControl } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { PageHeader, PageSkeleton, Section, Toggle } from "@/components/ui";
import { useSettings, useStore, useStoreContext } from "@/lib/data/provider";
import { getSupabase } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { settings, loading, save } = useSettings();
  const store = useStore();
  const { user, status } = useStoreContext();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState<"local" | "account" | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <PageSkeleton />;

  const exportAll = async () => {
    if (!store) return;
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rally-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const deleteAll = async () => {
    setBusy(true);
    try {
      if (confirm === "account") {
        const res = await fetch("/api/account/delete", { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error?.message ?? "Could not delete the account.");
        await store?.clearAll();
        await getSupabase()?.auth.signOut();
      } else {
        await store?.clearAll();
      }
      try {
        localStorage.removeItem("rally.onboardingSkipped");
      } catch {
        /* ignore */
      }
      toast({ tone: "success", title: confirm === "account" ? "Account deleted" : "All data on this device deleted" });
      router.replace("/");
    } catch (e) {
      toast({ tone: "error", title: "Deletion failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" />

      <Section title="Appearance" className="!mt-0">
        <GlassCard className="divide-y divide-[var(--hairline)] !py-2">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-[15px] font-medium">Theme</span>
            <GlassSegmentedControl label="Theme" value={settings.theme} onChange={(theme) => save({ theme })} segments={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </div>
          <Toggle checked={settings.reducedTransparency} onChange={(v) => save({ reducedTransparency: v })} label="Reduce transparency" description="Solid surfaces instead of glass, for readability." />
        </GlassCard>
      </Section>

      <Section title="Coaching">
        <GlassCard className="divide-y divide-[var(--hairline)] !py-2">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-[15px] font-medium">Voice coach</span>
            <GlassSegmentedControl label="Voice mode" value={settings.voiceMode} onChange={(voiceMode) => save({ voiceMode })} segments={[{ value: "quiet", label: "Quiet" }, { value: "training", label: "Training" }, { value: "coach", label: "Coach" }, { value: "review", label: "Review" }]} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-[15px] font-medium">Default camera position</span>
            <GlassSegmentedControl label="Default camera position" value={settings.defaultView} onChange={(defaultView) => save({ defaultView })} segments={[{ value: "side", label: "Side" }, { value: "front", label: "Front" }, { value: "rear", label: "Behind" }, { value: "diagonal", label: "Diagonal" }]} />
          </div>
          <Toggle checked={settings.showSkeleton} onChange={(v) => save({ showSkeleton: v })} label="Show skeleton overlay by default" />
          <Toggle checked={settings.showAngles} onChange={(v) => save({ showAngles: v })} label="Show joint angles by default" />
        </GlassCard>
      </Section>

      <Section title="Privacy & AI">
        <GlassCard className="divide-y divide-[var(--hairline)] !py-2">
          <div className="py-3">
            <p className="text-[15px] font-medium">Recordings</p>
            <p className="mb-2 text-sm text-fg-2">Pose tracking always runs on your device. Choose what happens to the video itself.</p>
            <GlassSegmentedControl label="Recording retention" value={settings.retention} onChange={(retention) => save({ retention })} segments={[{ value: "keep", label: "Keep" }, { value: "delete_after_analysis", label: "Delete after AI report" }, { value: "never_record", label: "Never record" }]} />
          </div>
          <Toggle
            checked={settings.cloudVideo}
            disabled={!user}
            onChange={(v) => save({ cloudVideo: v })}
            label="Back up recordings to my private cloud storage"
            description={user ? "Stored in a private bucket only you can access, served via short-lived signed links." : "Sign in to enable. Guests' videos never leave the device."}
          />
          <Toggle
            checked={settings.aiFrames}
            onChange={(v) => save({ aiFrames: v })}
            label="Share sampled key frames with the AI coach"
            description="Up to ~20 small still images per report (never the full video or live feed) plus measurements are sent to OpenAI. Off = measurements only."
          />
          <Toggle checked={settings.autoAnalyze} onChange={(v) => save({ autoAnalyze: v })} label="Request an AI report automatically after each session" />
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[15px] font-medium">Automatically delete old sessions</p>
              <p className="text-sm text-fg-2">Applies to sessions on this device and in your account.</p>
            </div>
            <GlassSegmentedControl label="Retention period" value={String(settings.retentionDays)} onChange={(v) => save({ retentionDays: Number(v) })} segments={[{ value: "0", label: "Never" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }, { value: "365", label: "1 yr" }]} />
          </div>
        </GlassCard>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-3">
          <ShieldCheck className="size-4" /> Read exactly what is processed where in the <Link href="/privacy" className="font-semibold text-accent">privacy overview</Link>.
        </p>
      </Section>

      <Section title="Your data">
        <GlassCard className="flex flex-wrap gap-2">
          <GlassButton icon={<Download className="size-4" />} onClick={exportAll}>Export all data (JSON)</GlassButton>
          <GlassButton variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("local")}>
            {user ? "Delete synced data cache on this device" : "Delete all data on this device"}
          </GlassButton>
          {user && (
            <GlassButton variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("account")}>Delete my account</GlassButton>
          )}
        </GlassCard>
      </Section>

      <Section title="Service status">
        <GlassCard className="text-sm text-fg-2">
          <p>AI coaching: <strong className="text-fg">{status ? { live: "available", fixture: "local test mode (fixture data)", unavailable: "not configured" }[status.ai] : "checking…"}</strong>{status?.models ? ` · ${status.models.analysis} / ${status.models.fast}` : ""}</p>
          <p className="mt-1">Conversational voice: <strong className="text-fg">{status?.realtime ? "enabled" : "off"}</strong> · Accounts: <strong className="text-fg">{status?.supabase ? "enabled" : "guest only"}</strong></p>
          {status && <p className="mt-1">Today’s estimated AI usage: ${status.usage.spentUsd.toFixed(3)} of ${status.usage.budgetUsd.toFixed(2)} daily limit.</p>}
          <p className="mt-3 text-xs text-fg-3">Rally AI gives coaching guidance only. It is not a medical or injury-diagnosis tool.</p>
        </GlassCard>
      </Section>

      <GlassModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "account" ? "Delete your account?" : "Delete all data?"}
        size="sm"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setConfirm(null)}>Cancel</GlassButton>
            <GlassButton variant="danger" loading={busy} onClick={deleteAll}>Delete permanently</GlassButton>
          </>
        }
      >
        <p className="text-fg-2">
          {confirm === "account"
            ? "Your account, all sessions, recordings in cloud storage, reports, plans and conversations will be permanently deleted. This can’t be undone."
            : "All sessions, recordings, reports, plans and settings stored in this browser will be permanently deleted. This can’t be undone."}
        </p>
      </GlassModal>
    </div>
  );
}
