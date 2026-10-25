// ④ Approve & Pay: "The right person signs, then money moves."
// Bills sit on a due-date timeline, cash is a fill bar, a human approves, then each bill runs
// re-check → pay (Nessie) → bank match on its card. A bill whose bank details changed after booking is held
// at re-check and raised as an alert at the top.

import { AnimatePresence, motion } from "motion/react";
import { Bot, CalendarClock, Check, CircleX, Loader, Percent, ShieldCheck, TriangleAlert, UserCheck, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApprovedCheck } from "@/components/visuals/ApprovedCheck";
import { getNextPaymentRun } from "@/data/dataSource";
import { DEMO_TODAY } from "@/data/mockData";
import { PAYMENT_CHECKS } from "@/data/stampCatalog";
import type { PaymentRun, PaymentRunItem } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars, formatShortDate, formatWeekday } from "@/lib/format";
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

  if (!run) return <div className="h-[560px] animate-pulse rounded-3xl bg-card" />;

  const heldItems = run.items.filter((item) => stageByBillId[item.billId] === "held");
  const runTotalCents = run.items.reduce((total, item) => total + item.amountCents, 0);
  const discountCents = run.items.reduce((total, item) => total + (item.discount?.savingsCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {heldItems.map((item) => (
          <motion.div key={item.billId} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert className="border-held/30 bg-card">
              <TriangleAlert className="text-held" />
              <AlertTitle>Escalated for your review: {item.vendorName}</AlertTitle>
              <AlertDescription>
                <p>Bank details changed after this {formatDollars(item.amountCents)} bill was booked, so it was held at the last-minute re-check and not paid. The rest of the run went through.</p>
                <Link to="/overview" className="font-medium text-foreground underline underline-offset-4">Added to Needs your attention</Link>
              </AlertDescription>
            </Alert>
          </motion.div>
        ))}
      </AnimatePresence>

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
          <div key={check.number} className={cn("rounded-xl border p-3 transition-colors duration-500", isPassed ? "border-transparent bg-card shadow-[0_1px_2px_rgb(31_36_51/0.05)]" : "border-dashed border-foreground/15 bg-transparent")}>
            <div className="flex items-center gap-2">
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", isPassed ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground")}>
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
    <div className="rounded-2xl border border-foreground/8 bg-card p-5">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-checking" /> Cash in the operating account</div>
        <div className="text-right">
          <div className="text-2xl font-extrabold tabular-nums">{formatDollars(balanceCents - paidCents)}</div>
          <div className="text-xs text-muted-foreground">live from Nessie</div>
        </div>
      </div>
      <div className="relative mt-4 h-4 overflow-hidden rounded-full bg-track">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-data-soft" initial={{ width: 0 }} animate={{ width: `${Math.max(runPercent * 6, 4)}%` }} transition={{ duration: 1 }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-data" animate={{ width: `${Math.max(paidPercent * 6, 0)}%` }} transition={{ duration: 0.5 }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>This run: <span className="font-semibold text-foreground">{formatDollars(runTotalCents)}</span> ({runPercent.toFixed(1)}% of cash, bar zoomed 6×)</span>
        <span className="flex items-center gap-1 font-medium text-foreground"><Check className="size-3.5" /> Enough cash</span>
      </div>
    </div>
  );
}

function DueDateTimeline({ items, stageByBillId }: { items: PaymentRunItem[]; stageByBillId: Record<string, ItemStage> }) {
  const dueDates = [...new Set(items.map((item) => item.dueDate))].sort();
  const maxDueCents = Math.max(...dueDates.map((dueDate) => items.filter((item) => item.dueDate === dueDate).reduce((total, item) => total + item.amountCents, 0)));
  const daysFromToday = (isoDate: string) => Math.round((new Date(isoDate).getTime() - new Date(DEMO_TODAY).getTime()) / 86_400_000);

  return (
    <div className="rounded-2xl border border-foreground/8 bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-checking" /> Grouped by due date</div>
      <div className="relative">
        <div className="absolute inset-x-0 top-[118px] h-px bg-border" />
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${dueDates.length}, minmax(0, 1fr))` }}>
          {dueDates.map((dueDate) => (
            <div key={dueDate} className="relative">
              <DueColumn amountCents={items.filter((item) => item.dueDate === dueDate).reduce((total, item) => total + item.amountCents, 0)} maxCents={maxDueCents} />
              <div className="flex flex-col items-center">
                <span className="relative z-10 flex size-11 flex-col items-center justify-center rounded-full border border-foreground/12 bg-background text-center leading-none">
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
        "relative rounded-xl border bg-card p-3 transition-colors duration-500",
        isPaid && "border-foreground/40",
        isHeld && "border-held/50 bg-held/8",
        isBusy && "border-checking/60",
        stage === "queued" && "border-border",
      )}
    >
      <div className="truncate text-sm font-semibold">{item.vendorName}</div>
      <div className="text-lg font-bold tabular-nums">{formatDollars(item.amountCents)}</div>
      <div className="text-[11px] text-muted-foreground">{item.terms}</div>
      {item.discount && (
        <div className="mt-2 flex w-fit items-center gap-1 rounded-full bg-data-soft/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
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
    <div className="rounded-2xl border border-foreground/8 bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Payment run</div>
          <div className="font-mono text-sm">{run.runId}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold tabular-nums">{formatDollars(runTotalCents)}</div>
          <div className="text-xs text-muted-foreground">{formatDollars(discountCents)} in early-pay discounts</div>
        </div>
      </div>

      {/* Requester → approver handoff */}
      <div className="mt-5 flex items-center gap-3">
        <Person icon={Bot} name={run.requestedBy} role="proposed it" />
        <div className="h-px flex-1 bg-border" />
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
            <button onClick={onApprove} className="flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-base font-semibold text-background transition hover:bg-foreground/85">
              <ShieldCheck className="size-5" /> Approve as {CONTROLLER_NAME.split(" ")[0]}
            </button>
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
          <ApprovedCheck />
        )}
      </div>
    </div>
  );
}

function Person({ icon: Icon, name, role, highlighted }: { icon: typeof Bot; name: string; role: string; highlighted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex size-10 items-center justify-center rounded-full border transition-colors", highlighted ? "border-cleared bg-cleared/15 text-cleared" : "border-foreground/12 bg-background")}>
        <Icon className="size-5" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-[11px] text-muted-foreground">{role}</div>
      </div>
    </div>
  );
}

/** Cash going out on one due date: a <=24px column, rounded at the top, value on the cap. */
function DueColumn({ amountCents, maxCents }: { amountCents: number; maxCents: number }) {
  const columnHeight = Math.max((amountCents / maxCents) * 64, 6);
  return (
    <div className="mb-2 flex h-[88px] flex-col items-center justify-end">
      <span className="mb-1 text-xs font-semibold">{formatDollars(amountCents, { compact: true })}</span>
      <motion.span className="w-6 rounded-t-[4px] bg-data" initial={{ height: 0 }} animate={{ height: columnHeight }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}
