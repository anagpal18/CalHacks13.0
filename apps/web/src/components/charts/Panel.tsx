// The white card every dashboard section sits in, with the reference's icon + title + subtitle header.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, icon: Icon, action, className, children }: PanelProps) {
  return (
    <section className={cn("rounded-3xl bg-card p-6 shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)]", className)}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
                <Icon className="size-4.5 text-foreground/70" />
              </span>
            )}
            <div>
              {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Big number, small muted label (Vercel's "Total Revenue / $15,231.89" pattern). */
export function StatFigure({ label, value, note, className }: { label: string; value: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-[32px] font-semibold leading-none tracking-tight">{value}</div>
      {note && <div className="mt-2 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
