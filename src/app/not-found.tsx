import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="display mt-2 text-4xl">Out of bounds</h1>
        <p className="mt-2 text-fg-2">That page doesn’t exist.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 font-semibold text-white">Back to Rally AI</Link>
      </div>
    </main>
  );
}
