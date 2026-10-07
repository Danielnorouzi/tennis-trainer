"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Clock, MessageCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassCard, softSpring } from "@/components/glass/glass";
import { Chip, ErrorState, PageSkeleton, Toggle } from "@/components/ui";
import { ApiError, postJson } from "@/lib/api/client";
import type { ChatAnswer } from "@/lib/ai/schemas";
import { buildChatContext } from "@/lib/chat/context";
import { defaultProfile, useStore, useStoreContext, useStoreQuery } from "@/lib/data/provider";
import { uid } from "@/lib/data/store";
import { nowMs } from "@/lib/clock";
import type { ChatMessage, Conversation } from "@/lib/data/types";

const STARTERS = [
  "Why is my forehand inconsistent?",
  "Am I rotating my shoulders enough?",
  "What changed in my serve this week?",
  "How can I improve my footwork?",
  "Show me the weakest part of my latest stroke.",
  "What should I focus on tomorrow?",
];

export default function AssistantPage() {
  const store = useStore();
  const { status } = useStoreContext();
  const convs = useStoreQuery((s) => s.listConversations());
  const data = useStoreQuery(async (s) => {
    const [profile, sessions, goals, logs] = await Promise.all([s.getProfile(), s.listSessions(), s.listGoals(), s.listDrillLogs()]);
    return { profile: profile ?? defaultProfile(), sessions, goals, logs };
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!store || !activeId) return;
    let cancelled = false;
    store.getConversation(activeId).then((c) => {
      if (!cancelled && c) setConv((cur) => (cur && cur.id === c.id && cur.messages.length > c.messages.length ? cur : c));
    });
    return () => {
      cancelled = true;
    };
  }, [store, activeId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv?.messages.length, sending]);

  const context = useMemo(() => (data.data ? buildChatContext(data.data.sessions, data.data.goals, data.data.logs) : null), [data.data]);
  const sessionTitles = useMemo(() => new Map((data.data?.sessions ?? []).map((s) => [s.id, s] as const)), [data.data]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || !store || !context || !data.data || sending) return;
    setError(null);
    setInput("");
    const now = nowMs();
    const base: Conversation = conv ?? { id: uid("conv"), createdAt: now, updatedAt: now, title: content.slice(0, 60), messages: [], sessionIds: [] };
    const userMsg: ChatMessage = { id: uid("msg"), role: "user", content: content.slice(0, 4000), at: now };
    const withUser = { ...base, messages: [...base.messages, userMsg], updatedAt: now };
    setConv(withUser);
    setActiveId(withUser.id);
    setSending(true);
    try {
      const p = data.data.profile;
      const { data: ans, meta } = await postJson<ChatAnswer>("/api/ai/chat", {
        player: { experience: p.experience, handedness: p.handedness, backhand: p.backhand, goals: p.goals.slice(0, 10), challenges: p.challenges.slice(0, 10) },
        messages: withUser.messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
        context,
        detailed,
      });
      const reply: ChatMessage = {
        id: uid("msg"), role: "assistant", content: ans.answer, details: ans.details, references: ans.references, followUps: ans.followUps, at: nowMs(), mode: meta.mode,
      };
      const next = {
        ...withUser,
        messages: [...withUser.messages, reply],
        updatedAt: nowMs(),
        sessionIds: [...new Set([...withUser.sessionIds, ...ans.references.map((r) => r.sessionId)])],
      };
      setConv(next);
      await store.saveConversation(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The coach couldn't answer right now.");
      await store.saveConversation(withUser);
    } finally {
      setSending(false);
    }
  };

  if (data.error) return <ErrorState onRetry={data.reload} />;
  if (data.loading || convs.loading) return <PageSkeleton />;
  const unavailable = status?.ai === "unavailable";

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block" aria-label="Conversations">
        <GlassButton className="mb-3 w-full" icon={<Plus className="size-4" />} onClick={() => { setActiveId(null); setConv(null); }}>
          New conversation
        </GlassButton>
        <ul className="space-y-1">
          {(convs.data ?? []).map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button onClick={() => setActiveId(c.id)} className={clsx("min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm", activeId === c.id ? "glass font-semibold" : "text-fg-2 hover:text-fg")}>
                {c.title || "Conversation"}
              </button>
              <button aria-label="Delete conversation" className="rounded-lg p-1.5 text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={async () => {
                await store?.deleteConversation(c.id);
                if (activeId === c.id) { setActiveId(null); setConv(null); }
              }}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-h-[calc(100dvh-220px)] flex-col">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">AI Coach</p>
            <h1 className="display text-[30px] leading-tight">Ask about your game</h1>
          </div>
          <GlassButton className="lg:hidden" size="sm" icon={<Plus className="size-4" />} onClick={() => { setActiveId(null); setConv(null); }}>New</GlassButton>
        </header>

        <div className="flex-1 space-y-4" aria-live="polite">
          {!conv?.messages.length && (
            <GlassCard>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-2-soft text-accent-2"><Sparkles className="size-5" /></span>
                <div>
                  <p className="font-semibold">Your coach knows your sessions</p>
                  <p className="mt-1 text-[15px] text-fg-2">
                    Answers use your own recorded findings and measurements ({data.data?.sessions.length ?? 0} session{data.data?.sessions.length === 1 ? "" : "s"}). If something wasn’t recorded, the coach will say so instead of guessing.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {STARTERS.map((s) => <Chip key={s} onClick={() => send(s)}>{s}</Chip>)}
              </div>
            </GlassCard>
          )}
          <AnimatePresence initial={false}>
            {conv?.messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-accent px-4 py-3 text-[15px] text-white">{m.content}</div>
                ) : (
                  <AssistantBubble m={m} titles={sessionTitles} onFollowUp={send} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {sending && (
            <div className="flex items-center gap-2 text-sm text-fg-2" role="status">
              <span className="flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} className="size-2 rounded-full bg-fg-3" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}</span>
              Reviewing your sessions…
            </div>
          )}
          {error && <p role="alert" className="rounded-2xl bg-issue-soft px-4 py-3 text-sm font-medium text-issue">{error}</p>}
          <div ref={endRef} />
        </div>

        <form
          className="glass-strong sticky bottom-[calc(env(safe-area-inset-bottom)+92px)] mt-6 rounded-[26px] p-2 lg:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="chat-input">Message the coach</label>
            <textarea
              id="chat-input"
              rows={1}
              value={input}
              maxLength={2000}
              disabled={unavailable}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={unavailable ? "AI coaching isn't configured on this server" : "Ask about your technique…"}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] outline-none"
            />
            <GlassButton type="submit" variant="primary" className="!size-11 !p-0" aria-label="Send" disabled={!input.trim() || sending || unavailable}>
              <ArrowUp className="size-5" />
            </GlassButton>
          </div>
          <div className="px-2 [&_label]:py-1.5">
            <Toggle checked={detailed} onChange={setDetailed} label="Detailed answers" />
          </div>
        </form>
      </div>
    </div>
  );
}

function AssistantBubble({ m, titles, onFollowUp }: { m: ChatMessage; titles: Map<string, { title: string; source: string }>; onFollowUp: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass max-w-[92%] rounded-[22px] rounded-bl-md px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg-3">
        <MessageCircle className="size-3.5" /> Coach
        {m.mode === "fixture" && <span className="rounded-full bg-watch-soft px-2 py-0.5 text-watch">Test mode</span>}
      </div>
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
      {m.details && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-2 text-sm font-semibold text-accent-2" aria-expanded={open}>
            {open ? "Hide details" : "More detail"}
          </button>
          {open && <p className="mt-2 text-[15px] whitespace-pre-wrap text-fg-2">{m.details}</p>}
        </>
      )}
      {m.references && m.references.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.references.map((r, i) => {
            const s = titles.get(r.sessionId);
            const base = s?.source === "upload" ? "/analyze" : "/sessions";
            return (
              <Link key={i} href={`${base}/${r.sessionId}${r.timestamp !== null ? `?t=${r.timestamp}` : ""}`} className="inline-flex items-center gap-1.5 rounded-full bg-accent-2-soft px-3 py-1.5 text-xs font-semibold text-accent-2">
                <Clock className="size-3" /> {r.label || s?.title || "Session"}
                {r.timestamp !== null && ` · ${r.timestamp.toFixed(1)} s`}
              </Link>
            );
          })}
        </div>
      )}
      {m.followUps && m.followUps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.followUps.map((f) => <Chip key={f} onClick={() => onFollowUp(f)} className="!min-h-8 !px-3 !text-xs">{f}</Chip>)}
        </div>
      )}
    </div>
  );
}
