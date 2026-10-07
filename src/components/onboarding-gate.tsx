"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useProfile } from "@/lib/data/provider";

const SKIP_KEY = "rally.onboardingSkipped";

/** Sends first-time users to the (skippable) onboarding once, from the dashboard. */
export function OnboardingGate() {
  const { data: profile, loading } = useProfile();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (loading || path !== "/dashboard") return;
    let skipped = false;
    try {
      skipped = localStorage.getItem(SKIP_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!profile?.onboarded && !skipped) router.replace("/onboarding");
  }, [loading, profile, path, router]);
  return null;
}

export function markOnboardingSkipped() {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}
