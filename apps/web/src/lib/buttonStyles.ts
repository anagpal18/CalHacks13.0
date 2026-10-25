// The one button look used across the dashboard: black pill, white text.
// Chips, filters and toggles are not buttons and don't use this.

import { cn } from "./utils";

const BUTTON_SIZE = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-8 py-3 text-base font-semibold",
} as const;

export function primaryButton(size: keyof typeof BUTTON_SIZE = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground font-medium text-background transition hover:bg-foreground/85 disabled:opacity-50",
    BUTTON_SIZE[size],
    className,
  );
}
