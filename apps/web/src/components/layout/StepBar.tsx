// The ① → ⑤ steps as a quiet text nav. The active step gets an ink underline that slides between items.

import { motion } from "motion/react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { DASHBOARD_STEPS, findStepForPath } from "./dashboardSteps";

export function StepBar() {
  const currentStep = findStepForPath(useLocation().pathname);

  return (
    <nav className="flex items-center gap-1">
      {DASHBOARD_STEPS.map((step) => {
        const isCurrent = step.number === currentStep.number;
        const isDone = step.number < currentStep.number;
        return (
          <NavLink
            key={step.path}
            to={step.path}
            className={cn(
              "relative flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors",
              isCurrent ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums",
                isCurrent ? "bg-foreground text-background" : isDone ? "bg-foreground/10 text-foreground" : "bg-foreground/5",
              )}
            >
              {step.number}
            </span>
            {step.label}
            {isCurrent && (
              <motion.span layoutId="step-underline" className="absolute inset-x-3 -bottom-px h-[1.5px] rounded-full bg-foreground" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
