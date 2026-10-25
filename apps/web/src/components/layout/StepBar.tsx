import { motion } from "motion/react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { DASHBOARD_STEPS, findStepForPath } from "./dashboardSteps";

export function StepBar() {
  const currentStep = findStepForPath(useLocation().pathname);
  const progressPercent = ((currentStep.number - 1) / (DASHBOARD_STEPS.length - 1)) * 100;

  return (
    <nav className="relative mx-auto flex w-full max-w-3xl items-center justify-between">
      <div className="absolute inset-x-6 top-5 h-0.5 rounded-full bg-white/8" />
      <motion.div
        className="absolute left-6 top-5 h-0.5 rounded-full bg-gradient-to-r from-checking to-cleared"
        initial={false}
        animate={{ width: `calc((100% - 3rem) * ${progressPercent / 100})` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      {DASHBOARD_STEPS.map((step) => {
        const isCurrent = step.number === currentStep.number;
        const isDone = step.number < currentStep.number;
        const Icon = step.icon;
        return (
          <NavLink key={step.path} to={step.path} className="group relative z-10 flex w-28 flex-col items-center gap-1.5">
            <motion.span
              className={cn(
                "flex size-10 items-center justify-center rounded-full border text-sm font-bold transition-colors",
                isCurrent && "border-checking bg-checking text-primary-foreground shadow-[0_0_28px_-2px_var(--checking)]",
                isDone && "border-cleared/50 bg-cleared/15 text-cleared",
                !isCurrent && !isDone && "border-white/12 bg-card text-muted-foreground group-hover:border-white/30",
              )}
              animate={{ scale: isCurrent ? 1.1 : 1 }}
            >
              <Icon className="size-4.5" />
            </motion.span>
            <span className={cn("whitespace-nowrap text-xs font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
              {step.number} · {step.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
