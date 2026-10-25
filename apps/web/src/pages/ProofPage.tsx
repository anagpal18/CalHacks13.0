// ⑤ Proof: "Does it actually work?"
// One tile per planted problem (green caught / red missed) plus amber false alarms. The headline
// ("38 of 40 caught") is computed from the tiles, never typed. Then an audit trail and the CRS data-use log.

import { motion } from "motion/react";
import { Database, History, Target } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedNumber } from "@/components/visuals/AnimatedNumber";
import { STAMP_ICON } from "@/components/visuals/stampIcons";
import { getAuditTrail, getCrsDataUseLog, getScore } from "@/data/dataSource";
import { STAMP_CATALOG } from "@/data/stampCatalog";
import type { PlantedProblemResult, ProblemKind, StampId } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDollars } from "@/lib/format";
import { TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

const PROBLEM_LABEL: Record<ProblemKind, string> = {
  duplicate: "Duplicates", price_creep: "Price creep", not_delivered: "Billed, not delivered", wrong_terms: "Wrong terms",
  missed_discount: "Missed discount", bank_change_scam: "Bank-change scams", bank_change_after_booking: "Bank changed after booking",
  insider_vendor: "Insider vendor", self_approval: "Self-approval", bank_mismatch: "Bank record mismatch", ghost_vendor: "Ghost vendor",
};

const CAUGHT_BY_LABEL: Record<NonNullable<PlantedProblemResult["caughtBy"]>, string> = {
  ...Object.fromEntries(STAMP_CATALOG.map((definition) => [definition.id, `Stamp ${definition.number} · ${definition.label}`])) as Record<StampId, string>,
  recheck: "Check 13 · Re-check",
  approver: "Check 12 · Approver",
  bank_match: "Check 14 · Bank match",
};

const AUDITABLE_BILLS = [
  { billId: "B-OKF-2291", label: "Okafor Electric · $48,000 bank-change scam" },
  { billId: "B-1043A", label: "Okafor Electric · 1043-A duplicate" },
];

export function ProofPage() {
  const score = useAsyncData(getScore, []);
  if (!score) return <div className="h-[560px] animate-pulse rounded-3xl bg-card/50" />;

  const caught = score.plantedProblems.filter((problem) => problem.outcome === "caught");
  const protectedCents = caught.reduce((total, problem) => total + problem.amountCents, 0);
  const problemKinds = [...new Set(score.plantedProblems.map((problem) => problem.kind))];

  return (
    <div className="space-y-6">
      <section className="grid gap-6 rounded-3xl border border-white/8 bg-card/50 p-8 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Target className="size-4" /> Against the answer key</div>
          <div className="mt-2 text-7xl font-black tracking-tight">
            <AnimatedNumber value={caught.length} className="text-cleared" /> <span className="text-muted-foreground/60">of {score.plantedProblems.length}</span>
          </div>
          <div className="text-2xl font-semibold">planted problems caught</div>
          <div className="mt-6 flex gap-8">
            <MiniStat label="protected" value={formatDollars(protectedCents, { compact: true })} tone="cleared" />
            <MiniStat label="missed" value={String(score.plantedProblems.length - caught.length)} tone="held" />
            <MiniStat label="false alarms" value={String(score.falseAlarms.length)} tone="asking" />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Same seeded week every run. Every decision below has a signed passport behind it.</p>
        </div>

        <div className="space-y-2">
          {problemKinds.map((kind, rowIndex) => (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-48 shrink-0 text-right text-xs text-muted-foreground">{PROBLEM_LABEL[kind]}</span>
              <div className="flex flex-wrap gap-1.5">
                {score.plantedProblems.filter((problem) => problem.kind === kind).map((problem, tileIndex) => (
                  <ProblemTile key={problem.problemId} problem={problem} delay={rowIndex * 0.06 + tileIndex * 0.03} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <span className="w-48 shrink-0 text-right text-xs text-asking">False alarms</span>
            <div className="flex gap-1.5">
              {score.falseAlarms.map((alarm) => (
                <Tooltip key={alarm.billId}>
                  <TooltipTrigger asChild>
                    <span className="size-7 rounded-md border border-asking/50 bg-asking/25" />
                  </TooltipTrigger>
                  <TooltipContent>{alarm.billId}: {alarm.reason}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pl-[204px] pt-3 text-[11px] text-muted-foreground">
            <Legend className="bg-cleared" label="caught" />
            <Legend className="bg-held" label="missed" />
            <Legend className="bg-asking" label="false alarm" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <CaughtByChart problems={caught} />
        <AuditTrail />
      </div>

      <CrsDataUseLog />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "cleared" | "held" | "asking" }) {
  return (
    <div>
      <div className={cn("text-3xl font-extrabold tabular-nums", TONE_STYLE[tone].text)}>{value}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", className)} />{label}</span>;
}

function ProblemTile({ problem, delay }: { problem: PlantedProblemResult; delay: number }) {
  const isCaught = problem.outcome === "caught";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay, type: "spring", stiffness: 400, damping: 20 }}
          className={cn(
            "size-7 cursor-default rounded-md border",
            isCaught ? "border-cleared/50 bg-cleared/30 hover:bg-cleared/60" : "border-held/60 bg-held/40 hover:bg-held/70 shadow-[0_0_12px_-2px_var(--held)]",
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-semibold">{problem.problemId} · {problem.billId} · {formatDollars(problem.amountCents)}</div>
        <div>{isCaught ? `Caught by ${CAUGHT_BY_LABEL[problem.caughtBy!]}` : "Missed"}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function CaughtByChart({ problems }: { problems: PlantedProblemResult[] }) {
  const counts = new Map<string, number>();
  problems.forEach((problem) => counts.set(problem.caughtBy!, (counts.get(problem.caughtBy!) ?? 0) + 1));
  const rows = [...counts.entries()].sort((first, second) => second[1] - first[1]);
  const maxCount = Math.max(...rows.map(([, count]) => count));

  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="mb-4 text-sm font-semibold">Which check caught what</div>
      <div className="space-y-2.5">
        {rows.map(([caughtBy, count], index) => {
          const StampIcon = caughtBy in STAMP_ICON ? STAMP_ICON[caughtBy as StampId] : History;
          return (
            <div key={caughtBy} className="flex items-center gap-3">
              <StampIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="w-44 shrink-0 truncate text-xs">{CAUGHT_BY_LABEL[caughtBy as keyof typeof CAUGHT_BY_LABEL]}</span>
              <div className="h-5 flex-1 rounded-md bg-white/4">
                <motion.div
                  className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-cleared/30 to-cleared/70 pr-2 text-[11px] font-bold"
                  initial={{ width: 0 }}
                  animate={{ width: `${(count / maxCount) * 100}%` }}
                  transition={{ delay: 0.2 + index * 0.05, duration: 0.6 }}
                >
                  {count}
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditTrail() {
  const [billId, setBillId] = useState(AUDITABLE_BILLS[0].billId);
  const events = useAsyncData(() => getAuditTrail(billId), [billId]) ?? [];

  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-checking" /> Audit trail</div>
        <div className="flex gap-1">
          {AUDITABLE_BILLS.map((bill) => (
            <button
              key={bill.billId}
              onClick={() => setBillId(bill.billId)}
              className={cn("rounded-full border px-3 py-1 text-xs transition", bill.billId === billId ? "border-checking bg-checking/12" : "border-white/8 text-muted-foreground hover:text-foreground")}
            >
              {bill.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="relative ml-2 border-l border-white/10">
        {events.map((event, index) => (
          <motion.li
            key={`${billId}-${index}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
            className="relative pb-4 pl-5 last:pb-0"
          >
            <span className={cn("absolute -left-[5px] top-1.5 size-2.5 rounded-full", event.tone === "neutral" ? "bg-white/40" : TONE_STYLE[event.tone].dot)} />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{event.at}</span>
              <span className="text-xs text-muted-foreground">{event.actor}</span>
            </div>
            <div className={cn("text-sm font-semibold", event.tone !== "neutral" && TONE_STYLE[event.tone].text)}>{event.action}</div>
            <div className="text-xs text-muted-foreground">{event.detail}</div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function CrsDataUseLog() {
  const entries = useAsyncData(getCrsDataUseLog, []) ?? [];
  return (
    <div className="rounded-2xl border border-white/8 bg-card/60 p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Database className="size-4 text-checking" /> CRS data-use log</div>
      <p className="mb-4 text-xs text-muted-foreground">Identity data is pulled only for new vendors and bank-detail changes, never on every bill. No credit reports on vendors.</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-start gap-3 rounded-xl border border-white/6 bg-background/50 p-3">
            <span className="font-mono text-[11px] text-muted-foreground">{entry.at}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {entry.product}
                {entry.cached && <span className="rounded bg-white/8 px-1.5 text-[10px] font-normal text-muted-foreground">cached</span>}
              </div>
              <div className="truncate text-xs">{entry.persona}</div>
              <div className="truncate text-xs text-muted-foreground">{entry.purpose}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
