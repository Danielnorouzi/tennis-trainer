"use client";

import { Heart, LogIn, LogOut, Save, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { nowMs } from "@/lib/clock";
import { GlassButton, GlassCard, GlassLinkButton, GlassSegmentedControl } from "@/components/glass/glass";
import { useToast } from "@/components/glass/toast";
import { Chip, ErrorState, Field, PageHeader, PageSkeleton, Section, TextInput } from "@/components/ui";
import { defaultProfile, useStore, useStoreContext, useStoreQuery } from "@/lib/data/provider";
import type { Profile } from "@/lib/data/types";
import { getSupabase } from "@/lib/supabase/client";
import { getDrill } from "@/lib/tennis/drills";

const GOALS = ["More consistent forehand", "Better backhand", "Stronger serve", "Faster footwork", "Better balance", "Earlier preparation", "Play matches with confidence"];

export default function ProfilePage() {
  const store = useStore();
  const toast = useToast();
  const { user, status } = useStoreContext();
  const q = useStoreQuery(async (s) => ({ profile: (await s.getProfile()) ?? defaultProfile(), favorites: await s.listFavorites(), sessions: (await s.listSessions()).length }));
  const [edits, setEdits] = useState<Partial<Profile>>({});
  const p: Profile | null = q.data ? { ...q.data.profile, ...edits } : null;

  if (q.error) return <ErrorState onRetry={q.reload} />;
  if (q.loading || !p || !q.data) return <PageSkeleton />;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setEdits((x) => ({ ...x, [k]: v }));
  const save = async () => {
    await store?.saveProfile({ ...p, onboarded: true, updatedAt: nowMs() });
    setEdits({});
    toast({ tone: "success", title: "Profile saved" });
  };

  return (
    <div>
      <PageHeader eyebrow="Profile" title={p.name ? p.name : "Your profile"} subtitle="Rally AI adapts explanations, stroke reading and drills to these details." actions={<GlassLinkButton href="/settings" icon={<Settings className="size-4" />}>Settings</GlassLinkButton>} />

      <GlassCard className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{user ? user.email : "Guest mode"}</p>
          <p className="text-sm text-fg-2">
            {user ? "Your sessions sync to your private account (protected by row-level security)." : "Everything is stored only on this device. Create an account to sync across devices."}
          </p>
        </div>
        {user ? (
          <GlassButton icon={<LogOut className="size-4" />} onClick={async () => { await getSupabase()?.auth.signOut(); toast({ tone: "info", title: "Signed out" }); }}>Sign out</GlassButton>
        ) : status?.supabase ? (
          <GlassLinkButton href="/sign-in" variant="primary" icon={<LogIn className="size-4" />}>Sign in</GlassLinkButton>
        ) : (
          <span className="text-xs text-fg-3">Accounts aren’t configured on this server.</span>
        )}
      </GlassCard>

      <Section title="About your game">
        <GlassCard className="space-y-6">
          <Field label="First name">
            <TextInput value={p.name} onChange={(e) => set("name", e.target.value.slice(0, 40))} autoComplete="given-name" />
          </Field>
          <Row label="Level (adjusts how technical explanations are)">
            <GlassSegmentedControl label="Level" value={p.experience} onChange={(v) => set("experience", v)} segments={[{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]} />
          </Row>
          <div className="grid gap-6 sm:grid-cols-2">
            <Row label="Dominant hand">
              <GlassSegmentedControl label="Dominant hand" value={p.handedness} onChange={(v) => set("handedness", v)} segments={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} />
            </Row>
            <Row label="Backhand">
              <GlassSegmentedControl label="Backhand" value={p.backhand} onChange={(v) => set("backhand", v)} segments={[{ value: "two", label: "Two-handed" }, { value: "one", label: "One-handed" }]} />
            </Row>
          </div>
          <Row label="Training frequency">
            <GlassSegmentedControl label="Training frequency" value={p.frequency} onChange={(v) => set("frequency", v)} segments={[{ value: "occasional", label: "Occasional" }, { value: "weekly", label: "Weekly" }, { value: "2-3_per_week", label: "2–3×" }, { value: "4+_per_week", label: "4+×" }]} />
          </Row>
          <Row label="Environment">
            <GlassSegmentedControl label="Environment" value={p.environment} onChange={(v) => set("environment", v)} segments={[{ value: "court", label: "Court" }, { value: "home", label: "Home" }, { value: "both", label: "Both" }]} />
          </Row>
          <Row label="Goals">
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <Chip key={g} selected={p.goals.includes(g)} onClick={() => set("goals", p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g])}>{g}</Chip>
              ))}
            </div>
          </Row>
          <div className="flex justify-end">
            <GlassButton variant="primary" icon={<Save className="size-4" />} onClick={save}>Save profile</GlassButton>
          </div>
        </GlassCard>
      </Section>

      <Section title="Favorites">
        {q.data.favorites.length ? (
          <GlassCard padded={false}>
            <ul className="divide-y divide-[var(--hairline)]">
              {q.data.favorites.map((f) => (
                <li key={f.id}>
                  <Link href={f.kind === "drill" ? `/training/drills?d=${f.refId}` : `/sessions/${f.refId}`} className="flex items-center gap-3 px-5 py-3.5 hover:text-accent">
                    <Heart className="size-4 text-issue" />
                    <span className="font-medium">{f.kind === "drill" ? getDrill(f.refId)?.title ?? f.label : f.label}</span>
                    <span className="ml-auto text-xs text-fg-3 capitalize">{f.kind}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : (
          <p className="text-[15px] text-fg-2">Save helpful drills and sessions with the heart or star buttons.</p>
        )}
      </Section>
      <p className="mt-8 text-xs text-fg-3">{q.data.sessions} sessions recorded · member since {new Date(p.createdAt).toLocaleDateString()}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-fg-2">{label}</p>
      {children}
    </div>
  );
}
