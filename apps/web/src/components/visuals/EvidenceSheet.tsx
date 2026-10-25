// Evidence drawer for one stamp: what was compared, where the gateway found each value, which source won,
// the tool calls the agent made, and the exact stamp JSON the gateway signed.

import { Check, ChevronDown, Copy, Crown, FileJson, PenLine, Scale, SearchX, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SEAT_LABEL, STAMP_CATALOG } from "@/data/stampCatalog";
import type { Evidence, EvidenceTrace, Stamp, StampToolCall } from "@/data/types";
import { STAMP_STATUS_LOOK, TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";

export const EVIDENCE_SOURCE_LABEL: Record<Evidence["source"], string> = {
  invoice: "The bill", email: "Email", vendor_master: "Vendor records", vendor_history: "Vendor history", po: "Purchase order",
  contract: "Contract", receiving: "Receiving log", past_bills: "Past bills", ledger: "Ledger", nessie: "Bank (Nessie)",
  crs: "CRS identity", employees: "Employee records", approval_rules: "Approval rules", callback: "Callback check",
};

const TOOL_LABEL: Record<string, string> = {
  inbox: "the inbox files", bill: "the recorded bill", vendors: "the vendor master", payments: "bank payments", po: "the purchase order",
  receiving: "the receiving log", contracts: "the contract", employees: "employee records", crs: "a CRS call", record_bill: "recording the bill",
};

export function EvidenceSheet({ stamp, onClose }: { stamp: Stamp | null; onClose: () => void }) {
  const definition = STAMP_CATALOG.find((candidate) => candidate.id === stamp?.id);

  return (
    <Sheet open={stamp !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-foreground/8 bg-card sm:max-w-lg">
        {stamp && definition && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">Stamp {definition.number}</span>
                <StatusPill look={STAMP_STATUS_LOOK[stamp.status]} />
              </div>
              <SheetTitle className="text-2xl">{definition.label}</SheetTitle>
              <p className="text-sm text-muted-foreground">{definition.question}</p>
              <SheetDescription className="text-base text-foreground">{stamp.reason}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <section>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">What we compared</h3>
                  {stamp.trace && <GroundedCount trace={stamp.trace} />}
                </div>
                <div className="space-y-2">
                  {stamp.evidence.map((evidence, index) => {
                    const isWinner = stamp.disagreement?.winner === evidence.source;
                    const isLoser = stamp.disagreement && stamp.disagreement.sources.includes(evidence.source) && !isWinner;
                    return (
                      <div
                        key={index}
                        className={cn(
                          "rounded-xl border p-3",
                          isWinner ? "border-cleared/50 bg-cleared/8" : isLoser ? "border-held/30 bg-held/5" : "border-foreground/8 bg-background/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{EVIDENCE_SOURCE_LABEL[evidence.source] ?? evidence.source}</span>
                          {isWinner && <span className="flex items-center gap-1 text-xs font-semibold text-cleared"><Crown className="size-3.5" /> trusted</span>}
                          {isLoser && <span className="text-xs font-semibold text-held">overruled</span>}
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{evidence.field}</div>
                        <div className="mt-0.5 text-base">{evidence.value}</div>
                        {evidence.ref && <div className="mt-1 font-mono text-[11px] text-muted-foreground/70">ref {evidence.ref}</div>}
                        {stamp.trace?.[index] && <TraceView trace={stamp.trace[index]} evidence={evidence} />}
                      </div>
                    );
                  })}
                </div>
                {!stamp.trace && (
                  <p className="mt-2 text-xs text-muted-foreground">Source records show for stamps signed through the gateway (Live mode).</p>
                )}
              </section>

              {stamp.disagreement && (
                <section className={cn("rounded-xl border p-4", TONE_STYLE.asking.border, TONE_STYLE.asking.background)}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-asking"><Scale className="size-4" /> Sources disagreed</div>
                  <p className="mt-2 font-mono text-sm">{stamp.disagreement.rule}</p>
                </section>
              )}

              {stamp.toolCalls && stamp.toolCalls.length > 0 && <ToolCalls calls={stamp.toolCalls} agent={SEAT_LABEL[stamp.signedBy]} />}

              <section className="flex items-start gap-3 rounded-xl border border-foreground/8 bg-background/50 p-4 text-sm">
                <PenLine className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div>Signed by <span className="font-semibold">{SEAT_LABEL[stamp.signedBy]}</span></div>
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{stamp.signature} · {new Date(stamp.at).toLocaleTimeString()}</div>
                  {stamp.creaoRunId && <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground/70">Creao run {stamp.creaoRunId}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">The gateway checked this signature and that this agent is allowed to sign this stamp.</div>
                </div>
              </section>

              <SignedJson stamp={stamp} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroundedCount({ trace }: { trace: EvidenceTrace[] }) {
  const found = trace.filter((item) => item.found).length;
  return (
    <span className={cn("text-xs font-semibold", found === trace.length ? "text-approved" : "text-asking")}>
      {found} of {trace.length} found in tool output
    </span>
  );
}

/** Where the gateway found this value: the record it came from, with the cited line marked. */
function TraceView({ trace, evidence }: { trace: EvidenceTrace; evidence: Evidence }) {
  if (!trace.found) {
    return (
      <div className="mt-2 flex items-start gap-1.5 text-xs font-medium text-asking">
        <SearchX className="mt-px size-3.5 shrink-0" /> Not found in any tool output this agent received. The agent stated it without a record behind it.
      </div>
    );
  }
  const source = `Found in ${TOOL_LABEL[trace.tool ?? ""] ?? trace.tool}`;
  if (trace.snippet !== undefined) {
    const at = trace.snippet.indexOf(evidence.value);
    return (
      <Expandable label={source} icon={<Check className="size-3.5" />}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
          {at < 0 ? trace.snippet : (
            <>
              …{trace.snippet.slice(0, at)}
              <mark className="rounded bg-approved/15 px-0.5 text-foreground">{evidence.value}</mark>
              {trace.snippet.slice(at + evidence.value.length)}…
            </>
          )}
        </pre>
      </Expandable>
    );
  }
  return (
    <Expandable label={source} icon={<Check className="size-3.5" />}>
      <JsonBlock value={trace.record} highlightKey={trace.path?.split(".").at(-1)} highlightValue={evidence.value} />
    </Expandable>
  );
}

function Expandable({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1.5 text-xs font-semibold text-approved hover:underline">
        {icon} {label}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-foreground/8 bg-card p-2.5">{children}</div>}
    </div>
  );
}

/** Pretty JSON with the line holding the cited value marked. */
function JsonBlock({ value, highlightKey, highlightValue }: { value: unknown; highlightKey?: string; highlightValue?: string }) {
  const lines = JSON.stringify(value, null, 2).split("\n");
  const isCited = (line: string) =>
    Boolean(highlightKey) && line.trimStart().startsWith(`"${highlightKey}":`) && (!highlightValue || line.includes(highlightValue));
  return (
    <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground">
      {lines.map((line, index) => (
        <div key={index} className={cn(isCited(line) && "-mx-1 rounded bg-approved/15 px-1 font-semibold text-foreground")}>{line}</div>
      ))}
    </pre>
  );
}

function ToolCalls({ calls, agent }: { calls: StampToolCall[]; agent: string }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">What the agent looked up</h3>
      <p className="mb-3 text-xs text-muted-foreground">Every tool call the {agent} made in this run, from the gateway's log.</p>
      <ol className="space-y-1.5">
        {calls.map((call, index) => (
          <li key={index} className="flex items-start gap-2.5 rounded-lg border border-foreground/8 bg-background/50 px-3 py-2 text-xs">
            <Wrench className={cn("mt-px size-3.5 shrink-0", call.outcome === "served" ? "text-muted-foreground" : call.outcome === "denied" ? "text-held" : "text-asking")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{call.tool}</span>
                <span className="break-all font-mono text-muted-foreground">{formatArgs(call.args)}</span>
              </div>
              {call.outcome !== "served" && <div className={cn("mt-0.5", call.outcome === "denied" ? "text-held" : "text-asking")}>{call.outcome === "denied" ? "Refused" : "Failed"}: {call.note}</div>}
              {call.outcome === "served" && call.note && <div className="mt-0.5 text-muted-foreground">{call.note}</div>}
            </div>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{new Date(call.at).toLocaleTimeString()}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const formatArgs = (args: Record<string, unknown>) =>
  Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== "" && !(Array.isArray(value) && !value.length))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`)
    .join(" ") || "(no arguments)";

/** The stamp exactly as the gateway signed it, so anyone can check the signature with the seat's public key. */
function SignedJson({ stamp }: { stamp: Stamp }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { trace: _trace, toolCalls: _toolCalls, ...signed } = stamp;
  const text = JSON.stringify(signed, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="rounded-xl border border-foreground/8 bg-background/50">
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 p-4 text-left text-sm">
        <FileJson className="size-4 text-muted-foreground" />
        <span className="flex-1 font-semibold">Signed stamp (JSON)</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-foreground/8 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">The payload the {SEAT_LABEL[stamp.signedBy]}'s key signed, plus its signature.</span>
            <button onClick={copy} className="flex shrink-0 items-center gap-1 rounded-md border border-foreground/10 px-2 py-0.5 text-xs font-medium hover:border-foreground/25">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg bg-card p-2.5">
            <JsonBlock value={signed} />
          </div>
        </div>
      )}
    </section>
  );
}
