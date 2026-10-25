// ③ Verify: "Is the person changing bank details real?"
// Three CRS checks run in order (Fraud Finder → Identity → Phone owner), the risk gauge sweeps,
// then one big decision. Opens on P13 (the scammer); the real contact P01 is one click away.

import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, Fingerprint, PhoneCall, RotateCcw, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { RiskGauge } from "@/components/visuals/RiskGauge";
import { ScannerBar, SignalChip, type ScannerState } from "@/components/visuals/ScannerBar";
import { listCrsPersonas, runCrsChain } from "@/data/dataSource";
import type { CrsChainResult } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars } from "@/lib/format";
import { CRS_DECISION_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { primaryButton } from "@/lib/buttonStyles";
import { cn } from "@/lib/utils";

const DEFAULT_PERSONA_ID = "P13";
const SCANNER_STEP_MS = 1_300;

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

export function VerifyPage() {
  const { personaId = DEFAULT_PERSONA_ID } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [replayCount, setReplayCount] = useState(0);
  const result = useAsyncData(() => runCrsChain(personaId), [personaId]);
  const personas = useAsyncData(listCrsPersonas, []) ?? [];
  const phase = useScanSequence(`${personaId}-${searchParams.get("attack")}-${replayCount}-${result ? "ready" : "loading"}`);

  if (!result) return <div className="h-96 animate-pulse rounded-2xl bg-card" />;

  return (
    <div className="space-y-6">
      <PersonaSwitcher personas={personas} currentPersonaId={personaId} onPick={(id) => navigate(`/verify/${id}`)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr_1fr]">
        <div className="space-y-6">
          <RequestCard result={result} />
          <RiskLadder personas={personas} currentPersonaId={personaId} onPick={(id) => navigate(`/verify/${id}`)} />
        </div>

        <div className="space-y-4">
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

        <DecisionPanel result={result} isRevealed={phase >= 4} isGaugeRevealed={phase >= 2} onReplay={() => setReplayCount((count) => count + 1)} />
      </div>
    </div>
  );
}

function formatEmailAge(days: number): string {
  if (days < 60) return `${days} days`;
  return `${Math.round(days / 365)} yrs`;
}

function PersonaSwitcher({ personas, currentPersonaId, onPick }: { personas: CrsChainResult[]; currentPersonaId: string; onPick: (personaId: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-muted-foreground">Who's asking:</span>
      {personas.map((persona) => {
        const look = CRS_DECISION_LOOK[persona.decision];
        const isCurrent = persona.personaId === currentPersonaId;
        return (
          <button
            key={persona.personaId}
            onClick={() => onPick(persona.personaId)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
              isCurrent ? "border-checking bg-checking/12 text-foreground" : "border-foreground/8 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            <span className={cn("size-2 rounded-full", TONE_STYLE[look.tone].dot)} />
            {persona.personaName}
          </button>
        );
      })}
    </div>
  );
}

function RequestCard({ result }: { result: CrsChainResult }) {
  const isBankChange = result.personaId === "P13" || result.personaId === "P12";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/8 bg-card p-6">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">The request</div>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-full bg-foreground/[0.06]">
          <UserRound className="size-7" />
        </span>
        <div>
          <div className="text-xl font-bold">{result.personaName}</div>
          <div className="text-sm text-muted-foreground">claims to be <span className="text-foreground">{result.claimsToBe}</span></div>
        </div>
      </div>
      <p className="mt-5 text-base leading-relaxed">{result.scenario}</p>

      {isBankChange && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-foreground/8 bg-background/60 p-3 font-mono text-sm">
          <div className="text-center">
            <div className="text-[10px] uppercase text-muted-foreground">verified</div>
            <div className="text-cleared">••4417</div>
          </div>
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          <div className="text-center">
            <div className="text-[10px] uppercase text-muted-foreground">requested</div>
            <div className="text-held">••9031</div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">At stake</div>
        <div className="text-4xl font-extrabold tabular-nums">{formatDollars(result.amountAtStakeCents)}</div>
      </div>
    </div>
  );
}

function DecisionPanel({ result, isRevealed, isGaugeRevealed, onReplay }: { result: CrsChainResult; isRevealed: boolean; isGaugeRevealed: boolean; onReplay: () => void }) {
  const look = CRS_DECISION_LOOK[result.decision];
  const tone = TONE_STYLE[look.tone];
  const Icon = look.icon;

  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-card p-6 transition-colors duration-700", isRevealed ? tone.border : "border-foreground/8")}>
      <RiskGauge score={result.fraudFinder.riskScore} isRevealed={isGaugeRevealed} />

      <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          {isRevealed ? (
            <motion.div key="decision" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <Icon className={cn("mx-auto size-12", tone.text)} />
              <div className={cn("mt-2 text-6xl font-black uppercase tracking-tight", tone.text)}>{look.label}</div>
              <div className="mt-2 text-lg font-medium">{result.decisionLine}</div>
              {result.decision === "held" && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-4 rounded-xl bg-cleared/12 px-4 py-2 text-cleared">
                  <span className="text-2xl font-extrabold">{formatDollars(result.amountAtStakeCents)}</span> saved
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key="pending" exit={{ opacity: 0 }} className="text-muted-foreground">Running checks…</motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={onReplay} className={primaryButton("sm", "mt-4 self-center")}>
        <RotateCcw className="size-4" /> Run again
      </button>
    </div>
  );
}

const HOLD_THRESHOLD = 70;

/** Every bank-change request this week as a bar of its risk score, with the hold line at 70. */
function RiskLadder({ personas, currentPersonaId, onPick }: { personas: CrsChainResult[]; currentPersonaId: string; onPick: (personaId: string) => void }) {
  const sorted = [...personas].sort((first, second) => second.fraudFinder.riskScore - first.fraudFinder.riskScore);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-semibold">Risk across this week's requests</div>
      <div className="mt-0.5 text-xs text-muted-foreground">Above {HOLD_THRESHOLD} is held automatically</div>
      <div className="relative mt-4 space-y-2">
        <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-held/50" style={{ left: `calc(84px + (100% - 84px - 28px) * ${HOLD_THRESHOLD / 100})` }} />
        {sorted.map((persona, index) => {
          const isCurrent = persona.personaId === currentPersonaId;
          const isHeld = persona.fraudFinder.riskScore >= HOLD_THRESHOLD;
          return (
            <button key={persona.personaId} onClick={() => onPick(persona.personaId)} className="flex w-full items-center gap-2 text-left">
              <span className={cn("w-[76px] shrink-0 truncate text-xs", isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>{persona.personaName.split(" ")[0]}</span>
              <div className="flex flex-1 items-center gap-1.5">
                <motion.div
                  className={cn("h-3 rounded-r-[4px]", isHeld ? "bg-held" : "bg-data", !isCurrent && "opacity-60")}
                  initial={{ width: 0 }}
                  animate={{ width: `${persona.fraudFinder.riskScore}%` }}
                  transition={{ delay: index * 0.04, duration: 0.5 }}
                />
                <span className="w-5 text-[11px] font-semibold tabular-nums">{persona.fraudFinder.riskScore}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
