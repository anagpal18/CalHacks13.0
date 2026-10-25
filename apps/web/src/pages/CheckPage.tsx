// ② Check: "Every bill must prove itself."
// The bill is a passport; 8 stamps slam in one by one. A failed stamp shows one line and opens the evidence.
// Opens on the demo duplicate (1043-A); the left rail switches between the planted bills.

import { AnimatePresence, motion } from "motion/react";
import { BookCheck, Mail, MonitorSmartphone, RotateCcw, ScanFace, ShieldX, Hand } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EvidenceSheet } from "@/components/visuals/EvidenceSheet";
import { StampSeal } from "@/components/visuals/StampSeal";
import { getBillSummary, getPassport, getScore, listBills } from "@/data/dataSource";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { Panel } from "@/components/charts/Panel";
import { STAMP_ICON } from "@/components/visuals/stampIcons";
import { DEMO_FEATURED_BILL_ID } from "@/data/mockData";
import { SEAT_LABEL, STAMP_CATALOG } from "@/data/stampCatalog";
import type { BillSummary, Passport, Stamp } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatClockTime, formatDollars } from "@/lib/format";
import { PASSPORT_STATUS_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { primaryButton } from "@/lib/buttonStyles";
import { cn } from "@/lib/utils";

const STAMP_INTERVAL_MS = 550;

/** How many stamps have landed so far; restarts when the bill or replay key changes. */
function useStampReveal(totalStamps: number, restartKey: string) {
  const [revealedCount, setRevealedCount] = useState(0);
  useEffect(() => {
    setRevealedCount(0);
    const interval = setInterval(() => setRevealedCount((count) => (count >= totalStamps ? count : count + 1)), STAMP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [totalStamps, restartKey]);
  return revealedCount;
}

export function CheckPage() {
  const { billId = DEMO_FEATURED_BILL_ID } = useParams();
  const navigate = useNavigate();
  const [replayCount, setReplayCount] = useState(0);
  const [evidenceStamp, setEvidenceStamp] = useState<Stamp | null>(null);
  const passport = useAsyncData(() => getPassport(billId), [billId]);
  const bill = useAsyncData(() => getBillSummary(billId), [billId]);
  const allBills = useAsyncData(listBills, []) ?? [];
  const score = useAsyncData(getScore, []);
  const revealedCount = useStampReveal(STAMP_CATALOG.length, `${billId}-${replayCount}-${passport ? 1 : 0}`);

  const interestingBills = allBills.filter((candidate) => candidate.headline);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-5">
        <BillRail bills={interestingBills} currentBillId={billId} onPick={(id) => navigate(`/check/${id}`)} />
        <Panel title="Where bills fail" subtitle="Problems caught per stamp this week" className="p-5">
          {score && (
            <HorizontalBars
              labelWidth={110}
              data={STAMP_CATALOG.map((definition) => {
                const count = score.plantedProblems.filter((problem) => problem.caughtBy === definition.id).length;
                return { key: definition.id, label: `${definition.number} ${definition.label}`, value: count, icon: STAMP_ICON[definition.id], highlight: definition.id === "payto", tooltip: `${count} caught by ${definition.label}` };
              })}
            />
          )}
        </Panel>
      </div>

      {passport && bill ? (
        <div className="space-y-5">
          <PassportDocument bill={bill} passport={passport} revealedCount={revealedCount} onOpenEvidence={setEvidenceStamp} />
          <div className="flex justify-center">
            <button onClick={() => setReplayCount((count) => count + 1)} className={primaryButton("sm")}>
              <RotateCcw className="size-3.5" /> Check again
            </button>
          </div>
        </div>
      ) : (
        <div className="h-[560px] animate-pulse rounded-3xl bg-card" />
      )}

      <EvidenceSheet stamp={evidenceStamp} onClose={() => setEvidenceStamp(null)} />
    </div>
  );
}

function BillRail({ bills, currentBillId, onPick }: { bills: BillSummary[]; currentBillId: string; onPick: (billId: string) => void }) {
  return (
    <aside className="space-y-2">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Bills worth a look</div>
      {bills.map((bill) => {
        const look = PASSPORT_STATUS_LOOK[bill.status];
        const tone = TONE_STYLE[look.tone];
        const isCurrent = bill.billId === currentBillId;
        return (
          <button
            key={bill.billId}
            onClick={() => onPick(bill.billId)}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border p-3 pl-4 text-left transition",
              isCurrent ? "border-foreground/40 bg-card shadow-sm" : "border-transparent bg-card hover:border-foreground/15",
            )}
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", tone.dot)} />
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{bill.vendorName}</span>
              <span className="text-sm tabular-nums">{formatDollars(bill.amountCents, { compact: true })}</span>
            </div>
            <div className={cn("mt-0.5 truncate text-xs", tone.text)}>{bill.headline}</div>
          </button>
        );
      })}
    </aside>
  );
}

function PassportDocument({ bill, passport, revealedCount, onOpenEvidence }: { bill: BillSummary; passport: Passport; revealedCount: number; onOpenEvidence: (stamp: Stamp) => void }) {
  const isComplete = revealedCount >= STAMP_CATALOG.length;
  const ReceivedIcon = bill.receivedVia === "email" ? Mail : MonitorSmartphone;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)]">
      {/* Passport header strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-dashed border-foreground/10 bg-foreground/[0.02] px-8 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background"><BookCheck className="size-6" /></span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Bill passport</div>
            <div className="font-mono text-sm">{bill.invoiceNumber}</div>
          </div>
        </div>
        <PassportField label="Vendor" value={bill.vendorName} />
        <PassportField label="Amount" value={formatDollars(bill.amountCents)} large />
        <PassportField label="Job site" value={bill.jobSite} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ReceivedIcon className="size-4" /> via {bill.receivedVia} · {formatClockTime(bill.receivedAt)}
        </div>
      </div>

      {/* Agent lanes: who signs which stamps */}
      <div className="flex flex-wrap justify-center gap-2 px-8 pt-5">
        {(["intake", "vendor_records", "matching"] as const).map((seat) => (
          <span key={seat} className="rounded-full border border-foreground/8 bg-background/50 px-3 py-1 text-xs text-muted-foreground">
            {SEAT_LABEL[seat]} signs {STAMP_CATALOG.filter((definition) => definition.signedBy === seat).map((definition) => definition.number).join(", ")}
          </span>
        ))}
      </div>

      {/* The 8 stamps */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-8 py-8 sm:grid-cols-4">
        {STAMP_CATALOG.map((definition, index) => {
          const stamp = passport.stamps.find((candidate) => candidate.id === definition.id)!;
          return (
            <StampSeal
              key={definition.id}
              definition={definition}
              stamp={stamp}
              isRevealed={index < revealedCount}
              isChecking={index === revealedCount}
              onOpenEvidence={() => onOpenEvidence(stamp)}
            />
          );
        })}
      </div>

      <AnimatePresence>{isComplete && <PassportVerdict passport={passport} crsPersonaId={bill.crsPersonaId} />}</AnimatePresence>
    </div>
  );
}

function PassportField({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", large ? "text-2xl tabular-nums" : "text-base")}>{value}</div>
    </div>
  );
}

function PassportVerdict({ passport, crsPersonaId }: { passport: Passport; crsPersonaId?: string }) {
  const failedStamps = passport.stamps.filter((stamp) => stamp.status === "fail");
  const askingStamps = passport.stamps.filter((stamp) => stamp.status === "ask_human");
  const verdict =
    failedStamps.length > 0
      ? { tone: TONE_STYLE.held, icon: ShieldX, word: "Held", line: `${failedStamps.length} of 8 stamps failed. The gateway refused to book it.`, footer: `${formatDollars(passport.amountCents)} protected` }
      : askingStamps.length > 0
        ? { tone: TONE_STYLE.asking, icon: Hand, word: "Asking a human", line: "Parked until the site PM confirms delivery.", footer: "Nothing booked yet" }
        : { tone: TONE_STYLE.cleared, icon: BookCheck, word: "Booked", line: "All 8 stamps signed. Debit Expense, credit Accounts Payable.", footer: "Ready for the next payment run" };
  const Icon = verdict.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn("flex flex-wrap items-center justify-between gap-4 border-t px-8 py-5", verdict.tone.border, verdict.tone.background)}
    >
      <div className="flex items-center gap-4">
        <Icon className={cn("size-10", verdict.tone.text)} />
        <div>
          <div className={cn("text-3xl font-black uppercase tracking-tight", verdict.tone.text)}>{verdict.word}</div>
          <div className="text-sm">{verdict.line}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className={cn("text-xl font-bold", verdict.tone.text)}>{verdict.footer}</div>
        {crsPersonaId && (
          <Link to={`/verify/${crsPersonaId}`} className={primaryButton("md")}><ScanFace className="size-4" /> See who asked</Link>
        )}
      </div>
    </motion.div>
  );
}
