import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookCheck, Skull } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Button as MovingBorderButton } from "@/components/ui/moving-border";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDemoMode } from "./DemoModeContext";
import { DASHBOARD_STEPS, findStepForPath } from "./dashboardSteps";
import { ScamConsoleDialog } from "./ScamConsoleDialog";
import { StepBar } from "./StepBar";

export function AppShell() {
  const location = useLocation();
  const currentStep = findStepForPath(location.pathname);
  const nextStep = DASHBOARD_STEPS.find((step) => step.number === currentStep.number + 1);
  const { mode, setMode } = useDemoMode();
  const [isScamConsoleOpen, setScamConsoleOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,oklch(0.72_0.15_250/0.14),transparent)]" />

      <header className="sticky top-0 z-40 border-b border-white/6 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link to="/inbox" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-checking to-cleared text-primary-foreground">
              <BookCheck className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-bold tracking-tight">Bill Passport</span>
              <span className="block text-[11px] text-muted-foreground">Every bill proves itself</span>
            </span>
          </Link>

          <div className="flex-1"><StepBar /></div>

          <div className="flex shrink-0 items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={cn(mode === "demo" && "text-foreground")}>Demo</span>
              <Switch checked={mode === "live"} onCheckedChange={(isLive) => setMode(isLive ? "live" : "demo")} />
              <span className={cn("flex items-center gap-1", mode === "live" && "text-held")}>
                {mode === "live" && <span className="size-1.5 animate-pulse rounded-full bg-held" />}Live
              </span>
            </label>
            <MovingBorderButton
              onClick={() => setScamConsoleOpen(true)}
              borderRadius="0.75rem"
              duration={2600}
              containerClassName="h-10 w-40"
              borderClassName="bg-[radial-gradient(var(--held)_40%,transparent_60%)]"
              className="gap-2 border-held/30 bg-background/90 text-sm font-semibold text-foreground"
            >
              <Skull className="size-4 text-held" /> Try to scam us
            </MovingBorderButton>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 pb-28 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.path}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="mb-8 text-4xl font-extrabold tracking-tight md:text-5xl">{currentStep.headline}</h1>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {nextStep && (
        <Link
          to={nextStep.path}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-card/90 px-5 py-3 text-sm font-semibold shadow-2xl backdrop-blur transition hover:border-checking/60 hover:text-checking"
        >
          Next: {nextStep.label} <ArrowRight className="size-4" />
        </Link>
      )}

      <ScamConsoleDialog open={isScamConsoleOpen} onOpenChange={setScamConsoleOpen} />
    </div>
  );
}
