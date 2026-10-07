import type { ReactNode } from "react";
import { MobileTabBar, Sidebar } from "@/components/glass/navigation";
import { OnboardingGate } from "@/components/onboarding-gate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main id="main" className="min-w-0 flex-1 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+112px)] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <MobileTabBar />
      <OnboardingGate />
    </div>
  );
}
