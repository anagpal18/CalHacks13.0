// Single-series horizontal bars: <= 24px thick, 4px rounded data-end, square at the baseline,
// value at the tip in ink (text never wears the data colour). Hover a row for its tooltip.

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  icon?: LucideIcon;
  tooltip?: string;
  highlight?: boolean;
}

export function HorizontalBars({ data, labelWidth = 140, barHeight = 14 }: { data: BarDatum[]; labelWidth?: number; barHeight?: number }) {
  const maxValue = Math.max(...data.map((datum) => datum.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((datum, index) => {
        const Icon = datum.icon;
        return (
          <Tooltip key={datum.key}>
            <TooltipTrigger asChild>
              <div className="group flex cursor-default items-center gap-3 rounded-md py-0.5">
                <span className="flex shrink-0 items-center gap-2 truncate text-xs text-muted-foreground group-hover:text-foreground" style={{ width: labelWidth }}>
                  {Icon && <Icon className="size-3.5 shrink-0" />}
                  <span className="truncate">{datum.label}</span>
                </span>
                <div className="flex flex-1 items-center gap-2">
                  <motion.div
                    className={cn("rounded-r-[4px]", datum.highlight ? "bg-held" : "bg-data")}
                    style={{ height: barHeight }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((datum.value / maxValue) * 100, 2)}%` }}
                    transition={{ delay: 0.1 + index * 0.04, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <span className="text-xs font-semibold tabular-nums">{datum.value}</span>
                </div>
              </div>
            </TooltipTrigger>
            {datum.tooltip && <TooltipContent>{datum.tooltip}</TooltipContent>}
          </Tooltip>
        );
      })}
    </div>
  );
}
