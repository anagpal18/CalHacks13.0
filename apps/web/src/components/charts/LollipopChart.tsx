// Lollipop chart (the reference's "Income Tracker"): hairline stems, 8px dots in the data colour,
// one selected column with a soft band, an ink day-chip and a dark value pill. Hover moves the selection.

import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface LollipopDatum {
  key: string;
  label: string;
  value: number;
  /** Shown in the tooltip under the value, e.g. "38 bills". */
  detail?: string;
}

interface LollipopChartProps {
  data: LollipopDatum[];
  formatValue: (value: number) => string;
  initialSelectedKey?: string;
  height?: number;
}

export function LollipopChart({ data, formatValue, initialSelectedKey, height = 220 }: LollipopChartProps) {
  const [selectedKey, setSelectedKey] = useState(initialSelectedKey ?? data[data.length - 1]?.key);
  const maxValue = Math.max(...data.map((datum) => datum.value), 1);
  const plotHeight = height - 56; // room for the day chips

  return (
    <div className="flex items-end justify-between gap-1" style={{ height }} role="img" aria-label="Lollipop chart">
      {data.map((datum, index) => {
        const isSelected = datum.key === selectedKey;
        const stemHeight = Math.max((datum.value / maxValue) * (plotHeight - 40), 6);
        return (
          <button
            key={datum.key}
            onMouseEnter={() => setSelectedKey(datum.key)}
            onFocus={() => setSelectedKey(datum.key)}
            className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
          >
            {isSelected && (
              <motion.span layoutId="lollipop-band" className="absolute inset-x-1 bottom-0 top-6 rounded-full bg-gradient-to-b from-transparent via-foreground/[0.03] to-foreground/[0.06]" transition={{ type: "spring", stiffness: 380, damping: 34 }} />
            )}
            <div className="relative flex flex-col items-center" style={{ height: plotHeight }}>
              <div className="flex-1" />
              {isSelected && (
                <motion.span
                  layoutId="lollipop-pill"
                  className="absolute z-10 whitespace-nowrap rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                  style={{ bottom: stemHeight + 18 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  {formatValue(datum.value)}
                  {datum.detail && <span className="ml-1 text-background/60">· {datum.detail}</span>}
                </motion.span>
              )}
              <motion.span
                className={cn("size-2.5 rounded-full ring-2 ring-card", isSelected ? "bg-foreground" : "bg-data")}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
              />
              <motion.span
                className={cn("w-px origin-bottom", isSelected ? "bg-foreground/40" : "bg-foreground/15")}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: index * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                style={{ height: stemHeight }}
              />
            </div>
            <span
              className={cn(
                "relative mt-3 flex size-9 items-center justify-center rounded-full text-xs font-medium transition-colors",
                isSelected ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground group-hover:bg-foreground/10",
              )}
            >
              {datum.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
