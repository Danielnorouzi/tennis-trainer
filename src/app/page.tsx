import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BarChart3, Camera, Cpu, Dumbbell, Lock, ScanLine, Sparkles, Video } from "lucide-react";
import { Logo } from "@/components/brand";
import { HeroFigure, Reveal } from "@/components/landing";

export const metadata: Metadata = {
  title: "Rally AI — Perfect your game. One stroke at a time.",
  description: "Get personalized tennis feedback using computer vision and AI. Understand your technique, improve your movement, and track every step forward.",
};

const FEATURES = [
  { icon: ScanLine, title: "Live AI coaching", body: "Prop up your phone and practise. Body tracking runs on your device and gives one short, evidence-based cue at a time — between strokes, never mid-swing." },
  { icon: Video, title: "Precision video analysis", body: "Upload a clip and review every stroke in slow motion with a skeleton overlay, phase timeline, frame stepping and annotated moments." },
  { icon: Dumbbell, title: "Personalised practice", body: "Drills chosen from what was actually observed in your sessions, matched to your level, goals, space and equipment." },
  { icon: BarChart3, title: "Honest progress tracking", body: "Trends only compare like with like — same stroke, same camera angle — and improvements are only highlighted when they repeat." },
];

const STEPS = [
  { icon: Camera, title: "Capture", body: "Your camera feed stays in the browser. Rally AI never streams your live video to a server." },
  { icon: Cpu, title: "Measure on-device", body: "Pose tracking (MediaPipe) estimates 33 body landmarks per frame. Rally AI derives joint angles, timing, rotation estimates and stroke phases." },
  { icon: Activity, title: "Check the evidence", body: "Every observation passes visibility and camera-angle checks. If the footage can’t support it, you’ll see “not enough evidence” instead of a guess." },
  { icon: Sparkles, title: "AI coaching", body: "Optionally, a handful of sampled key frames plus the measurements go to an OpenAI model that writes your report — with confidence levels and timestamps." },
];

const FAQ = [
  { q: "Do I need a ball or a court?", a: "No. Shadow-swing mode works at home, and many drills need only a racket. With a ball, contact timing is still estimated from body motion — Rally AI doesn’t track the ball." },
  { q: "What can’t it measure?", a: "Ball and racket speed, spin, racket-face angle, exact contact point, grip (unless clearly visible) and true 3D joint angles from a single camera. Rally AI tells you when something can’t be assessed." },
  { q: "Where is my video stored?", a: "By default, only on your device. You can choose to never record, delete recordings after analysis, or (with an account) back them up to private cloud storage." },
  { q: "Is this a medical tool?", a: "No. Rally AI gives technique coaching only. If you have pain or an injury, please see a qualified professional." },
  { q: "Which devices work?", a: "Recent iPhone and iPad Safari, Chrome, Edge and desktop Safari. The camera must stay in the foreground while you practise." },
];

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <header className="sticky top-0 z-40 px-4 pt-[env(safe-area-inset-top)]">
        <nav className="glass mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-full py-2 pr-2 pl-4" aria-label="Main">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-7" />
            <span className="display text-[17px]">Rally AI</span>
          </Link>
          <div className="flex items-center gap-1">
            <a href="#how" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-fg-2 hover:text-fg sm:block">How it works</a>
            <Link href="/privacy" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-fg-2 hover:text-fg sm:block">Privacy</Link>
            <Link href="/sign-in" className="rounded-full px-3 py-2 text-sm font-semibold text-fg-2 hover:text-fg">Sign in</Link>
            <Link href="/dashboard" className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Open app</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-16 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-24">
          <Reveal>
            <p className="eyebrow text-accent">Your personal tennis coach. Powered by AI.</p>
            <h1 className="display mt-4 text-[44px] leading-[1.02] sm:text-[64px]">
              Perfect your game.
              <br />
              <span className="text-fg-3">One stroke at a time.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-fg-2">
              Get personalized tennis feedback using computer vision and AI. Understand your technique, improve your movement, and track every step forward.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="inline-flex h-14 items-center gap-2 rounded-full bg-accent px-7 text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_var(--accent)] transition-transform active:scale-[0.97]">
                <ScanLine className="size-5" /> Start Training
              </Link>
              <a href="#how" className="glass inline-flex h-14 items-center rounded-full px-7 text-[17px] font-semibold transition-transform active:scale-[0.97]">
                See How It Works
              </a>
            </div>
            <p className="mt-4 text-sm text-fg-3">No account needed to try it. Tracking runs on your device.</p>
          </Reveal>
          <Reveal delay={0.15}>
            <HeroFigure />
          </Reveal>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20" aria-labelledby="features">
          <h2 id="features" className="sr-only">Features</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div className="glass h-full rounded-[28px] p-7">
                  <f.icon className="size-7 text-accent" />
                  <h3 className="display mt-4 text-2xl">{f.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-fg-2">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-24 bg-bg-2/60 py-20" aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <p className="eyebrow">How the analysis works</p>
              <h2 id="how-title" className="display mt-2 max-w-2xl text-[36px] leading-tight sm:text-[44px]">Fast on your device. Thoughtful in the cloud.</h2>
              <p className="mt-4 max-w-2xl text-[17px] text-fg-2">
                Two systems work together: real-time movement analysis in your browser for instant feedback, and an AI coach that reviews a few carefully chosen frames for deeper explanations.
              </p>
            </Reveal>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.07}>
                  <li className="glass h-full rounded-[24px] p-6">
                    <span className="display text-sm text-fg-3">0{i + 1}</span>
                    <s.icon className="mt-3 size-6 text-accent-2" />
                    <h3 className="display mt-3 text-xl">{s.title}</h3>
                    <p className="mt-2 text-[15px] text-fg-2">{s.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
            <Reveal>
              <div className="glass mt-6 grid gap-4 rounded-[24px] p-6 text-[15px] sm:grid-cols-4">
                {[["Measured", "2D image measurements such as knee and elbow angles", "text-accent"], ["Estimated", "Single-camera 3D estimates such as shoulder rotation", "text-watch"], ["AI interpretation", "What the coach reads from frames and numbers", "text-fg"], ["Recommendation", "Cues and drills, with priority and confidence", "text-accent-2"]].map(([t, d, c]) => (
                  <div key={t}>
                    <p className={`font-semibold ${c}`}>{t}</p>
                    <p className="mt-1 text-fg-2">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="privacy-title">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <Reveal>
              <Lock className="size-8 text-accent" />
              <h2 id="privacy-title" className="display mt-4 text-[36px] leading-tight">Your footage. Your control.</h2>
              <p className="mt-4 text-[17px] text-fg-2">Private by default. Recordings stay on your device unless you choose otherwise, and you can export or delete everything at any time.</p>
              <Link href="/privacy" className="mt-6 inline-block font-semibold text-accent">Read the privacy overview →</Link>
            </Reveal>
            <Reveal delay={0.1}>
              <ul className="glass space-y-4 rounded-[28px] p-7 text-[16px]">
                {["Live video is never streamed to a server", "Only sampled key frames are shared for AI reports — and you can turn that off", "Choose: keep, auto-delete after analysis, or never record", "Private cloud storage with signed links (optional, with an account)", "One-tap export and account deletion"].map((x) => (
                  <li key={x} className="flex gap-3">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24" aria-labelledby="faq-title">
          <h2 id="faq-title" className="display text-[32px]">Questions</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="glass group rounded-[22px] px-6 py-5">
                <summary className="cursor-pointer list-none text-[17px] font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-fg-3 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/dashboard" className="inline-flex h-14 items-center gap-2 rounded-full bg-accent px-8 text-[17px] font-semibold text-white">
              <ScanLine className="size-5" /> Start Training
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] px-4 py-8 text-center text-sm text-fg-3">
        <p>Rally AI · Technique coaching, not medical advice · <Link href="/privacy" className="hover:text-fg">Privacy</Link></p>
      </footer>
    </div>
  );
}
