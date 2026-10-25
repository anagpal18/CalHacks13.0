// Overview: the landing page for the AP manager.
// Top: what needs a person (ranked by urgency), what money is about to move, and a receipt of what
// the automation handled. Below: the company snapshot. Every item links into the step tab where the decision or detail lives.

import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, CalendarClock, CircleX, Hand, Landmark, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Panel, StatFigure } from "@/components/charts/Panel";
import { Sparkline } from "@/components/charts/Sparkline";
import { getNextPaymentRun, getScore, getWeekIntake, listAttentionItems, listBills } from "@/data/dataSource";
import type { AttentionItem, AttentionKind, BillSummary, PaymentRun } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars, formatShortDate, formatWeekday } from "@/lib/format";
import { TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

const ATTENTION_ICON: Record<AttentionKind, LucideIcon> = {
  approve_run: Landmark,
  bank_change: CircleX,
  escalation: Hand,
  parked: Hand,
  vendor_review: Hand,
};

export function OverviewPage() {
  const attentionItems = useAsyncData(listAttentionItems, []) ?? [];
  const week = useAsyncData(getWeekIntake, []) ?? [];
  const bills = useAsyncData(listBills, []) ?? [];
  const run = useAsyncData(getNextPaymentRun, []);
  const score = useAsyncData(getScore, []);

  const billsThisWeek = week.reduce((total, day) => total + day.billsReceived, 0);
  const caughtThisWeek = week.reduce((total, day) => total + day.problemsCaught, 0);
  const protectedThisWeek = week.reduce((total, day) => total + day.protectedCents, 0);
  const autoBookedShare = billsThisWeek > 0 ? (billsThisWeek - caughtThisWeek) / billsThisWeek : 0;
  const caughtCount = score?.plantedProblems.filter((problem) => problem.outcome === "caught").length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-12">
        {/* Needs your attention */}
        <Panel
          className="xl:col-span-7"
          title="Needs your attention"
          subtitle="Ranked by urgency. Each one has a recommendation; you make the call."
          action={<span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">{attentionItems.length} open</span>}
        >
          <div className="space-y-3">
            {attentionItems.map((item, index) => <AttentionRow key={item.id} item={item} index={index} />)}
          </div>
        </Panel>

        {/* Processed for you + money about to move */}
        <div className="space-y-5 xl:col-span-5">
          <Panel title="Processed for you · today" subtitle="Checked by the agents, no one had to look">
            <ProcessedToday bills={bills} />
          </Panel>

          {run && (
            <Panel title="Money about to move" subtitle="Next payment run, by due date" action={<Link to="/pay" className="text-sm underline underline-offset-4">Open run</Link>}>
              <UpcomingPayments run={run} />
            </Panel>
          )}

          <Link to="/proof" className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)] transition hover:shadow-[0_2px_4px_rgb(31_36_51/0.06),0_12px_28px_-12px_rgb(31_36_51/0.18)]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05]"><Trophy className="size-5 text-foreground/70" /></span>
            <div className="flex-1">
              <div className="text-sm font-semibold">{caughtCount} of {score?.plantedProblems.length ?? 40} planted problems caught</div>
              <div className="text-xs text-muted-foreground">0 payments made without a human signature · every decision has a signed trail</div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Company snapshot */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotTile label="Bills processed this week" value={billsThisWeek.toLocaleString()} trend={week.map((day) => day.billsReceived)} note="Oct 18 – 24" />
        <SnapshotTile label="Handled without a person" value={`${Math.round(autoBookedShare * 100)}%`} trend={week.map((day) => (day.billsReceived ? (day.billsReceived - day.problemsCaught) / day.billsReceived : 1))} note={`${billsThisWeek - caughtThisWeek} booked automatically`} />
        <SnapshotTile label="Kept from going out" value={formatDollars(protectedThisWeek, { compact: true })} trend={week.map((day) => day.protectedCents)} note={`${caughtThisWeek} problems stopped`} />
        <SnapshotTile label="Cash in the bank" value={run ? formatDollars(run.operatingBalanceCents, { compact: true }) : "–"} note={run ? `${formatDollars(run.operatingBalanceCents - run.items.reduce((total, item) => total + item.amountCents, 0), { compact: true })} after this week's run` : undefined} />
      </div>
    </div>
  );
}

function SnapshotTile({ label, value, note, trend }: { label: string; value: string; note?: string; trend?: number[] }) {
  return (
    <div className="flex items-end justify-between gap-4 rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)]">
      <StatFigure label={label} value={value} note={note} />
      {trend && trend.length > 1 && <Sparkline values={trend} width={96} height={36} />}
    </div>
  );
}

function AttentionRow({ item, index }: { item: AttentionItem; index: number }) {
  const tone = TONE_STYLE[item.tone];
  const Icon = ATTENTION_ICON[item.kind];
  const isRun = item.kind === "approve_run";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn("relative overflow-hidden rounded-2xl border p-4 pl-5", isRun ? "border-foreground/15 bg-background" : "border-border bg-card")}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", item.tone === "held" ? "bg-held" : item.tone === "asking" ? "bg-asking" : "bg-foreground")} />
      <div className="flex flex-wrap items-start gap-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", item.tone === "checking" ? "bg-foreground text-background" : cn(tone.background, tone.text))}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[15px] font-semibold">{item.title}</span>
            <span className="text-lg font-semibold tracking-tight">{formatDollars(item.amountCents)}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <span className={cn("size-1.5 rounded-full", item.tone === "held" ? "bg-held" : item.tone === "asking" ? "bg-asking" : "bg-foreground")} />
              Recommend: <span className="font-semibold">{item.recommendation}</span>
            </span>
            {item.urgencyNote && <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-muted-foreground">{item.urgencyNote}</span>}
            <Link
              to={item.href}
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
                isRun ? "bg-foreground text-background hover:bg-foreground/85" : "border border-border hover:border-foreground/30",
              )}
            >
              {item.actionLabel} <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Today's bills as one segmented bar (2px gaps between segments) with a legend, then the counts. */
function ProcessedToday({ bills }: { bills: BillSummary[] }) {
  const segments = [
    { key: "booked", label: "Booked", count: bills.filter((bill) => bill.status === "booked").length, className: "bg-foreground", icon: ShieldCheck },
    { key: "held", label: "Held", count: bills.filter((bill) => bill.status === "held").length, className: "bg-held", icon: CircleX },
    { key: "asking", label: "Asking a person", count: bills.filter((bill) => bill.status === "parked").length, className: "bg-asking", icon: Hand },
    { key: "checking", label: "Still checking", count: bills.filter((bill) => bill.status === "checking").length, className: "bg-data-soft", icon: BadgeCheck },
  ];
  const total = bills.length || 1;
  const protectedCents = bills.filter((bill) => bill.status === "held").reduce((sum, bill) => sum + bill.amountCents, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <StatFigure label="Bills checked" value={bills.length} />
        <StatFigure label="Protected" value={formatDollars(protectedCents, { compact: true })} className="text-right" />
      </div>
      <div className="mt-5 flex h-3 gap-[2px] overflow-hidden rounded-full">
        {segments.filter((segment) => segment.count > 0).map((segment, index) => (
          <motion.span
            key={segment.key}
            className={cn("h-full", segment.className)}
            initial={{ width: 0 }}
            animate={{ width: `${(segment.count / total) * 100}%` }}
            transition={{ delay: index * 0.08, duration: 0.6 }}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground"><span className={cn("size-2 rounded-full", segment.className)} />{segment.label}</span>
            <span className="font-semibold tabular-nums">{segment.count}</span>
          </div>
        ))}
      </div>
      <Link to="/inbox" className="mt-4 inline-flex items-center gap-1 text-sm underline underline-offset-4">See today's intake <ArrowRight className="size-3.5" /></Link>
    </div>
  );
}

function UpcomingPayments({ run }: { run: PaymentRun }) {
  const dueDates = [...new Set(run.items.map((item) => item.dueDate))].sort();
  const totals = dueDates.map((dueDate) => run.items.filter((item) => item.dueDate === dueDate).reduce((sum, item) => sum + item.amountCents, 0));
  const maxTotal = Math.max(...totals);
  const discountItems = run.items.filter((item) => item.discount);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        {dueDates.map((dueDate, index) => (
          <div key={dueDate} className="flex flex-1 flex-col items-center">
            <span className="mb-1 text-xs font-semibold">{formatDollars(totals[index], { compact: true })}</span>
            <motion.span className="w-6 rounded-t-[4px] bg-data" initial={{ height: 0 }} animate={{ height: Math.max((totals[index] / maxTotal) * 56, 6) }} transition={{ delay: index * 0.06, duration: 0.5 }} />
            <span className="mt-2 text-[11px] text-muted-foreground">{formatWeekday(dueDate)} {formatShortDate(dueDate).split(" ")[1]}</span>
          </div>
        ))}
      </div>
      {discountItems.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-border pt-3">
          {discountItems.map((item) => (
            <div key={item.billId} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="size-3.5" />Pay {item.vendorName} by {formatShortDate(item.discount!.payByDate)}</span>
              <span className="font-semibold">save {formatDollars(item.discount!.savingsCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
