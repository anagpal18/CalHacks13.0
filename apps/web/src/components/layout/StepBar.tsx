// Two tabs: Overview and Dive in. Choosing Dive in opens the five pages in place, inside the same tab bar,
// so the drill-down reads as one piece. A white pill slides to whichever tab is active.

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronRight, Telescope } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { DASHBOARD_STEPS, OVERVIEW_STEP, findStepForPath } from "./dashboardSteps";

const SPRING = { type: "spring", stiffness: 420, damping: 36 } as const;

export function StepBar() {
  const currentStep = findStepForPath(useLocation().pathname);
  const isDiving = currentStep.number > 0;

  return (
    <LayoutGroup>
      <motion.nav layout transition={SPRING} className="flex items-center rounded-full bg-foreground/[0.06] p-1">
        <NavTab to={OVERVIEW_STEP.path} isActive={!isDiving}>
          <OVERVIEW_STEP.icon className="size-4" />
          {OVERVIEW_STEP.label}
        </NavTab>

        <AnimatePresence initial={false} mode="popLayout">
          {isDiving ? (
            <motion.div
              key="dive-in-open"
              layout
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={SPRING}
              className="flex items-center overflow-hidden"
            >
              <span className="mx-1 flex items-center gap-1.5 whitespace-nowrap border-l border-foreground/10 pl-3 pr-1 text-xs font-medium text-muted-foreground">
                <Telescope className="size-3.5" /> Dive in
              </span>
              {DASHBOARD_STEPS.map((step) => (
                <NavTab key={step.path} to={step.path} isActive={step.number === currentStep.number}>
                  {step.label}
                </NavTab>
              ))}
            </motion.div>
          ) : (
            <motion.div key="dive-in-closed" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <NavTab to={DASHBOARD_STEPS[0].path} isActive={false}>
                <Telescope className="size-4" />
                Dive in
                <ChevronRight className="size-3.5" />
              </NavTab>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </LayoutGroup>
  );
}

function NavTab({ to, isActive, children }: { to: string; isActive: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={cn(
        "relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {isActive && (
        <motion.span layoutId="nav-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(31_36_51/0.08),0_0_0_1px_rgb(31_36_51/0.06)]" />
      )}
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </NavLink>
  );
}
