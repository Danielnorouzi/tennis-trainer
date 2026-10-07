"use client";

// GlassToast: transient, polite status messages (aria-live). One provider at the app root.

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { spring } from "./glass";

type Tone = "info" | "success" | "warning" | "error";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

const ICON = {
  info: <Info className="size-5 text-accent-2" />,
  success: <CheckCircle2 className="size-5 text-ok" />,
  warning: <TriangleAlert className="size-5 text-watch" />,
  error: <XCircle className="size-5 text-issue" />,
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq;
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[100] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={spring}
              role={t.tone === "error" ? "alert" : "status"}
              className="glass-strong pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3"
            >
              <span className="mt-0.5">{ICON[t.tone]}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-fg-2">{t.body}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
