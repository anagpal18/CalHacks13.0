// Tick strip (the reference's "Proposal Progress"): each group is a hairline rule, a label, a big number,
// then one tick per unit. Ticks are data, not decoration: a group of 7 draws 7 ticks.

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TickGroup {
  key: string;
  label: string;
  value: number;
  /** Shown as the big number; defaults to `value`. */
  displayValue?: string;
  tone: "data" | "ink" | "held" | "asking" | "muted";
}

const TONE_CLASS: Record<TickGroup["tone"], { tick: string; rule: string }> = {
  data: { tick: "bg-data", rule: "bg-data" },
  ink: { tick: "bg-foreground", rule: "bg-foreground" },
  held: { tick: "bg-held", rule: "bg-held" },
  asking: { tick: "bg-asking", rule: "bg-asking" },
  muted: { tick: "bg-foreground/20", rule: "bg-foreground/25" },
};

interface TickStripProps {
  groups: TickGroup[];
  /** How many units one tick stands for (e.g. 1 tick = $10K). */
  unitsPerTick?: number;
  tickHeight?: number;
}

export function TickStrip({ groups, unitsPerTick = 1, tickHeight = 40 }: TickStripProps) {
  return (
    <div className="flex items-stretch gap-5">
      {groups.map((group, groupIndex) => {
        const tone = TONE_CLASS[group.tone];
        const tickCount = Math.max(1, Math.round(group.value / unitsPerTick));
        return (
          <div key={group.key} className="relative min-w-0 flex-1 pl-3">
            <span className={cn("absolute inset-y-0 left-0 w-px", tone.rule)} />
            <div className="truncate text-sm text-muted-foreground">{group.label}</div>
            <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{group.displayValue ?? group.value.toLocaleString("en-US")}</div>
            <div className="mt-4 flex items-end gap-[3px]" style={{ height: tickHeight }}>
              {Array.from({ length: tickCount }, (_, tickIndex) => (
                <motion.span
                  key={tickIndex}
                  className={cn("w-[2px] shrink-0 rounded-full", tone.tick)}
                  initial={{ height: 0 }}
                  animate={{ height: tickHeight }}
                  transition={{ delay: groupIndex * 0.12 + tickIndex * 0.015, duration: 0.3 }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
