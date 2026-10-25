// One CRS check as a horizontal scanner: waiting → sweeping → resolved (green/red/amber).

import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TONE_STYLE, type Tone } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

export type ScannerState = "waiting" | "scanning" | "done";

interface ScannerBarProps {
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  state: ScannerState;
  resultTone: Tone;
  resultLine: string;
  details?: ReactNode;
}

export function ScannerBar({ stepNumber, title, subtitle, icon: Icon, state, resultTone, resultLine, details }: ScannerBarProps) {
  const tone = TONE_STYLE[resultTone];
  const isDone = state === "done";

  return (
    <motion.div
      layout
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/70 p-5 transition-colors duration-500",
        state === "waiting" && "border-white/6 opacity-50",
        state === "scanning" && "border-checking/50",
        isDone && cn(tone.border, tone.glow),
      )}
    >
      {state === "scanning" && (
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-checking/25 to-transparent"
          initial={{ left: "-35%" }}
          animate={{ left: "105%" }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      )}
      <div className="relative flex items-start gap-4">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold transition-colors duration-500",
            isDone ? cn(tone.background, tone.text) : "bg-white/6 text-muted-foreground",
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">{stepNumber}</span>
            <span className="font-semibold">{title}</span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
          <div className="mt-1 min-h-7">
            <AnimatePresence mode="wait">
              {state === "waiting" && <motion.p key="waiting" className="text-sm text-muted-foreground" exit={{ opacity: 0 }}>Waiting…</motion.p>}
              {state === "scanning" && (
                <motion.p key="scanning" className="text-sm text-checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Checking…
                </motion.p>
              )}
              {isDone && (
                <motion.p key="done" className={cn("text-lg font-semibold", tone.text)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  {resultLine}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {isDone && details && (
            <motion.div className="mt-3 flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              {details}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Small labelled fact chip shown under a resolved scanner. */
export function SignalChip({ label, value, isBad }: { label: string; value: string; isBad?: boolean }) {
  return (
    <span className={cn("rounded-lg border px-2.5 py-1 text-xs", isBad ? "border-held/30 bg-held/8 text-held" : "border-white/8 bg-white/4 text-muted-foreground")}>
      <span className="opacity-70">{label}</span> <span className="font-semibold">{value}</span>
    </span>
  );
}
