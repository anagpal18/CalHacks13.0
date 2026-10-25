// Stacked columns: <=24px wide, 2px surface gap between segments, 4px rounded top, legend above,
// per-column tooltip on hover. Segment order is fixed (never re-sorted), so colour follows the series.

import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface StackSeries {
  key: string;
  label: string;
  className: string;
}

export interface StackColumn {
  key: string;
  label: string;
  values: Record<string, number>;
}

export function StackedColumns({ series, columns, height = 200 }: { series: StackSeries[]; columns: StackColumn[]; height?: number }) {
  const totals = columns.map((column) => series.reduce((sum, entry) => sum + (column.values[entry.key] ?? 0), 0));
  const maxTotal = Math.max(...totals, 1);
  const plotHeight = height - 28;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((entry) => (
          <span key={entry.key} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", entry.className)} />{entry.label}</span>
        ))}
      </div>
      <div className="relative flex items-end justify-between gap-2" style={{ height }}>
        {[0.5, 1].map((fraction) => (
          <div key={fraction} className="pointer-events-none absolute inset-x-0 border-t border-border" style={{ bottom: 28 + plotHeight * fraction }} />
        ))}
        {columns.map((column, columnIndex) => (
          <Tooltip key={column.key}>
            <TooltipTrigger asChild>
              <div className="group relative z-10 flex h-full flex-1 cursor-default flex-col items-center justify-end">
                <span className="mb-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">{totals[columnIndex]}</span>
                <div className="flex w-6 flex-col-reverse gap-[2px]">
                  {series.map((entry, seriesIndex) => {
                    const value = column.values[entry.key] ?? 0;
                    if (value === 0) return null;
                    const isTop = series.slice(seriesIndex + 1).every((later) => !(column.values[later.key] ?? 0));
                    return (
                      <motion.span
                        key={entry.key}
                        className={cn(entry.className, isTop && "rounded-t-[4px]")}
                        initial={{ height: 0 }}
                        animate={{ height: (value / maxTotal) * plotHeight }}
                        transition={{ delay: columnIndex * 0.05 + seriesIndex * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      />
                    );
                  })}
                </div>
                <span className="mt-2 flex h-5 items-center text-xs text-muted-foreground">{column.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                {series.map((entry) => <div key={entry.key}>{entry.label}: <span className="font-semibold">{column.values[entry.key] ?? 0}</span></div>)}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
