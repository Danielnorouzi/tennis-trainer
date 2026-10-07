import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Privacy" };

const ROWS: [string, string, string][] = [
  ["Live camera feed", "Your browser only", "Pose landmarks are computed on your device. The live feed is never streamed to any server."],
  ["Recordings", "This device (IndexedDB) by default", "You choose: keep, delete after the AI report, or never record. With an account you may opt in to a private cloud bucket (signed, expiring links)."],
  ["Pose traces & measurements", "This device, or your account", "Body-landmark coordinates and derived measurements, used for replays, progress charts and re-analysis."],
  ["Sampled key frames", "Sent to OpenAI only when you request an AI report", "Up to ~20 small still images per report (never the full video), plus measurements. You can turn frame sharing off in Settings. Requests are made with storage disabled (store: false)."],
  ["Chat messages", "Sent to OpenAI to answer", "Along with a compact summary of your own sessions. Saved in your conversation history on this device or your account."],
  ["Voice", "Browser speech synthesis; optional OpenAI Realtime", "The microphone is only used when you turn on voice commands or the conversational coach — permission is requested separately from the camera."],
  ["Account data", "Supabase (if configured)", "Protected by Row Level Security: each user can only access their own rows and files."],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+32px)] pb-20">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Rally AI
      </Link>
      <h1 className="display mt-6 text-[40px] leading-tight">Privacy, plainly</h1>
      <p className="mt-3 text-[17px] text-fg-2">
        Videos of you are personal. Rally AI is private by default, analyses movement on your device, and only shares what you allow.
      </p>

      <div className="glass mt-8 overflow-hidden rounded-[24px]">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">What data is processed where</caption>
          <thead>
            <tr className="text-xs text-fg-3">
              <th className="px-5 py-3 font-semibold">Data</th>
              <th className="px-5 py-3 font-semibold">Where</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Details</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([d, w, x]) => (
              <tr key={d} className="border-t border-[var(--hairline)] align-top">
                <td className="px-5 py-4 font-semibold">{d}</td>
                <td className="px-5 py-4 text-fg-2">
                  {w}
                  <span className="mt-1 block text-sm text-fg-3 sm:hidden">{x}</span>
                </td>
                <td className="hidden px-5 py-4 text-fg-2 sm:table-cell">{x}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 space-y-4 text-[16px] leading-relaxed text-fg-2">
        <h2 className="display text-2xl text-fg">Your controls</h2>
        <ul className="list-inside list-disc space-y-1.5">
          <li>Export all your data as JSON from Settings.</li>
          <li>Delete individual recordings, sessions, or everything on this device.</li>
          <li>Signed-in users can permanently delete their account, which removes all rows and stored files.</li>
          <li>Set sessions to be deleted automatically after 30, 90 or 365 days.</li>
          <li>Guest data is kept separately from account data and is never visible to other users.</li>
        </ul>
        <h2 className="display pt-4 text-2xl text-fg">Not a medical service</h2>
        <p>Rally AI provides technique coaching. It does not diagnose injuries or medical conditions. If you feel pain, stop and consult a qualified professional.</p>
      </section>
    </main>
  );
}
