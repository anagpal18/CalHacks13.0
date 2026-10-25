// Evidence drawer for one stamp: what was compared, which source won, and the trust rule used.

import { Crown, PenLine, Scale } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SEAT_LABEL, STAMP_CATALOG } from "@/data/stampCatalog";
import type { Evidence, Stamp } from "@/data/types";
import { STAMP_STATUS_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";

const SOURCE_LABEL: Record<Evidence["source"], string> = {
  invoice: "The bill", email: "Email", vendor_master: "Vendor records", vendor_history: "Vendor history", po: "Purchase order",
  contract: "Contract", receiving: "Receiving log", past_bills: "Past bills", ledger: "Ledger", nessie: "Bank (Nessie)",
  crs: "CRS identity", employees: "Employee records", approval_rules: "Approval rules", callback: "Callback check",
};

export function EvidenceSheet({ stamp, onClose }: { stamp: Stamp | null; onClose: () => void }) {
  const definition = STAMP_CATALOG.find((candidate) => candidate.id === stamp?.id);

  return (
    <Sheet open={stamp !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-white/8 bg-card sm:max-w-lg">
        {stamp && definition && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">Stamp {definition.number}</span>
                <StatusPill look={STAMP_STATUS_LOOK[stamp.status]} />
              </div>
              <SheetTitle className="text-2xl">{definition.label}</SheetTitle>
              <SheetDescription className="text-base text-foreground">{stamp.reason}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">What we compared</h3>
                <div className="space-y-2">
                  {stamp.evidence.map((evidence, index) => {
                    const isWinner = stamp.disagreement?.winner === evidence.source;
                    const isLoser = stamp.disagreement && stamp.disagreement.sources.includes(evidence.source) && !isWinner;
                    return (
                      <div
                        key={index}
                        className={cn(
                          "rounded-xl border p-3",
                          isWinner ? "border-cleared/50 bg-cleared/8" : isLoser ? "border-held/30 bg-held/5" : "border-white/8 bg-background/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{SOURCE_LABEL[evidence.source]}</span>
                          {isWinner && <span className="flex items-center gap-1 text-xs font-semibold text-cleared"><Crown className="size-3.5" /> trusted</span>}
                          {isLoser && <span className="text-xs font-semibold text-held">overruled</span>}
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{evidence.field}</div>
                        <div className="mt-0.5 text-base">{evidence.value}</div>
                        {evidence.ref && <div className="mt-1 font-mono text-[11px] text-muted-foreground/70">ref {evidence.ref}</div>}
                      </div>
                    );
                  })}
                </div>
              </section>

              {stamp.disagreement && (
                <section className={cn("rounded-xl border p-4", TONE_STYLE.asking.border, TONE_STYLE.asking.background)}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-asking"><Scale className="size-4" /> Sources disagreed</div>
                  <p className="mt-2 font-mono text-sm">{stamp.disagreement.rule}</p>
                </section>
              )}

              <section className="flex items-start gap-3 rounded-xl border border-white/8 bg-background/50 p-4 text-sm">
                <PenLine className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <div>Signed by <span className="font-semibold">{SEAT_LABEL[stamp.signedBy]}</span></div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{stamp.signature} · {new Date(stamp.at).toLocaleTimeString()}</div>
                  <div className="mt-1 text-xs text-muted-foreground">The gateway checked this signature and that this agent is allowed to sign this stamp.</div>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
