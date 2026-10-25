// The floating input bar on the Check page. The AP manager picks a problem stamp, chooses approve, reject or
// escalate, and says why in their own words. The gateway records the decision (the bill moves on), then the
// orchestrator turns the note into a rule for the agent that owns the stamp. Replies stream in above the bar.

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, BookOpen, Check, CircleAlert, Loader, MessageSquare, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { recordDecision, replyToOrchestrator, teachFromDecision } from "@/data/dataSource";
import { SEAT_LABEL, STAMP_CATALOG } from "@/data/stampCatalog";
import type { BillSummary, DecisionKind, DecisionRole, Stamp, StampDecision, StampId } from "@/data/types";
import { TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

// The site PM decides the stamps about the job itself; anything about who gets paid needs the Controller.
const PM_STAMPS = new Set<StampId>(["order", "delivered", "terms"]);
export const roleForStamp = (stampId: StampId): DecisionRole => (PM_STAMPS.has(stampId) ? "project_manager" : "controller");
const ROLE_LABEL: Record<DecisionRole, string> = { controller: "the Controller", project_manager: "the site PM" };
const SEAT_TITLE = { intake: "Intake", vendor_records: "Vendor-Records", matching: "Matching" } as const;

const DECISION_OPTIONS: { kind: DecisionKind; label: string }[] = [
  { kind: "approve", label: "Approve" },
  { kind: "reject", label: "Reject" },
  { kind: "escalate", label: "Escalate" },
];

const EXAMPLE_NOTES: Record<StampId, string[]> = {
  sender: ["Confirmed with the vendor by phone, at the number on file.", "This vendor's new billing address is real; I checked with them."],
  repeat: ["This is a second delivery, not a duplicate of the earlier bill.", "Same amount every month; it's the rent, not a repeat."],
  vendor: ["New vendor. W-9 and insurance were checked by me.", "This is a known supplier under a new trading name."],
  payto: ["Called the owner at the number on file. The new account is real.", "Do not pay. Nobody at the vendor asked for this change."],
  insider: ["The shared address is a coworking space, not an employee's home.", "This vendor is owned by an employee's relative. Hold it."],
  order: ["The PM agreed the new unit price on Oct 20.", "The extra lines are an approved change order, not on the PO yet."],
  delivered: ["Received Friday. This site logs deliveries a day late.", "Nothing arrived. Do not pay until the PM confirms."],
  terms: ["Use the contract's net 30 for this vendor, not the bill's terms.", "The early-pay discount applies; pay by the 10th."],
};

type FeedLine = { id: number; kind: "you" | "status" | "agent" | "working" | "rule" | "error"; text: string; detail?: string };

interface DecisionDockProps {
  bill: BillSummary;
  /** Problem stamps still waiting on a person, in stamp order. */
  openStamps: Stamp[];
  selectedStampId: StampId | null;
  onSelectStamp: (stampId: StampId) => void;
  /** Called after the gateway records a decision, so the page can reload the passport. */
  onDecided: () => void;
}

export function DecisionDock({ bill, openStamps, selectedStampId, onSelectStamp, onDecided }: DecisionDockProps) {
  const [decisionKind, setDecisionKind] = useState<DecisionKind>("approve");
  const [note, setNote] = useState("");
  const [isBusy, setBusy] = useState(false);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  // Set when the orchestrator answered without writing a rule (usually a question): the bar becomes a reply box.
  const [followUp, setFollowUp] = useState<{ sessionId: string } | null>(null);
  const lineCounter = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A new bill starts a fresh conversation.
  useEffect(() => {
    setFeed([]);
    setFollowUp(null);
  }, [bill.billId]);
  // Once the bill needs nothing more and nobody owes an answer, the replies clear themselves after a while.
  const hasOpenStamps = openStamps.length > 0;
  useEffect(() => {
    if (hasOpenStamps || followUp || isBusy || feed.length === 0) return;
    const timer = setTimeout(() => setFeed([]), 12_000);
    return () => clearTimeout(timer);
  }, [hasOpenStamps, followUp, isBusy, feed.length]);

  const selected = openStamps.find((stamp) => stamp.id === selectedStampId) ?? openStamps[0];
  const definition = STAMP_CATALOG.find((candidate) => candidate.id === selected?.id);
  const agentName = definition ? SEAT_LABEL[definition.signedBy].replace(" agent", "") : "the agent";
  const role = selected ? roleForStamp(selected.id) : "controller";

  const pushLine = (line: Omit<FeedLine, "id">) => {
    const id = lineCounter.current++;
    setFeed((current) => [...current.slice(-4), { ...line, id }]);
    return id;
  };
  const updateLine = (id: number, changes: Partial<FeedLine>) =>
    setFeed((current) => current.map((line) => (line.id === id ? { ...line, ...changes } : line)));

  async function submit() {
    if (!selected || !note.trim() || isBusy) return;
    const input = { billId: bill.billId, stampId: selected.id, decision: decisionKind, byRole: role, note: note.trim() };
    setBusy(true);
    pushLine({ kind: "you", text: note.trim(), detail: `${DECISION_OPTIONS.find((option) => option.kind === decisionKind)?.label} · ${definition?.number} ${definition?.label}` });
    setNote("");

    let recorded: StampDecision;
    try {
      const result = await recordDecision(input);
      recorded = result.decision;
      pushLine({ kind: "status", text: decisionOutcomeLine(result.bill.status, decisionKind) });
      onDecided();
    } catch (error) {
      pushLine({ kind: "error", text: (error as Error).message });
      setBusy(false);
      return;
    }

    // Learning is best-effort: the decision already moved the bill.
    await streamFromOrchestrator(`Updating ${agentName}'s rule book…`, (onEvent) => teachFromDecision(recorded, onEvent));
  }

  /** Answer the orchestrator's question in the same conversation. */
  async function sendReply() {
    if (!followUp || !note.trim() || isBusy) return;
    const message = note.trim();
    setBusy(true);
    pushLine({ kind: "you", text: message, detail: "Reply" });
    setNote("");
    await streamFromOrchestrator("Thinking…", (onEvent) => replyToOrchestrator(message, followUp.sessionId, onEvent));
  }

  // Shows the orchestrator's progress in the feed. When it adds no rule and says why (often a question),
  // the bar stays open as a reply box in the same conversation.
  async function streamFromOrchestrator(workingText: string, run: (onEvent: (type: string, data: any) => void) => Promise<void>) {
    const workingId = pushLine({ kind: "working", text: workingText });
    let ruleAdded = false;
    let lastText = "";
    let sessionId = followUp?.sessionId;
    // The agent whose rule book is being changed, from the tool call (the stamp may already be resolved).
    let bookOwner = agentName;
    try {
      await run((type, data) => {
        if (type === "session" && data?.sessionId) sessionId = data.sessionId;
        if (type === "tool_start" && data?.input?.seat) bookOwner = SEAT_TITLE[data.input.seat as keyof typeof SEAT_TITLE] ?? bookOwner;
        if (type === "tool_start" && data?.name === "read_rulebook") updateLine(workingId, { text: `Reading ${bookOwner}'s rule book…` });
        if (type === "tool_start" && data?.name === "update_rulebook") updateLine(workingId, { text: `Writing a rule for ${bookOwner}…` });
        if (type === "tool_end" && data?.name === "update_rulebook") {
          if (data.ok) {
            ruleAdded = true;
            const match = /rule ([IVM]-\d+)[^:]*: (.*)$/.exec(data.summary ?? "");
            pushLine({ kind: "rule", text: match ? `Rule ${match[1]} added to ${bookOwner}'s rule book` : "Rule book updated", detail: match?.[2] ?? data.summary });
          } else {
            pushLine({ kind: "error", text: `The rule was refused: ${data.summary}` });
          }
        }
        if (type === "text" && data?.text) lastText = data.text;
        if (type === "error") pushLine({ kind: "error", text: data?.message ?? "The orchestrator stopped with an error." });
      });
      if (!ruleAdded && lastText) pushLine({ kind: "agent", text: lastText.replace(/\*\*/g, "") });
      setFollowUp(!ruleAdded && lastText && sessionId ? { sessionId } : null);
    } catch (error) {
      pushLine({ kind: "error", text: (error as Error).message });
    } finally {
      setFeed((current) => current.filter((line) => line.id !== workingId));
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (followUp) sendReply();
      else submit();
    }
  }

  // Grow with the text, up to about five lines.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [note]);

  if (!selected && !followUp && feed.length === 0) return null;
  const isReplying = Boolean(followUp);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[760px] space-y-2">
        {/* Replies, newest at the bottom, like a chat */}
        <AnimatePresence initial={false}>
          {feed.map((line) => (
            <motion.div
              key={line.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className={cn("flex", line.kind === "you" ? "justify-end" : "justify-start")}
            >
              <FeedBubble line={line} onDismiss={() => setFeed((current) => current.filter((entry) => entry.id !== line.id))} />
            </motion.div>
          ))}
        </AnimatePresence>

        {(selected || isReplying) && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[26px] border border-foreground/10 bg-card p-2 shadow-[0_12px_40px_-12px_rgb(31_36_51/0.28),0_2px_6px_rgb(31_36_51/0.06)]"
          >
            {isReplying ? (
              <div className="flex items-center justify-between gap-2 px-2.5 pt-1 pb-1 text-xs text-muted-foreground">
                <span>Replying to the AP desk lead</span>
                <button onClick={() => setFollowUp(null)} className="underline-offset-2 hover:text-foreground hover:underline">
                  {selected ? "Back to decisions" : "Done"}
                </button>
              </div>
            ) : selected && (
            /* Which stamp this is about */
            <div className="flex gap-1.5 overflow-x-auto px-1.5 pt-1 pb-1.5">
              {openStamps.map((stamp) => {
                const stampDefinition = STAMP_CATALOG.find((candidate) => candidate.id === stamp.id)!;
                const tone = TONE_STYLE[stamp.status === "fail" ? "held" : "asking"];
                const isCurrent = stamp.id === selected?.id;
                return (
                  <button
                    key={stamp.id}
                    onClick={() => onSelectStamp(stamp.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      isCurrent ? "border-foreground bg-foreground text-background" : "border-foreground/10 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", tone.dot)} />
                    {stampDefinition.number} {stampDefinition.label}
                    <span className={cn(isCurrent ? "text-background/60" : "text-muted-foreground/70")}>· {SEAT_LABEL[stampDefinition.signedBy].replace(" agent", "")}</span>
                  </button>
                );
              })}
            </div>
            )}

            <div className="relative px-3">
              <textarea
                id="decision-note"
                ref={textareaRef}
                rows={1}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isBusy}
                aria-label={isReplying ? "Reply to the AP desk lead" : `Tell ${agentName} why`}
                className="block w-full resize-none bg-transparent py-2 text-[15px] leading-6 outline-none disabled:opacity-60"
              />
              {!note &&
                (isReplying || !selected ? (
                  <div className="pointer-events-none absolute inset-x-3 top-2 truncate text-[15px] leading-6 text-muted-foreground">Answer the question…</div>
                ) : (
                  <CyclingPlaceholder agentName={agentName} examples={EXAMPLE_NOTES[selected.id]} />
                ))}
            </div>

            <div className="flex items-center justify-between gap-3 px-1.5 pt-1">
              <div className={cn("flex items-center gap-1 rounded-full bg-foreground/[0.05] p-0.5", isReplying && "invisible")}>
                {DECISION_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    onClick={() => setDecisionKind(option.kind)}
                    className={cn(
                      "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      decisionKind === option.kind ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {decisionKind === option.kind && (
                      <motion.span layoutId="decision-pill" className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(31_36_51/0.12)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    <span className="relative">{option.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {!isReplying && <span className="hidden text-xs text-muted-foreground sm:inline">Deciding as {ROLE_LABEL[role]}</span>}
                <button
                  onClick={isReplying ? sendReply : submit}
                  disabled={!note.trim() || isBusy}
                  aria-label={isReplying ? "Send reply" : "Send decision"}
                  className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-25"
                >
                  {isBusy ? <Loader className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function decisionOutcomeLine(status: BillSummary["status"], kind: DecisionKind): string {
  if (status === "booked") return "Recorded. Every problem is resolved, so the bill is booked and goes to Approve & Pay.";
  if (status === "rejected") return "Recorded. The bill is rejected and will not be paid.";
  if (kind === "escalate") return "Recorded. Escalated to the Controller.";
  return "Recorded. Other stamps on this bill still need a decision.";
}

function FeedBubble({ line, onDismiss }: { line: FeedLine; onDismiss: () => void }) {
  if (line.kind === "you") {
    return (
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
        <div className="text-[11px] text-background/60">{line.detail}</div>
        {line.text}
      </div>
    );
  }
  const look = {
    status: { icon: Check, className: "text-foreground" },
    agent: { icon: MessageSquare, className: "text-foreground" },
    working: { icon: Loader, className: "text-muted-foreground" },
    rule: { icon: BookOpen, className: "text-data" },
    error: { icon: CircleAlert, className: "text-held" },
  }[line.kind];
  const Icon = look.icon;
  return (
    <div className="group flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-bl-md border border-foreground/8 bg-card px-4 py-2.5 text-sm shadow-lg">
      <Icon className={cn("mt-0.5 size-4 shrink-0", look.className, line.kind === "working" && "animate-spin")} />
      <div className="min-w-0">
        <div className={cn(line.kind === "error" && "text-held")}>{line.text}</div>
        {line.detail && <div className="mt-0.5 text-[13px] text-muted-foreground">{line.detail}</div>}
        {line.kind === "rule" && (
          <Link to="/proof#rule-books" className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline">See the rule books</Link>
        )}
      </div>
      {line.kind !== "working" && (
        <button onClick={onDismiss} aria-label="Dismiss" className="ml-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Cycles through example notes so the manager knows what kind of "why" helps the agent. */
function CyclingPlaceholder({ agentName, examples }: { agentName: string; examples: string[] }) {
  const prompts = [`Tell ${agentName} why…`, ...examples.map((example) => `e.g. ${example}`)];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    const interval = setInterval(() => setIndex((current) => (current + 1) % prompts.length), 3_200);
    return () => clearInterval(interval);
  }, [agentName, prompts.length]);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-2 overflow-hidden text-[15px] leading-6 text-muted-foreground">
      <AnimatePresence mode="wait">
        <motion.span
          key={`${agentName}-${index}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="block truncate"
        >
          {prompts[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
