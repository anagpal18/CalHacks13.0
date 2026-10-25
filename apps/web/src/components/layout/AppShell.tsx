import { motion } from "motion/react";
import { ArrowRight, BookCheck, Skull } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
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
    <div className="min-h-screen bg-background">
      {/* Full-screen light canvas; content stays on a readable max width. */}
      <div className="relative mx-auto max-w-[1680px] px-5 pb-24 pt-5 md:px-10">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4">
          <Link to="/inbox" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <BookCheck className="size-4.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Bill Passport</span>
          </Link>

          <div className="flex flex-1 justify-center"><StepBar /></div>

          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className={cn(mode === "demo" && "text-foreground")}>Demo</span>
              <Switch checked={mode === "live"} onCheckedChange={(isLive) => setMode(isLive ? "live" : "demo")} />
              <span className={cn("flex items-center gap-1", mode === "live" && "text-foreground")}>
                {mode === "live" && <span className="size-1.5 animate-pulse rounded-full bg-held" />}Live
              </span>
            </label>
            <button
              onClick={() => setScamConsoleOpen(true)}
              className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/85"
            >
              <Skull className="size-4 text-held" /> Try to scam us
            </button>
          </div>
        </header>

        <main className="pt-8">
          {/* Fade the new page in only. An exit + mode="wait" transition can stall forever when the
              old page still has its own running layout animations (Inbox), leaving a blank page. */}
          <motion.div key={currentStep.path} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="mb-8 max-w-5xl">
              <h1 className="text-4xl font-semibold tracking-tight md:text-[44px] md:leading-[1.1]">{currentStep.headline}</h1>
              <p className="mt-2 text-base text-muted-foreground">{currentStep.subtitle}</p>
            </div>
            <Outlet />
          </motion.div>
        </main>

        {nextStep && (
          <Link
            to={nextStep.path}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium shadow-sm transition hover:border-foreground/30 md:right-10"
          >
            Next: {nextStep.label} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>

      <ScamConsoleDialog open={isScamConsoleOpen} onOpenChange={setScamConsoleOpen} />
    </div>
  );
}
