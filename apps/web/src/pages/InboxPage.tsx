// ① Inbox: "Bills are coming in."
// Top: the week at a glance (lollipop of money billed per day, bills worth a look, what we caught).
// Bottom: today's live intake replayed as a pipeline: bills arrive, get checked, then move to Booked / Asking / Held.

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CalendarDays, ChevronDown, Hand, Loader, Mail, MonitorSmartphone, RotateCcw, ShieldAlert, ShieldCheck, Wallet, Radar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { LollipopChart } from "@/components/charts/LollipopChart";
import { Panel, StatFigure } from "@/components/charts/Panel";
import { Sparkline } from "@/components/charts/Sparkline";
import { TickStrip, type TickGroup } from "@/components/charts/TickStrip";
import { AnimatedNumber } from "@/components/visuals/AnimatedNumber";
import { StatusPill } from "@/components/visuals/StatusPill";
import { getScore, getWeekIntake, listBills } from "@/data/dataSource";
import type { BillSummary, ProblemKind } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatClockTime, formatDollars } from "@/lib/format";
import { PASSPORT_STATUS_LOOK, TONE_STYLE, type Tone } from "@/lib/statusStyle";
import { primaryButton } from "@/lib/buttonStyles";
import { cn } from "@/lib/utils";

const TICK_MS = 380;
const TICKS_IN_CHECKING = 3;

export function InboxPage() {
  const bills = useAsyncData(listBills, []) ?? [];
  const week = useAsyncData(getWeekIntake, []) ?? [];
  const score = useAsyncData(getScore, []);
  const navigate = useNavigate();

  const caughtThisWeek = week.reduce((total, day) => total + day.problemsCaught, 0);
  const protectedThisWeek = week.reduce((total, day) => total + day.protectedCents, 0);
  const billedThisWeek = week.reduce((total, day) => total + day.amountCents, 0);
  const billsThisWeek = week.reduce((total, day) => total + day.billsReceived, 0);
  // "Today" comes from the live bills so it always matches the pipeline below.
  const todayBillCount = bills.length;
  const todayCaughtCount = bills.filter((bill) => bill.status === "held" || bill.status === "parked").length;
  const todayProtectedCents = bills.filter((bill) => bill.status === "held").reduce((total, bill) => total + bill.amountCents, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          icon={Wallet}
          title="Money billed this week"
          subtitle="What vendors asked us to pay each day, and how much of it we stopped."
          action={<span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium"><CalendarDays className="size-3.5" /> Oct 18 – 24</span>}
        >
          {week.length > 0 && (
            <div className="grid items-end gap-6 md:grid-cols-[200px_1fr]">
              <div className="space-y-6 pb-12">
                <StatFigure label="Kept from going out" value={formatDollars(protectedThisWeek, { compact: true })} note={`${caughtThisWeek} problems caught in ${billsThisWeek} bills`} />
                <StatFigure label="Billed" value={formatDollars(billedThisWeek, { compact: true })} note={`${((protectedThisWeek / billedThisWeek) * 100).toFixed(1)}% of billed dollars stopped`} />
              </div>
              <LollipopChart
                data={week.map((day) => ({ key: day.date, label: day.dayLetter, value: day.amountCents, detail: `${day.billsReceived} bills` }))}
                formatValue={(cents) => formatDollars(cents, { compact: true })}
                height={300}
              />
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-5" title="Bills worth a look" subtitle="Held or waiting on a person" action={<button onClick={() => navigate("/check")} className={primaryButton("sm")}>See all</button>}>
          <WorthALookList bills={bills.filter((bill) => bill.status === "held" || bill.status === "parked").slice(0, 5)} onOpen={(billId) => navigate(`/check/${billId}`)} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-4" title="Today" subtitle="Live from this morning's intake">
          {week.length > 0 && (
            <div className="space-y-6">
              <TrendRow label="Bills checked" value={todayBillCount.toLocaleString()} values={[...week.slice(0, -1).map((day) => day.billsReceived), todayBillCount]} />
              <TrendRow label="Problems caught" value={String(todayCaughtCount)} values={[...week.slice(0, -1).map((day) => day.problemsCaught), todayCaughtCount]} />
              <TrendRow label="Protected" value={formatDollars(todayProtectedCents, { compact: true })} values={[...week.slice(0, -1).map((day) => day.protectedCents), todayProtectedCents]} />
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-8" icon={Radar} title="What we caught this week" subtitle="One tick per problem. Scams in orange.">
          {score && <TickStrip groups={buildCaughtGroups(score.plantedProblems.filter((problem) => problem.outcome === "caught").map((problem) => problem.kind))} tickHeight={48} />}
        </Panel>
      </div>

      <LiveIntake bills={bills} onOpen={(billId) => navigate(`/check/${billId}`)} />
    </div>
  );
}

const CAUGHT_GROUPS: { key: string; label: string; kinds: ProblemKind[]; tone: TickGroup["tone"] }[] = [
  { key: "repeat", label: "Duplicates", kinds: ["duplicate"], tone: "ink" },
  { key: "scam", label: "Scams & bank changes", kinds: ["bank_change_scam", "bank_change_after_booking", "ghost_vendor", "insider_vendor"], tone: "held" },
  { key: "order", label: "Price & delivery", kinds: ["price_creep", "not_delivered"], tone: "data" },
  { key: "process", label: "Terms & approvals", kinds: ["wrong_terms", "missed_discount", "self_approval", "bank_mismatch"], tone: "muted" },
];

function buildCaughtGroups(kinds: ProblemKind[]): TickGroup[] {
  return CAUGHT_GROUPS.map((group) => ({ key: group.key, label: group.label, tone: group.tone, value: kinds.filter((kind) => group.kinds.includes(kind)).length }));
}

function TrendRow({ label, value, values }: { label: string; value: string; values: number[] }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <StatFigure label={label} value={value} />
      <Sparkline values={values} width={130} height={40} />
    </div>
  );
}

function WorthALookList({ bills, onOpen }: { bills: BillSummary[]; onOpen: (billId: string) => void }) {
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  useEffect(() => {
    if (!openBillId && bills[0]) setOpenBillId(bills[0].billId);
  }, [bills, openBillId]);

  return (
    <div className="divide-y divide-border">
      {bills.map((bill) => {
        const look = PASSPORT_STATUS_LOOK[bill.status];
        const isOpen = bill.billId === openBillId;
        return (
          <div key={bill.billId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold", "bg-foreground/[0.06] text-foreground")}>
                {bill.vendorName.split(" ").map((word) => word[0]).slice(0, 2).join("")}
              </span>
              <button onClick={() => onOpen(bill.billId)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium">{bill.vendorName}</span>
                  <StatusPill look={look} className="py-0 text-[11px]" />
                </div>
                <div className="text-sm text-muted-foreground">{formatDollars(bill.amountCents)} · {bill.invoiceNumber}</div>
              </button>
              <button
                onClick={() => setOpenBillId(isOpen ? null : bill.billId)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] transition hover:bg-foreground/10"
                aria-label="Show details"
              >
                <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="pt-3 text-sm">{bill.headline}</p>
                  <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1">{bill.jobSite}</span>
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1">via {bill.receivedVia} · {formatClockTime(bill.receivedAt)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ live intake pipeline

type Lane = "arriving" | "checking" | "booked" | "asking" | "held";

function finalLane(bill: BillSummary): Lane {
  if (bill.status === "held") return "held";
  if (bill.status === "parked") return "asking";
  if (bill.status === "checking") return "checking";
  return "booked";
}

/** Where each bill is at a given tick of the replay. Bill i arrives at tick i. */
function laneAtTick(bill: BillSummary, billIndex: number, tick: number): Lane | null {
  if (tick < billIndex) return null;
  if (tick === billIndex) return "arriving";
  if (tick <= billIndex + TICKS_IN_CHECKING) return "checking";
  return finalLane(bill);
}

function useReplayTick(totalTicks: number, restartKey: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    const interval = setInterval(() => setTick((current) => (current >= totalTicks ? current : current + 1)), TICK_MS);
    return () => clearInterval(interval);
  }, [totalTicks, restartKey]);
  return tick;
}

function LiveIntake({ bills, onOpen }: { bills: BillSummary[]; onOpen: (billId: string) => void }) {
  const [replayCount, setReplayCount] = useState(0);
  const tick = useReplayTick(bills.length + TICKS_IN_CHECKING + 1, replayCount);

  const billsByLane = useMemo(() => {
    const lanes: Record<Lane, BillSummary[]> = { arriving: [], checking: [], booked: [], asking: [], held: [] };
    bills.forEach((bill, index) => {
      const lane = laneAtTick(bill, index, tick);
      if (lane) lanes[lane].unshift(bill);
    });
    return lanes;
  }, [bills, tick]);

  const settledCount = billsByLane.booked.length + billsByLane.asking.length + billsByLane.held.length;

  return (
    <Panel
      title="Live intake · today"
      subtitle="Every bill that arrived this morning, replayed as it was checked."
      action={
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground"><AnimatedNumber value={settledCount} durationSeconds={0.4} className="font-semibold text-foreground" /> of {bills.length} settled</span>
          <button onClick={() => setReplayCount((count) => count + 1)} className={primaryButton("sm")}>
            <RotateCcw className="size-3.5" /> Replay
          </button>
        </div>
      }
    >
      <ArrivalStrip bills={bills} tick={tick} />
      <LayoutGroup>
        <div className="mt-5 grid gap-3 lg:grid-cols-[0.75fr_1fr_1.7fr_1fr_1.25fr]">
          <LaneColumn title="Arriving" icon={Mail} tone="checking" bills={billsByLane.arriving} onOpen={onOpen} />
          <LaneColumn title="Checking" icon={Loader} tone="checking" bills={billsByLane.checking} onOpen={onOpen} spinning />
          <LaneColumn title="Booked" icon={ShieldCheck} tone="cleared" bills={billsByLane.booked} onOpen={onOpen} compact />
          <LaneColumn title="Asking a human" icon={Hand} tone="asking" bills={billsByLane.asking} onOpen={onOpen} showHeadline />
          <LaneColumn title="Held" icon={ShieldAlert} tone="held" bills={billsByLane.held} onOpen={onOpen} showHeadline />
        </div>
      </LayoutGroup>
    </Panel>
  );
}

/** One dot per bill on a 6am→11am axis; colour appears once the bill settles. */
function ArrivalStrip({ bills, tick }: { bills: BillSummary[]; tick: number }) {
  const dayStartMinutes = 6 * 60;
  const dayLengthMinutes = 5 * 60;
  return (
    <div>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {bills.map((bill, index) => {
          const [hours, minutes] = formatClockTime(bill.receivedAt).split(":").map(Number);
          const leftPercent = ((hours * 60 + minutes - dayStartMinutes) / dayLengthMinutes) * 100;
          const lane = laneAtTick(bill, index, tick);
          const dotClass = lane === "held" ? "bg-held" : lane === "asking" ? "bg-asking" : lane === "booked" ? "bg-foreground" : lane ? "bg-data" : "bg-foreground/10";
          return (
            <motion.span
              key={bill.billId}
              className={cn("absolute top-1/2 rounded-full ring-2 ring-card", dotClass)}
              style={{ left: `${leftPercent}%` }}
              initial={false}
              animate={{ width: lane === "held" ? 11 : 8, height: lane === "held" ? 11 : 8, y: "-50%", x: "-50%" }}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        {["6am", "7am", "8am", "9am", "10am", "11am"].map((hourLabel) => <span key={hourLabel}>{hourLabel}</span>)}
      </div>
    </div>
  );
}

interface LaneColumnProps {
  title: string;
  icon: typeof Mail;
  tone: Tone;
  bills: BillSummary[];
  onOpen: (billId: string) => void;
  spinning?: boolean;
  compact?: boolean;
  showHeadline?: boolean;
}

function LaneColumn({ title, icon: Icon, tone, bills, onOpen, spinning, compact, showHeadline }: LaneColumnProps) {
  const toneStyle = TONE_STYLE[tone];
  const laneTotal = bills.reduce((total, bill) => total + bill.amountCents, 0);
  return (
    <div className="flex min-h-[360px] flex-col rounded-2xl bg-background p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className={cn("size-4", toneStyle.text, spinning && bills.length > 0 && "animate-spin")} /> {title}
        </span>
        <span className="flex items-center gap-2">
          {laneTotal > 0 && <span className="text-xs text-muted-foreground">{formatDollars(laneTotal, { compact: true })}</span>}
          <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums">{bills.length}</span>
        </span>
      </div>
      <div className={cn("flex-1 content-start gap-1.5", compact ? "flex flex-wrap" : "flex flex-col")}>
        {bills.map((bill) => (
          <BillChip key={bill.billId} bill={bill} compact={compact} showHeadline={showHeadline} onOpen={() => onOpen(bill.billId)} />
        ))}
      </div>
    </div>
  );
}

function BillChip({ bill, compact, showHeadline, onOpen }: { bill: BillSummary; compact?: boolean; showHeadline?: boolean; onOpen: () => void }) {
  const ReceivedIcon = bill.receivedVia === "email" ? Mail : MonitorSmartphone;
  const tone = PASSPORT_STATUS_LOOK[bill.status].tone;

  if (compact) {
    return (
      <motion.button
        layoutId={bill.billId}
        onClick={onOpen}
        title={`${bill.vendorName} · ${formatDollars(bill.amountCents)}`}
        className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs shadow-[0_1px_2px_rgb(31_36_51/0.06)] hover:shadow-[0_2px_6px_rgb(31_36_51/0.12)]"
      >
        <span className="size-1.5 rounded-full bg-foreground" />
        <span className="max-w-24 truncate">{bill.vendorName.split(" ")[0]}</span>
        <span className="text-muted-foreground">{formatDollars(bill.amountCents, { compact: true })}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      layoutId={bill.billId}
      onClick={onOpen}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("relative w-full overflow-hidden rounded-xl bg-card p-2.5 text-left shadow-[0_1px_2px_rgb(31_36_51/0.06)] hover:shadow-[0_2px_8px_rgb(31_36_51/0.12)]", showHeadline && "pl-3.5")}
    >
      {showHeadline && <span className={cn("absolute inset-y-0 left-0 w-1", tone === "held" ? "bg-held" : "bg-asking")} />}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <ReceivedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{bill.vendorName}</span>
        </span>
        <span className="text-sm font-semibold">{formatDollars(bill.amountCents, { compact: true })}</span>
      </div>
      {showHeadline && bill.headline && <div className="mt-1 text-xs leading-snug text-muted-foreground">{bill.headline}</div>}
    </motion.button>
  );
}
