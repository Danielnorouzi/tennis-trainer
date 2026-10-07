"use client";

import { LibraryBig, ScanLine, Search, Star, Video } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GlassCard, GlassLinkButton, GlassSegmentedControl } from "@/components/glass/glass";
import { EmptyState, ErrorState, PageHeader, PageSkeleton, SeverityBadge, TextInput } from "@/components/ui";
import { useStoreQuery } from "@/lib/data/provider";
import { SELECTION_LABEL, formatClock } from "@/lib/tennis/labels";

export default function SessionsPage() {
  const q = useStoreQuery((s) => s.listSessions());
  const [filter, setFilter] = useState<"all" | "live" | "upload" | "favorites">("all");
  const [text, setText] = useState("");
  const list = useMemo(() => {
    let xs = q.data ?? [];
    if (filter === "live" || filter === "upload") xs = xs.filter((s) => s.source === filter);
    if (filter === "favorites") xs = xs.filter((s) => s.favorite);
    const t = text.trim().toLowerCase();
    if (t) xs = xs.filter((s) => s.title.toLowerCase().includes(t) || s.notes.toLowerCase().includes(t));
    return xs;
  }, [q.data, filter, text]);

  if (q.error) return <ErrorState body="Sessions couldn't be loaded." onRetry={q.reload} />;
  if (q.loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Sessions"
        subtitle="Every practice, with its recording, measurements and coaching report."
        actions={<GlassLinkButton href="/coach/live" variant="primary" icon={<ScanLine className="size-4" />}>New session</GlassLinkButton>}
      />
      {q.data && q.data.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <GlassSegmentedControl label="Filter sessions" value={filter} onChange={setFilter} segments={[{ value: "all", label: "All" }, { value: "live", label: "Live" }, { value: "upload", label: "Videos" }, { value: "favorites", label: "Favorites" }]} />
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" />
            <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search sessions & notes" className="!h-10 !pl-10 !text-[15px]" aria-label="Search sessions" />
          </div>
        </div>
      )}
      {!q.data?.length ? (
        <EmptyState
          icon={<LibraryBig className="size-7" />}
          title="No sessions yet"
          body="Record a live session or analyse a video — it will appear here with its report."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <GlassLinkButton href="/coach/live" variant="primary">Live Coach</GlassLinkButton>
              <GlassLinkButton href="/analyze">Analyze video</GlassLinkButton>
            </div>
          }
        />
      ) : !list.length ? (
        <p className="text-fg-2">No sessions match this filter.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((s) => {
            const top = s.localReport?.findings.find((f) => f.severity === "issue" || f.severity === "watch");
            return (
              <li key={s.id}>
                <Link href={s.source === "upload" ? `/analyze/${s.id}` : `/sessions/${s.id}`}>
                  <GlassCard interactive className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="eyebrow flex items-center gap-1.5">
                          {s.source === "upload" ? <Video className="size-3.5" /> : <ScanLine className="size-3.5" />}
                          {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="mt-1 truncate text-[17px] font-semibold">{s.title}</p>
                        <p className="mt-0.5 text-sm text-fg-2 tabular">
                          {formatClock(s.durationMs)} · {s.strokes.filter((x) => !x.excluded).length} strokes · {SELECTION_LABEL[s.selection]}
                        </p>
                      </div>
                      {s.favorite && <Star className="size-4 shrink-0 fill-[var(--watch)] text-watch" aria-label="Favorite" />}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {top ? <SeverityBadge severity={top.severity} /> : <SeverityBadge severity="ok" />}
                      <span className="truncate text-sm text-fg-2">{top ? top.title : "No recurring issues flagged"}</span>
                    </div>
                    <p className="mt-2 text-xs text-fg-3">
                      {s.report ? (s.reportMeta?.mode === "fixture" ? "Test-mode AI report" : "AI report") : s.analysisStatus === "running" || s.analysisStatus === "queued" ? "AI report in progress…" : "On-device report"}
                      {s.hasRecording ? " · video saved" : " · no video kept"}
                    </p>
                  </GlassCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
