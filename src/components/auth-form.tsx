"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard } from "./glass/glass";
import { Field, TextInput } from "./ui";
import { Logo } from "./brand";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "sign-up") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name: name.slice(0, 40) }, emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
        });
        if (error) throw error;
        if (!data.session) setInfo("Check your email to confirm your account, then come back to sign in.");
        else router.replace("/onboarding");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const magicLink = async () => {
    const sb = getSupabase();
    if (!sb || !email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard` } });
    setBusy(false);
    if (error) setError(error.message);
    else setInfo("We sent you a sign-in link.");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Rally AI
      </Link>
      <Logo className="mb-5 size-12" />
      <h1 className="display text-[34px] leading-tight">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-fg-2">
        {mode === "sign-in" ? "Sign in to sync your sessions across devices." : "Sync sessions across devices and keep a private training history."}
      </p>
      {!supabaseEnabled ? (
        <GlassCard className="mt-8">
          <p className="font-semibold">Accounts aren’t configured on this server</p>
          <p className="mt-1 text-sm text-fg-2">You can use Rally AI fully as a guest — everything is stored privately on this device.</p>
          <GlassButton variant="primary" className="mt-4" onClick={() => router.push("/dashboard")}>Continue as guest</GlassButton>
        </GlassCard>
      ) : (
        <GlassCard className="mt-8">
          <form onSubmit={submit} className="space-y-4">
            {mode === "sign-up" && (
              <Field label="First name (optional)">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
              </Field>
            )}
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
            </Field>
            <Field label="Password" hint={mode === "sign-up" ? "At least 8 characters." : undefined}>
              <TextInput type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} />
            </Field>
            {error && <p role="alert" className="rounded-xl bg-issue-soft px-3 py-2 text-sm font-medium text-issue">{error}</p>}
            {info && <p role="status" className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-medium text-ok">{info}</p>}
            <GlassButton type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </GlassButton>
            {mode === "sign-in" && (
              <GlassButton variant="ghost" className="w-full" icon={<Mail className="size-4" />} onClick={magicLink} disabled={busy}>
                Email me a sign-in link
              </GlassButton>
            )}
          </form>
        </GlassCard>
      )}
      <p className="mt-6 text-center text-sm text-fg-2">
        {mode === "sign-in" ? (
          <>New here? <Link href="/sign-up" className="font-semibold text-accent">Create an account</Link> · <Link href="/dashboard" className="font-semibold text-accent">Try as guest</Link></>
        ) : (
          <>Already have an account? <Link href="/sign-in" className="font-semibold text-accent">Sign in</Link></>
        )}
      </p>
      <p className="mt-3 text-center text-xs text-fg-3">
        Guest data stays on this device and isn’t merged into a new account automatically. Export it from Settings first if you want to keep it.
      </p>
    </main>
  );
}
