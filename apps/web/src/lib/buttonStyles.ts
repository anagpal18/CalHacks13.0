// The one button look used across the dashboard: white pill with black text, flips to black with white text on hover.
// Chips, filters and toggles are not buttons and don't use this.

import { cn } from "./utils";

const BUTTON_SIZE = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-8 py-3 text-base font-semibold",
} as const;

export function primaryButton(size: keyof typeof BUTTON_SIZE = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-foreground/15 bg-card font-medium text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background disabled:opacity-50",
    BUTTON_SIZE[size],
    className,
  );
}
