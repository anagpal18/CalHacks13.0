// Overview: the landing page for the AP manager.
// First the manager uploads bills: company snapshot on top, upload + a skeleton list while the agents check them.
// When every bill is checked, "Needs your attention" and "Processed" take the top and the snapshot slides down.

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, BadgeCheck, CircleX, Hand, Landmark, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Panel, StatFigure } from "@/components/charts/Panel";
import { Sparkline } from "@/components/charts/Sparkline";
import { ProcessingList } from "@/components/upload/ProcessingList";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { useUploadSession } from "@/components/upload/UploadSessionContext";
import { getNextPaymentRun, getScore, getWeekIntake, listAttentionItems, listBills, listProcessedInvoices } from "@/data/dataSource";
import type { AttentionItem, AttentionKind, BillSummary, ProcessedInvoice } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars } from "@/lib/format";
import { TONE_STYLE } from "@/lib/statusStyle";
import { primaryButton } from "@/lib/buttonStyles";
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
  const processed = useAsyncData(listProcessedInvoices, []) ?? [];
  const { uploads, phase } = useUploadSession();

  const billsThisWeek = week.reduce((total, day) => total + day.billsReceived, 0);
  const caughtThisWeek = week.reduce((total, day) => total + day.problemsCaught, 0);
  const protectedThisWeek = week.reduce((total, day) => total + day.protectedCents, 0);
  const autoBookedShare = billsThisWeek > 0 ? (billsThisWeek - caughtThisWeek) / billsThisWeek : 0;
  const caughtCount = score?.plantedProblems.filter((problem) => problem.outcome === "caught").length ?? 0;

  const snapshot = (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <SnapshotTile label="Bills processed this week" value={billsThisWeek.toLocaleString()} trend={week.map((day) => day.billsReceived)} note="Oct 18 – 24" />
      <SnapshotTile label="Handled without a person" value={`${Math.round(autoBookedShare * 100)}%`} trend={week.map((day) => (day.billsReceived ? (day.billsReceived - day.problemsCaught) / day.billsReceived : 1))} note={`${billsThisWeek - caughtThisWeek} booked automatically`} />
      <SnapshotTile label="Kept from going out" value={formatDollars(protectedThisWeek, { compact: true })} trend={week.map((day) => day.protectedCents)} note={`${caughtThisWeek} problems stopped`} />
      <SnapshotTile label="Cash in the bank" value={run ? formatDollars(run.operatingBalanceCents, { compact: true }) : "–"} note={run ? `${formatDollars(run.operatingBalanceCents - run.items.reduce((total, item) => total + item.amountCents, 0), { compact: true })} after this week's run` : undefined} />
    </div>
  );

  const uploadPanel = (
    <Panel title="Upload bills" subtitle="Send this week's bills to the agents. You'll see what needs you as soon as they're checked.">
      <UploadDropzone />
      {uploads.length > 0 && (
        <div className="mt-6">
          <ProcessingList uploads={uploads} />
        </div>
      )}
    </Panel>
  );

  const results = (
    <div className="grid gap-5 xl:grid-cols-12">
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

      <div className="space-y-5 xl:col-span-5">
        <Panel title="Processed" subtitle={`${uploads.length} bills you uploaded, plus the rest of the week`} action={<span className="text-xs text-muted-foreground">{processed.length} this week</span>}>
          <RecentProcessed invoices={processed.slice(0, 4)} />
        </Panel>

        <Panel title="Processed for you · today" subtitle="Checked by the agents, no one had to look">
          <ProcessedToday bills={bills} />
        </Panel>

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
  );

  // Before and during processing: snapshot on top, upload + skeleton list below.
  // Once every bill is checked: the two decision columns take the top and the snapshot slides down.
  const sections =
    phase === "processed"
      ? [
          { key: "results", node: results },
          { key: "upload-more", node: <UploadDropzone compact /> },
          { key: "snapshot", node: snapshot },
        ]
      : [
          { key: "snapshot", node: snapshot },
          { key: "upload", node: uploadPanel },
        ];

  return (
    <LayoutGroup>
      <div className="space-y-5">
        <AnimatePresence initial={false}>
          {sections.map((section) => (
            <motion.div
              key={section.key}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ layout: { type: "spring", stiffness: 160, damping: 24 }, duration: 0.35 }}
            >
              {section.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
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
              className={primaryButton("md", "ml-auto")}
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
      <Link to="/inbox" className={primaryButton("sm", "mt-4")}>See today's intake <ArrowRight className="size-3.5" /></Link>
    </div>
  );
}

function RecentProcessed({ invoices }: { invoices: ProcessedInvoice[] }) {
  return (
    <div>
      <div className="divide-y divide-border">
        {invoices.map((invoice) => (
          <div key={invoice.billId} className="flex items-center gap-3 py-2.5 first:pt-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-xs font-semibold">
              {invoice.vendorName.split(" ").map((word) => word[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{invoice.vendorName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {invoice.invoiceNumber} · {invoice.status === "paid" ? `Approved by ${invoice.approvedBy.split(" ")[0]}` : "Booked automatically"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{formatDollars(invoice.amountCents)}</div>
              <span className={cn("text-[11px] font-medium", invoice.status === "paid" ? "text-approved" : "text-muted-foreground")}>
                {invoice.status === "paid" ? "Paid" : "Booked · 8/8"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <Link to="/processed" className={primaryButton("md", "mt-4 w-full")}>
        View more <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
