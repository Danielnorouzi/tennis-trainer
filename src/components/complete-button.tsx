"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { GlassButton, spring } from "./glass/glass";

/** "Mark done" with a restrained success animation. */
export function CompleteButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <GlassButton onClick={onClick} variant={done ? "primary" : "glass"} aria-live="polite" className="min-w-[132px]">
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span key="d" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={spring} className="flex items-center gap-1.5">
            <Check className="size-4" /> Logged
          </motion.span>
        ) : (
          <motion.span key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
            <Check className="size-4" /> Mark done
          </motion.span>
        )}
      </AnimatePresence>
    </GlassButton>
  );
}
