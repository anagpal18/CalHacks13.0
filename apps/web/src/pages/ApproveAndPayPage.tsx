// ④ Approve & Pay: "The right person signs, then money moves."
// Bills sit on a due-date timeline, cash is a fill bar, a human approves, then each bill runs
// re-check → pay (Nessie) → bank match. One bill's bank details changed after booking: it is held at re-check.

import { AnimatePresence, motion } from "motion/react";
import { Bot, CalendarClock, Check, CircleX, Landmark, Loader, Percent, ShieldCheck, UserCheck, Wallet, X, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Button } from "@/components/ui/button";
import { getNextPaymentRun } from "@/data/dataSource";
import { DEMO_TODAY } from "@/data/mockData";
import { PAYMENT_CHECKS } from "@/data/stampCatalog";
import type { PaymentRun, PaymentRunItem } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars, formatShortDate, formatWeekday } from "@/lib/format";
import { TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

const CONTROLLER_NAME = "Dana Whitfield";
const EXECUTION_STEP_MS = 650;

type RunPhase = "proposed" | "executing" | "done";
type ItemStage = "queued" | "rechecking" | "paying" | "matching" | "paid" | "held";

/** Advances each item through re-check → pay → match, one item after another. */
function useExecution(items: PaymentRunItem[], isRunning: boolean) {
  const [stepCount, setStepCount] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    setStepCount(0);
    const interval = setInterval(() => setStepCount((count) => count + 1), EXECUTION_STEP_MS);
    return () => clearInterval(interval);
  }, [isRunning]);

  return useMemo(() => {
    const stageByBillId: Record<string, ItemStage> = {};
    let stepsUsed = 0;
    for (const item of items) {
      const stepsForItem = item.recheckOutcome === "unchanged" ? 4 : 2;
      const progress = isRunning ? stepCount - stepsUsed : -1;
      stepsUsed += stepsForItem;
      if (progress < 0) stageByBillId[item.billId] = "queued";
      else if (progress === 0) stageByBillId[item.billId] = "rechecking";
      else if (item.recheckOutcome !== "unchanged") stageByBillId[item.billId] = "held";
      else if (progress === 1) stageByBillId[item.billId] = "paying";
      else if (progress === 2) stageByBillId[item.billId] = "matching";
      else stageByBillId[item.billId] = "paid";
    }
    return { stageByBillId, isFinished: isRunning && stepCount >= stepsUsed };
  }, [items, isRunning, stepCount]);
}

export function ApproveAndPayPage() {
  const run = useAsyncData(getNextPaymentRun, []);
  const [phase, setPhase] = useState<RunPhase>("proposed");
  const [selfApprovalRefused, setSelfApprovalRefused] = useState(false);
  const { stageByBillId, isFinished } = useExecution(run?.items ?? [], phase !== "proposed");

  useEffect(() => {
    if (isFinished) setPhase("done");
  }, [isFinished]);

  if (!run) return <div className="h-[560px] animate-pulse rounded-3xl bg-card/50" />;

  const runTotalCents = run.items.reduce((total, item) => total + item.amountCents, 0);
  const discountCents = run.items.reduce((total, item) => total + (item.discount?.savingsCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <ChecksStrip phase={phase} />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <CashBar balanceCents={run.operatingBalanceCents} runTotalCents={runTotalCents} paidCents={sumPaid(run, stageByBillId)} />
          <DueDateTimeline items={run.items} stageByBillId={stageByBillId} />
        </div>

        <div className="space-y-6">
          <ApprovalCard
            run={run}
            runTotalCents={runTotalCents}
            discountCents={discountCents}
            phase={phase}
            selfApprovalRefused={selfApprovalRefused}
            onApprove={() => setPhase("executing")}
            onAgentSelfApprove={() => setSelfApprovalRefused(true)}
          />
          <AnimatePresence>{phase !== "proposed" && <ExecutionLog items={run.items} stageByBillId={stageByBillId} phase={phase} />}</AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function sumPaid(run: PaymentRun, stageByBillId: Record<string, ItemStage>): number {
  return run.items.filter((item) => stageByBillId[item.billId] === "paid").reduce((total, item) => total + item.amountCents, 0);
}

function ChecksStrip({ phase }: { phase: RunPhase }) {
  const passedThrough = phase === "proposed" ? 11 : phase === "executing" ? 12 : 14;
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
      {PAYMENT_CHECKS.map((check) => {
        const isPassed = check.number <= passedThrough;
        return (
          <div key={check.number} className={cn("rounded-xl border p-3 transition-colors duration-500", isPassed ? "border-cleared/40 bg-cleared/8" : "border-white/6 bg-card/40")}>
            <div className="flex items-center gap-2">
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", isPassed ? "bg-cleared text-background" : "bg-white/10 text-muted-foreground")}>
                {isPassed ? <Check className="size-3" /> : check.number}
              </span>
              <span className="text-sm font-semibold">{check.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{check.question}</p>
          </div>
        );
      })}
    </div>
  );
}

function CashBar({ balanceCents, runTotalCents, paidCents }: { balanceCents: number; runTotalCents: number; paidCents: number }) {
  const runPercent = (runTotalCents / balanceCents) * 100;
  const paidPercent = (paidCents / balanceCents) * 100;
  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-checking" /> Cash in the operating account</div>
        <div className="text-right">
          <div className="text-2xl font-extrabold tabular-nums">{formatDollars(balanceCents - paidCents)}</div>
          <div className="text-xs text-muted-foreground">live from Nessie</div>
        </div>
      </div>
      <div className="relative mt-4 h-5 overflow-hidden rounded-full bg-white/6">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-checking/35" initial={{ width: 0 }} animate={{ width: `${Math.max(runPercent * 6, 4)}%` }} transition={{ duration: 1 }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-cleared" animate={{ width: `${Math.max(paidPercent * 6, 0)}%` }} transition={{ duration: 0.5 }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>This run: <span className="font-semibold text-foreground">{formatDollars(runTotalCents)}</span> ({runPercent.toFixed(1)}% of cash, bar zoomed 6×)</span>
        <span className="flex items-center gap-1 text-cleared"><Check className="size-3.5" /> Enough cash</span>
      </div>
    </div>
  );
}

function DueDateTimeline({ items, stageByBillId }: { items: PaymentRunItem[]; stageByBillId: Record<string, ItemStage> }) {
  const dueDates = [...new Set(items.map((item) => item.dueDate))].sort();
  const daysFromToday = (isoDate: string) => Math.round((new Date(isoDate).getTime() - new Date(DEMO_TODAY).getTime()) / 86_400_000);

  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-checking" /> Grouped by due date</div>
      <div className="relative">
        <div className="absolute inset-x-0 top-[22px] h-px bg-white/10" />
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${dueDates.length}, minmax(0, 1fr))` }}>
          {dueDates.map((dueDate) => (
            <div key={dueDate} className="relative">
              <div className="flex flex-col items-center">
                <span className="relative z-10 flex size-11 flex-col items-center justify-center rounded-full border border-white/12 bg-background text-center leading-none">
                  <span className="text-[9px] uppercase text-muted-foreground">{formatWeekday(dueDate)}</span>
                  <span className="text-sm font-bold">{formatShortDate(dueDate).split(" ")[1]}</span>
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">{formatShortDate(dueDate)} · in {daysFromToday(dueDate)}d</span>
              </div>
              <div className="mt-3 space-y-2">
                {items.filter((item) => item.dueDate === dueDate).map((item) => <RunItemCard key={item.billId} item={item} stage={stageByBillId[item.billId]} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunItemCard({ item, stage }: { item: PaymentRunItem; stage: ItemStage }) {
  const isPaid = stage === "paid";
  const isHeld = stage === "held";
  const isBusy = stage === "rechecking" || stage === "paying" || stage === "matching";
  return (
    <motion.div
      layout
      className={cn(
        "relative rounded-xl border bg-background/70 p-3 transition-colors duration-500",
        isPaid && "border-cleared/50 bg-cleared/8",
        isHeld && "border-held/50 bg-held/8",
        isBusy && "border-checking/60",
        stage === "queued" && "border-white/8",
      )}
    >
      <div className="truncate text-sm font-semibold">{item.vendorName}</div>
      <div className="text-lg font-bold tabular-nums">{formatDollars(item.amountCents)}</div>
      <div className="text-[11px] text-muted-foreground">{item.terms}</div>
      {item.discount && (
        <div className="mt-2 flex items-center gap-1 rounded-md bg-asking/12 px-1.5 py-0.5 text-[11px] font-semibold text-asking">
          <Percent className="size-3" /> Save {formatDollars(item.discount.savingsCents)}
        </div>
      )}
      <span className="absolute right-2 top-2">
        {isPaid && <Check className="size-4 text-cleared" />}
        {isHeld && <CircleX className="size-4 text-held" />}
        {isBusy && <Loader className="size-4 animate-spin text-checking" />}
      </span>
    </motion.div>
  );
}

interface ApprovalCardProps {
  run: PaymentRun;
  runTotalCents: number;
  discountCents: number;
  phase: RunPhase;
  selfApprovalRefused: boolean;
  onApprove: () => void;
  onAgentSelfApprove: () => void;
}

function ApprovalCard({ run, runTotalCents, discountCents, phase, selfApprovalRefused, onApprove, onAgentSelfApprove }: ApprovalCardProps) {
  const rules = [
    { label: "A human approves", ok: true },
    { label: "Approver is not the requester", ok: true },
    { label: `Within ${formatDollars(run.approverLimitCents, { compact: true })} limit`, ok: runTotalCents <= run.approverLimitCents },
  ];
  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Payment run</div>
          <div className="font-mono text-sm">{run.runId}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold tabular-nums">{formatDollars(runTotalCents)}</div>
          <div className="text-xs text-asking">{formatDollars(discountCents)} in early-pay discounts</div>
        </div>
      </div>

      {/* Requester → approver handoff */}
      <div className="mt-5 flex items-center gap-3">
        <Person icon={Bot} name={run.requestedBy} role="proposed it" />
        <div className="h-px flex-1 bg-gradient-to-r from-white/10 via-white/30 to-white/10" />
        <Person icon={UserCheck} name={CONTROLLER_NAME} role="Controller signs" highlighted={phase !== "proposed"} />
      </div>

      <div className="mt-5 space-y-1.5">
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-center gap-2 text-sm">
            <span className={cn("flex size-5 items-center justify-center rounded-full", rule.ok ? "bg-cleared/15 text-cleared" : "bg-held/15 text-held")}>
              {rule.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            {rule.label}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        {phase === "proposed" ? (
          <>
            <HoverBorderGradient onClick={onApprove} containerClassName="rounded-full" className="flex items-center gap-2 bg-background px-8 py-3 text-base font-bold">
              <ShieldCheck className="size-5 text-cleared" /> Approve as {CONTROLLER_NAME.split(" ")[0]}
            </HoverBorderGradient>
            <Button variant="ghost" size="sm" onClick={onAgentSelfApprove} className="text-xs text-muted-foreground">
              <Bot className="size-3.5" /> Let the Payments agent approve its own run
            </Button>
            <AnimatePresence>
              {selfApprovalRefused && (
                <motion.div
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
                  exit={{ opacity: 0 }}
                  className="w-full rounded-xl border border-held/40 bg-held/10 p-3 text-sm text-held"
                >
                  <div className="font-semibold">Gateway refused (403)</div>
                  <div className="text-xs">The requester can't approve its own run. A human has to sign.</div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="flex items-center gap-2 text-lg font-bold text-cleared"><ShieldCheck className="size-5" /> Approved by {CONTROLLER_NAME}</div>
        )}
      </div>
    </div>
  );
}

function Person({ icon: Icon, name, role, highlighted }: { icon: typeof Bot; name: string; role: string; highlighted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex size-10 items-center justify-center rounded-full border transition-colors", highlighted ? "border-cleared bg-cleared/15 text-cleared" : "border-white/12 bg-background")}>
        <Icon className="size-5" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-[11px] text-muted-foreground">{role}</div>
      </div>
    </div>
  );
}

const STAGE_STEPS = [
  { key: "recheck", label: "Re-check", icon: ShieldCheck },
  { key: "pay", label: "Pay via Nessie", icon: Landmark },
  { key: "match", label: "Bank match", icon: Link2 },
] as const;

function stepTone(stage: ItemStage, stepIndex: number): "done" | "active" | "failed" | "idle" {
  const order: ItemStage[] = ["rechecking", "paying", "matching"];
  if (stage === "paid") return "done";
  if (stage === "held") return stepIndex === 0 ? "failed" : "idle";
  const activeIndex = order.indexOf(stage);
  if (activeIndex === -1) return "idle";
  if (stepIndex < activeIndex) return "done";
  return stepIndex === activeIndex ? "active" : "idle";
}

function ExecutionLog({ items, stageByBillId, phase }: { items: PaymentRunItem[]; stageByBillId: Record<string, ItemStage>; phase: RunPhase }) {
  const heldItems = items.filter((item) => stageByBillId[item.billId] === "held");
  const paidItems = items.filter((item) => stageByBillId[item.billId] === "paid");

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="mb-3 text-sm font-semibold">Money moving</div>
      <div className="space-y-2">
        {items.map((item) => {
          const stage = stageByBillId[item.billId];
          return (
            <div key={item.billId} className="flex items-center gap-3">
              <span className="w-32 truncate text-xs">{item.vendorName}</span>
              <div className="flex flex-1 items-center gap-1">
                {STAGE_STEPS.map((step, stepIndex) => {
                  const tone = stepTone(stage, stepIndex);
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.key}
                      title={step.label}
                      className={cn(
                        "flex h-7 flex-1 items-center justify-center rounded-md border text-[10px] transition-colors duration-300",
                        tone === "done" && "border-cleared/40 bg-cleared/15 text-cleared",
                        tone === "active" && "border-checking/60 bg-checking/15 text-checking",
                        tone === "failed" && "border-held/50 bg-held/15 text-held",
                        tone === "idle" && "border-white/6 text-muted-foreground/40",
                      )}
                    >
                      <Icon className={cn("size-3.5", tone === "active" && "animate-pulse")} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {heldItems.map((item) => (
        <motion.div key={item.billId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("mt-4 rounded-xl border p-3 text-sm", TONE_STYLE.held.border, TONE_STYLE.held.background)}>
          <div className="font-semibold text-held">{item.vendorName} held at re-check</div>
          <div className="text-xs">Bank details changed after the bill was booked. Payment stopped and identity checks started on whoever made the change.</div>
        </motion.div>
      ))}

      {phase === "done" && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 flex items-center justify-between rounded-xl border border-cleared/40 bg-cleared/10 p-3">
          <span className="text-sm font-semibold text-cleared">{paidItems.length} paid · matched in Nessie</span>
          <span className="text-lg font-extrabold tabular-nums text-cleared">{formatDollars(paidItems.reduce((total, item) => total + item.amountCents, 0))}</span>
        </motion.div>
      )}
    </motion.div>
  );
}
