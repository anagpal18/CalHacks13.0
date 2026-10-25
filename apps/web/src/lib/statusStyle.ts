// The one place status colours, icons and labels are decided. Every page uses this.
//   cleared (green) · held (red) · asking a human (amber) · checking (blue)

import { CircleCheck, CircleX, Hand, Loader, Banknote, CalendarClock, BadgeCheck, type LucideIcon } from "lucide-react";
import type { CrsDecision, PassportStatus, StampStatus } from "@/data/types";

export type Tone = "cleared" | "held" | "asking" | "checking";

export interface ToneStyle {
  text: string;
  background: string;
  border: string;
  glow: string;
  dot: string;
  /** Raw CSS colour, for SVG strokes and inline styles. */
  color: string;
}

export const TONE_STYLE: Record<Tone, ToneStyle> = {
  cleared: { text: "text-cleared", background: "bg-cleared/12", border: "border-cleared/40", glow: "shadow-[0_0_24px_-4px_var(--cleared)]", dot: "bg-cleared", color: "var(--cleared)" },
  held: { text: "text-held", background: "bg-held/12", border: "border-held/40", glow: "shadow-[0_0_24px_-4px_var(--held)]", dot: "bg-held", color: "var(--held)" },
  asking: { text: "text-asking", background: "bg-asking/12", border: "border-asking/40", glow: "shadow-[0_0_24px_-4px_var(--asking)]", dot: "bg-asking", color: "var(--asking)" },
  checking: { text: "text-checking", background: "bg-checking/12", border: "border-checking/40", glow: "shadow-[0_0_24px_-4px_var(--checking)]", dot: "bg-checking", color: "var(--checking)" },
};

export interface StatusLook {
  tone: Tone;
  label: string;
  icon: LucideIcon;
}

export const PASSPORT_STATUS_LOOK: Record<PassportStatus, StatusLook> = {
  checking: { tone: "checking", label: "Checking", icon: Loader },
  parked: { tone: "asking", label: "Asking a human", icon: Hand },
  booked: { tone: "cleared", label: "Booked", icon: CircleCheck },
  scheduled: { tone: "cleared", label: "Scheduled", icon: CalendarClock },
  approved: { tone: "cleared", label: "Approved", icon: BadgeCheck },
  held: { tone: "held", label: "Held", icon: CircleX },
  paid: { tone: "cleared", label: "Paid", icon: Banknote },
};

export const STAMP_STATUS_LOOK: Record<StampStatus, StatusLook> = {
  pass: { tone: "cleared", label: "Passed", icon: CircleCheck },
  fail: { tone: "held", label: "Failed", icon: CircleX },
  ask_human: { tone: "asking", label: "Asking a human", icon: Hand },
};

export const CRS_DECISION_LOOK: Record<CrsDecision, StatusLook> = {
  cleared: { tone: "cleared", label: "Cleared", icon: CircleCheck },
  held: { tone: "held", label: "Held", icon: CircleX },
  review: { tone: "asking", label: "Review", icon: Hand },
  escalate: { tone: "asking", label: "Escalate", icon: Hand },
};
