// ① Inbox: "Bills are coming in."
// The morning replays as a pipeline: each bill arrives, gets checked, then flies into Booked / Asking / Held.
// Counters stay small; the movement and colour carry the message.

import { LayoutGroup, motion } from "motion/react";
import { Mail, MonitorSmartphone, Loader, ShieldCheck, ShieldAlert, Hand, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/visuals/AnimatedNumber";
import { listBills } from "@/data/dataSource";
import type { BillSummary } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatClockTime, formatDollars } from "@/lib/format";
import { PASSPORT_STATUS_LOOK, TONE_STYLE, type Tone } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

const TICK_MS = 380;
const TICKS_IN_CHECKING = 3;

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

export function InboxPage() {
  const bills = useAsyncData(listBills, []) ?? [];
  const [replayCount, setReplayCount] = useState(0);
  const tick = useReplayTick(bills.length + TICKS_IN_CHECKING + 1, replayCount);
  const navigate = useNavigate();

  const billsByLane = useMemo(() => {
    const lanes: Record<Lane, BillSummary[]> = { arriving: [], checking: [], booked: [], asking: [], held: [] };
    bills.forEach((bill, index) => {
      const lane = laneAtTick(bill, index, tick);
      if (lane) lanes[lane].unshift(bill);
    });
    return lanes;
  }, [bills, tick]);

  const settledBills = [...billsByLane.booked, ...billsByLane.asking, ...billsByLane.held];
  const protectedCents = billsByLane.held.reduce((total, bill) => total + bill.amountCents, 0);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-card/40 px-8 py-6">
        <BackgroundBeams className="opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-xl text-lg text-muted-foreground">
            The median company loses <span className="font-semibold text-foreground">1.5%</span> of everything it pays to duplicates and errors.
            Every bill here has to prove itself before we pay it.
          </p>
          <div className="flex gap-8">
            <Counter label="bills checked" value={settledBills.length} tone="checking" />
            <Counter label="problems caught" value={billsByLane.held.length + billsByLane.asking.length} tone="held" />
            <Counter label="protected" value={protectedCents} tone="cleared" format={(cents) => formatDollars(Math.round(cents), { compact: true })} />
          </div>
        </div>
        <ArrivalStrip bills={bills} tick={tick} />
      </section>

      <LayoutGroup>
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1fr_1.7fr_1fr_1.25fr]">
          <LaneColumn title="Arriving" icon={Mail} tone="checking" bills={billsByLane.arriving} onOpen={(id) => navigate(`/check/${id}`)} muted />
          <LaneColumn title="Checking" icon={Loader} tone="checking" bills={billsByLane.checking} onOpen={(id) => navigate(`/check/${id}`)} spinning />
          <LaneColumn title="Booked" icon={ShieldCheck} tone="cleared" bills={billsByLane.booked} onOpen={(id) => navigate(`/check/${id}`)} compact />
          <LaneColumn title="Asking a human" icon={Hand} tone="asking" bills={billsByLane.asking} onOpen={(id) => navigate(`/check/${id}`)} showHeadline />
          <LaneColumn title="Held" icon={ShieldAlert} tone="held" bills={billsByLane.held} onOpen={(id) => navigate(`/check/${id}`)} showHeadline />
        </div>
      </LayoutGroup>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => setReplayCount((count) => count + 1)} className="text-muted-foreground">
          <RotateCcw className="size-4" /> Replay the morning
        </Button>
      </div>
    </div>
  );
}

function Counter({ label, value, tone, format }: { label: string; value: number; tone: Tone; format?: (value: number) => string }) {
  return (
    <div className="text-right">
      <AnimatedNumber value={value} format={format} durationSeconds={0.5} className={cn("block text-3xl font-extrabold tabular-nums", TONE_STYLE[tone].text)} />
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}

/** One dot per bill on a 6am→11am axis, coloured once the bill is settled. */
function ArrivalStrip({ bills, tick }: { bills: BillSummary[]; tick: number }) {
  const dayStartMinutes = 6 * 60;
  const dayLengthMinutes = 5 * 60;
  return (
    <div className="relative mt-6">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        {bills.map((bill, index) => {
          const [hours, minutes] = formatClockTime(bill.receivedAt).split(":").map(Number);
          const leftPercent = ((hours * 60 + minutes - dayStartMinutes) / dayLengthMinutes) * 100;
          const lane = laneAtTick(bill, index, tick);
          const tone: Tone | null = lane === "held" ? "held" : lane === "asking" ? "asking" : lane === "booked" ? "cleared" : lane ? "checking" : null;
          return (
            <motion.span
              key={bill.billId}
              className={cn("absolute top-1/2 rounded-full", tone ? TONE_STYLE[tone].dot : "bg-white/10")}
              style={{ left: `${leftPercent}%` }}
              initial={false}
              animate={{ width: lane === "held" ? 12 : 8, height: lane === "held" ? 12 : 8, y: "-50%", x: "-50%", opacity: lane ? 1 : 0.4 }}
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
  muted?: boolean;
  spinning?: boolean;
  compact?: boolean;
  showHeadline?: boolean;
}

function LaneColumn({ title, icon: Icon, tone, bills, onOpen, muted, spinning, compact, showHeadline }: LaneColumnProps) {
  const toneStyle = TONE_STYLE[tone];
  const laneTotal = bills.reduce((total, bill) => total + bill.amountCents, 0);
  return (
    <div className={cn("flex min-h-[420px] flex-col rounded-2xl border bg-card/40 p-3", muted ? "border-white/6" : toneStyle.border)}>
      <div className="mb-3 flex items-center justify-between px-1">
        <span className={cn("flex items-center gap-2 text-sm font-semibold", toneStyle.text)}>
          <Icon className={cn("size-4", spinning && bills.length > 0 && "animate-spin")} /> {title}
        </span>
        <span className="flex items-center gap-2">
          {laneTotal > 0 && !muted && <span className="text-xs tabular-nums text-muted-foreground">{formatDollars(laneTotal, { compact: true })}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", toneStyle.background, toneStyle.text)}>{bills.length}</span>
        </span>
      </div>
      <div className={cn("flex-1 content-start gap-2", compact ? "flex flex-wrap" : "flex flex-col")}>
        {bills.map((bill) => (
          <BillChip key={bill.billId} bill={bill} compact={compact} showHeadline={showHeadline} onOpen={() => onOpen(bill.billId)} />
        ))}
      </div>
    </div>
  );
}

function BillChip({ bill, compact, showHeadline, onOpen }: { bill: BillSummary; compact?: boolean; showHeadline?: boolean; onOpen: () => void }) {
  const ReceivedIcon = bill.receivedVia === "email" ? Mail : MonitorSmartphone;
  const tone = TONE_STYLE[PASSPORT_STATUS_LOOK[bill.status].tone];

  if (compact) {
    return (
      <motion.button
        layoutId={bill.billId}
        onClick={onOpen}
        title={`${bill.vendorName} · ${formatDollars(bill.amountCents)}`}
        className="flex items-center gap-1.5 rounded-lg border border-cleared/25 bg-cleared/8 px-2 py-1 text-xs hover:border-cleared/60"
      >
        <span className="size-1.5 rounded-full bg-cleared" />
        <span className="max-w-24 truncate">{bill.vendorName.split(" ")[0]}</span>
        <span className="tabular-nums text-muted-foreground">{formatDollars(bill.amountCents, { compact: true })}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      layoutId={bill.billId}
      onClick={onOpen}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("w-full rounded-xl border bg-background/70 p-2.5 text-left hover:bg-background", showHeadline ? tone.border : "border-white/8")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <ReceivedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{bill.vendorName}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatDollars(bill.amountCents, { compact: true })}</span>
      </div>
      {showHeadline && bill.headline && <div className={cn("mt-1 text-xs leading-snug", tone.text)}>{bill.headline}</div>}
    </motion.button>
  );
}
