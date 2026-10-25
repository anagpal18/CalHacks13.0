// The identity check (CRS) for whoever is asking to be paid. Shown inside a bill's Check page when the bill
// changes bank details or comes from a new vendor, and inside "Try to scam us". Three checks sweep in order
// (Fraud Finder → Identity → Phone owner), then the risk gauge and one decision.

import { AnimatePresence, motion } from "motion/react";
import { Fingerprint, PhoneCall, RotateCcw, ScanFace, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { RiskGauge } from "@/components/visuals/RiskGauge";
import { ScannerBar, SignalChip, type ScannerState } from "@/components/visuals/ScannerBar";
import { runCrsChain } from "@/data/dataSource";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars } from "@/lib/format";
import { primaryButton } from "@/lib/buttonStyles";
import { CRS_DECISION_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

const SCANNER_STEP_MS = 1_100;

/** 0 = nothing run, 1–3 = that scanner is sweeping, 4 = all done and decision shown. */
function useScanSequence(restartKey: string) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    setPhase(0);
    const timers = [1, 2, 3, 4].map((nextPhase) => setTimeout(() => setPhase(nextPhase), 300 + (nextPhase - 1) * SCANNER_STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [restartKey]);
  return phase;
}

function scannerState(scannerNumber: number, phase: number): ScannerState {
  if (phase > scannerNumber) return "done";
  if (phase === scannerNumber) return "scanning";
  return "waiting";
}

function formatEmailAge(days: number): string {
  return days < 60 ? `${days} days` : `${Math.round(days / 365)} yrs`;
}

interface IdentityCheckProps {
  personaId: string;
  /** Why this bill needs the check, e.g. "This bill sends money to a new bank account." */
  reason?: string;
  /** Stack everything in one column (for the scam console dialog). */
  compact?: boolean;
}

export function IdentityCheck({ personaId, reason, compact = false }: IdentityCheckProps) {
  const [replayCount, setReplayCount] = useState(0);
  const result = useAsyncData(() => runCrsChain(personaId), [personaId]);
  const phase = useScanSequence(`${personaId}-${replayCount}-${result ? "ready" : "loading"}`);

  if (!result) return <div className="h-64 animate-pulse rounded-2xl bg-foreground/[0.03]" />;

  const look = CRS_DECISION_LOOK[result.decision];
  const tone = TONE_STYLE[look.tone];
  const DecisionIcon = look.icon;
  const isRevealed = phase >= 4;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.06]"><ScanFace className="size-5" /></span>
          <div>
            <div className="text-base font-semibold">Identity check</div>
            <div className="text-sm text-muted-foreground">{reason ?? "Is the person asking to be paid who they say they are?"}</div>
          </div>
        </div>
        <button onClick={() => setReplayCount((count) => count + 1)} className={primaryButton("sm")}>
          <RotateCcw className="size-3.5" /> Run again
        </button>
      </div>

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-[1fr_1.5fr_0.9fr]")}>
        {/* Who is asking */}
        <div className="rounded-2xl border border-border bg-background/50 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Who's asking</div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-foreground/[0.06]"><UserRound className="size-5" /></span>
            <div>
              <div className="font-semibold">{result.personaName}</div>
              <div className="text-sm text-muted-foreground">claims to be <span className="text-foreground">{result.claimsToBe}</span></div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed">{result.scenario}</p>
          <div className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">At stake</div>
          <div className="text-2xl font-semibold tabular-nums">{formatDollars(result.amountAtStakeCents)}</div>
        </div>

        {/* The three checks */}
        <div className="space-y-3">
          <ScannerBar
            stepNumber={1}
            title="Fraud Finder"
            subtitle="email · phone · IP"
            icon={ShieldAlert}
            state={scannerState(1, phase)}
            resultTone={result.fraudFinder.riskScore >= 70 ? "held" : result.fraudFinder.riskScore >= 40 ? "asking" : "cleared"}
            resultLine={result.fraudFinder.line}
            details={
              <>
                <SignalChip label="Email age" value={formatEmailAge(result.fraudFinder.emailAgeDays)} isBad={result.fraudFinder.emailAgeDays < 30} />
                <SignalChip label="Phone" value={result.fraudFinder.phoneType.toUpperCase()} isBad={result.fraudFinder.phoneType === "voip" || result.fraudFinder.phoneType === "prepaid"} />
                <SignalChip label="IP distance" value={`${result.fraudFinder.ipDistanceMiles.toLocaleString()} mi`} isBad={result.fraudFinder.ipDistanceMiles > 500} />
              </>
            }
          />
          <ScannerBar
            stepNumber={2}
            title="Identity"
            subtitle="TransUnion reason codes"
            icon={Fingerprint}
            state={scannerState(2, phase)}
            resultTone={result.identity.passed ? (result.decision === "review" ? "asking" : "cleared") : "held"}
            resultLine={result.identity.line}
            details={
              result.identity.reasonCodes.length > 0
                ? result.identity.reasonCodes.map((reasonCode) => <SignalChip key={reasonCode.code} label={reasonCode.code} value={reasonCode.meaning} isBad={!reasonCode.ok} />)
                : <SignalChip label="Reason codes" value="none" />
            }
          />
          <ScannerBar
            stepNumber={3}
            title="Phone owner"
            subtitle="before we call to confirm"
            icon={PhoneCall}
            state={scannerState(3, phase)}
            resultTone={result.phoneOwner.matchesContact ? "cleared" : "held"}
            resultLine={result.phoneOwner.line}
            details={<SignalChip label="Registered to" value={result.phoneOwner.registeredTo} isBad={!result.phoneOwner.matchesContact} />}
          />
        </div>

        {/* Decision */}
        <div className={cn("flex flex-col items-center justify-center rounded-2xl border bg-card p-5 text-center transition-colors duration-700", isRevealed ? tone.border : "border-border")}>
          <RiskGauge score={result.fraudFinder.riskScore} isRevealed={phase >= 2} />
          <div className="mt-3 min-h-24">
            <AnimatePresence mode="wait">
              {isRevealed ? (
                <motion.div key="decision" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
                  <DecisionIcon className={cn("mx-auto size-8", tone.text)} />
                  <div className={cn("mt-1 text-3xl font-black uppercase tracking-tight", tone.text)}>{look.label}</div>
                  <div className="mt-1 text-sm">{result.decisionLine}</div>
                </motion.div>
              ) : (
                <motion.div key="pending" exit={{ opacity: 0 }} className="pt-6 text-sm text-muted-foreground">Running checks…</motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
