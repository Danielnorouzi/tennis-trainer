"use client";

import { Heart, ScanLine, Search, Timer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { GlassCard, GlassLinkButton, GlassModal, GlassButton } from "@/components/glass/glass";
import { Chip, PageHeader, TextInput } from "@/components/ui";
import { CompleteButton } from "@/components/complete-button";
import { useStore, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { nowMs } from "@/lib/clock";
import { DRILLS, type DrillCategory } from "@/lib/tennis/drills";
import { CATEGORY_LABEL } from "@/lib/tennis/labels";

const CATS: (DrillCategory | "all" | "favorites")[] = ["all", "favorites", "shadow", "groundstroke", "serve", "footwork", "volley", "consistency", "warmup"];
const CAT_LABEL: Record<string, string> = {
  all: "All", favorites: "Favorites", shadow: "Shadow swings", groundstroke: "Groundstrokes", serve: "Serve", footwork: "Footwork", volley: "Volleys", consistency: "Consistency", warmup: "Warm-up",
};

export function DrillLibrary() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const favs = useStoreQuery((s) => s.listFavorites());
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [noBall, setNoBall] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const openId = params.get("d");
  const open = DRILLS.find((d) => d.id === openId) ?? null;
  const favIds = useMemo(() => new Set((favs.data ?? []).filter((f) => f.kind === "drill").map((f) => f.refId)), [favs.data]);

  const list = useMemo(() => {
    const t = text.trim().toLowerCase();
    return DRILLS.filter((d) => {
      if (cat === "favorites" && !favIds.has(d.id)) return false;
      if (cat !== "all" && cat !== "favorites" && d.category !== cat) return false;
      if (noBall && d.needsBall) return false;
      if (t && !`${d.title} ${d.objective} ${d.focus.join(" ")}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [cat, noBall, text, favIds]);

  const setOpen = (id: string | null) => router.replace(id ? `/training/drills?d=${id}` : "/training/drills", { scroll: false });

  return (
    <div>
      <PageHeader eyebrow="Training" title="Drill library" subtitle="Every drill has a clear objective, step-by-step instructions, common mistakes and success criteria." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" />
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search drills" className="!h-11 !pl-10 !text-[15px]" aria-label="Search drills" />
        </div>
        <Chip selected={noBall} onClick={() => setNoBall((x) => !x)}>No ball needed</Chip>
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {CATS.map((c) => (
          <Chip key={c} selected={cat === c} onClick={() => setCat(c)} className="shrink-0">{CAT_LABEL[c]}</Chip>
        ))}
      </div>
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <li key={d.id}>
              <GlassCard interactive className="h-full" onClick={() => setOpen(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(d.id)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="eyebrow">{CAT_LABEL[d.category]}</p>
                  {favIds.has(d.id) && <Heart className="size-4 fill-[var(--issue)] text-issue" aria-label="Favorite" />}
                </div>
                <p className="display mt-1.5 text-lg">{d.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-fg-2">{d.objective}</p>
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-fg-3">
                  <Timer className="size-3.5" /> {d.durationMin} min · {d.difficulty} · {d.needsBall ? "ball" : "no ball"}
                </p>
              </GlassCard>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-2">No drills match these filters.</p>
      )}

      <GlassModal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} size="lg">
        {open && (
          <div className="space-y-5 text-[15px]">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">{CAT_LABEL[open.category]}</span>
              <span className="rounded-full bg-[var(--hairline)] px-2.5 py-1 text-fg-2 capitalize">{open.difficulty}</span>
              <span className="rounded-full bg-[var(--hairline)] px-2.5 py-1 text-fg-2">{open.reps}</span>
              <span className="rounded-full bg-[var(--hairline)] px-2.5 py-1 text-fg-2">~{open.durationMin} min</span>
            </div>
            <div>
              <p className="eyebrow mb-1">Goal</p>
              <p>{open.objective}</p>
              <p className="mt-1 text-sm text-fg-3">Technique focus: {open.focus.map((f) => CATEGORY_LABEL[f]).join(", ")}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Instructions</p>
              <ol className="list-inside list-decimal space-y-1.5">{open.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-watch-soft p-4">
                <p className="mb-1 text-sm font-semibold text-watch">Common mistakes</p>
                <ul className="space-y-0.5 text-sm">{open.commonMistakes.map((s, i) => <li key={i}>• {s}</li>)}</ul>
              </div>
              <div className="rounded-2xl bg-ok-soft p-4">
                <p className="mb-1 text-sm font-semibold text-ok">Success criteria</p>
                <ul className="space-y-0.5 text-sm">{open.successCriteria.map((s, i) => <li key={i}>• {s}</li>)}</ul>
              </div>
            </div>
            {open.equipment.length > 0 && <p className="text-sm text-fg-2">Equipment: {open.equipment.join(", ")}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <GlassLinkButton href={`/coach/live?drill=${open.id}`} variant="primary" icon={<ScanLine className="size-4" />}>Start guided drill</GlassLinkButton>
              <CompleteButton
                done={done === open.id}
                onClick={async () => {
                  await store?.addDrillLog({ id: uid("log"), drillId: open.id, completedAt: nowMs(), reps: null, rating: null, notes: "", sessionId: null });
                  setDone(open.id);
                  setTimeout(() => setDone(null), 1600);
                }}
              />
              <GlassButton
                variant="ghost"
                icon={<Heart className={favIds.has(open.id) ? "size-4 fill-[var(--issue)] text-issue" : "size-4"} />}
                aria-pressed={favIds.has(open.id)}
                onClick={() => store?.toggleFavorite({ kind: "drill", refId: open.id, label: open.title })}
              >
                {favIds.has(open.id) ? "Saved" : "Save"}
              </GlassButton>
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}
