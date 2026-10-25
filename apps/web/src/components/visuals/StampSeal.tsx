// A passport stamp as a round seal. It "slams" in (scale down + rotate) when revealed.
// A problem stamp can be picked for a decision; a person's decision shows under the reason.

import { motion } from "motion/react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { StampDefinition } from "@/data/stampCatalog";
import type { Stamp, StampDecision } from "@/data/types";
import { STAMP_STATUS_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";
import { STAMP_ICON } from "./stampIcons";

interface StampSealProps {
  definition: StampDefinition;
  stamp: Stamp;
  isRevealed: boolean;
  isChecking: boolean;
  /** The bill is finished but this stamp was never signed (the agent didn't finish). */
  isMissing?: boolean;
  /** Picked in the decision bar. */
  isSelected?: boolean;
  decision?: StampDecision;
  /** Problem stamps still waiting on a person can be picked; others open their reasoning. */
  onSelect?: () => void;
  /** Opens this stamp's reasoning in the side drawer. */
  onOpenEvidence: () => void;
}

const DECISION_LINE = {
  approve: { verb: "Approved", className: "text-approved" },
  reject: { verb: "Rejected", className: "text-held" },
  escalate: { verb: "Escalated", className: "text-asking" },
} as const;

export function StampSeal({ definition, stamp, isRevealed, isChecking, isMissing = false, isSelected = false, decision, onSelect, onOpenEvidence }: StampSealProps) {
  const look = STAMP_STATUS_LOOK[stamp.status];
  const tone = TONE_STYLE[look.tone];
  const StampIcon = STAMP_ICON[definition.id];
  const StatusIcon = look.icon;
  const isProblem = stamp.status !== "pass";
  const isApproved = decision?.decision === "approve";
  // Passes recede (thin grey ring, ink icon); problems carry the status colour, softened once a person approves.
  const sealColor = isProblem ? tone.color : "rgb(31 36 51 / 0.22)";
  const handleClick = onSelect ?? onOpenEvidence;
  const openEvidence = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    onOpenEvidence();
  };

  return (
    <button onClick={handleClick} disabled={!isRevealed} className="group flex flex-col items-center text-center">
      <div className="relative size-28">
        {/* Empty slot while waiting */}
        <div className={cn("absolute inset-0 rounded-full border-2 border-dashed transition-colors", isChecking ? "border-checking/70" : "border-foreground/10")} />
        {isChecking && (
          <motion.div className="absolute inset-0 rounded-full border-2 border-checking border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
        )}
        {isMissing && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Not signed</div>
        )}
        {isSelected && <motion.div layoutId="stamp-selected" className="absolute -inset-2 rounded-full border-2 border-foreground" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
        {isRevealed && (
          <motion.div
            initial={{ scale: 2.2, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: isProblem ? -8 : -4, opacity: isApproved ? 0.55 : 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 14 }}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center rounded-full transition-transform group-hover:scale-105",
              isProblem ? cn("border-[3px]", tone.background, tone.text) : "border-2 bg-card text-foreground/75",
            )}
            style={{ borderColor: sealColor }}
          >
            <div className="absolute inset-1.5 rounded-full border border-dashed opacity-50" style={{ borderColor: sealColor }} />
            <StampIcon className="size-7" />
            <span className="mt-1 text-[10px] font-black uppercase tracking-wider">{look.label === "Asking a human" ? "Asking" : look.label}</span>
            <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-card" style={{ color: isProblem ? tone.color : "var(--foreground)" }}>
              <StatusIcon className="size-6" />
            </span>
          </motion.div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">{definition.number}</span>
        <span className="text-sm font-semibold">{definition.label}</span>
      </div>
      <p className={cn("mt-1 min-h-10 max-w-40 text-xs leading-snug", isRevealed && isProblem ? cn(tone.text, "font-medium") : "text-muted-foreground")}>
        {isMissing ? "The agent didn't finish this stamp." : isRevealed ? (isProblem ? stamp.reason : definition.question) : definition.question}
      </p>
      {isRevealed && decision && (
        <p className={cn("mt-1.5 max-w-40 text-xs leading-snug", DECISION_LINE[decision.decision].className)}>
          <span className="font-semibold">{DECISION_LINE[decision.decision].verb} by the {decision.byRole === "controller" ? "Controller" : "site PM"}:</span> {decision.note}
        </p>
      )}
      {isRevealed && (
        <span
          role="link"
          tabIndex={0}
          onClick={openEvidence}
          onKeyDown={(event) => event.key === "Enter" && openEvidence(event)}
          className="mt-1 text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          See reasoning
        </span>
      )}
    </button>
  );
}
