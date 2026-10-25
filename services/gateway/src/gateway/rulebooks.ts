// Rule books: one markdown document per seat agent that it reads before signing.
// The fixed part is written by the team (rulebooks/<seat>.md, committed). The learned part comes from AP
// decisions: the orchestrator turns a person's note into one scoped rule (stored in .data, never in git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SEATS, isSeat, type Seat } from "./seats.ts";
import type { DecisionKind, DecisionRole } from "./decisions.ts";

export interface LearnedRule {
  id: string;
  seat: Seat;
  stamp: string;
  scope: string;
  text: string;
  sourceBillId: string;
  byRole?: DecisionRole;
  decision?: DecisionKind;
  createdAt: string;
}

export type RuleChange =
  | { action: "add"; seat: string; stamp: string; scope: string; text: string; sourceBillId: string; byRole?: DecisionRole; decision?: DecisionKind }
  | { action: "replace"; seat: string; ruleId: string; stamp: string; scope: string; text: string; sourceBillId: string; byRole?: DecisionRole; decision?: DecisionKind }
  | { action: "remove"; seat: string; ruleId: string };

export class RuleBookError extends Error {}

const SEAT_LETTER: Record<Seat, string> = { intake: "I", vendor_records: "V", matching: "M" };
const SEAT_TITLE: Record<Seat, string> = { intake: "Intake", vendor_records: "Vendor-Records", matching: "Matching" };
const DECISION_PAST: Record<string, string> = { approve: "approved", reject: "rejected", escalate: "escalated" };
export const MAX_RULE_LENGTH = 300;
export const MAX_RULES_PER_SEAT = 25;

// Identity checks on bank changes and new vendors are the fraud catch. No learned rule may switch them off.
const IDENTITY_STAMPS = new Set(["vendor", "payto", "sender"]);
const LOOSENING = /\b(skip|bypass|ignore|no need|don'?t need|without|waive|trust)\b/i;
const IDENTITY_WORDS = /\b(crs|identity|verif\w*|fraud|bank|account|callback|domain|dkim|dmarc)\b/i;
const EVERYONE = /\b(all|any|every)\s+(vendors?|bills?|suppliers?)\b/i;

export function createRuleBooks(opts: { fixedDir: URL; storePath: string }) {
  const store: { rules: LearnedRule[]; nextNumber: Record<string, number> } = existsSync(opts.storePath)
    ? JSON.parse(readFileSync(opts.storePath, "utf8"))
    : { rules: [], nextNumber: {} };
  const save = () => {
    mkdirSync(dirname(opts.storePath), { recursive: true });
    writeFileSync(opts.storePath, JSON.stringify(store, null, 1));
  };

  function fixedMarkdown(seat: Seat): string {
    try {
      return readFileSync(new URL(`${seat}.md`, opts.fixedDir), "utf8").trim();
    } catch {
      return `# ${SEAT_TITLE[seat]} rule book`;
    }
  }

  function learned(seat: Seat): LearnedRule[] {
    return store.rules.filter((r) => r.seat === seat);
  }

  function render(seat: Seat): string {
    const rules = learned(seat);
    const lines = rules.length
      ? rules.map((r) => `- ${r.id} · ${r.stamp} · ${r.scope}\n  ${r.text}\n  (From ${r.sourceBillId}${r.byRole ? `, ${DECISION_PAST[r.decision ?? ""] ?? "decided"} by the ${r.byRole.replace("_", " ")}` : ""}, ${r.createdAt.slice(0, 10)})`)
      : ["- None yet."];
    return `${fixedMarkdown(seat)}\n\n## Learned from AP decisions\n${lines.join("\n")}\n`;
  }

  function check(seat: string, stamp: string, scope: string, text: string): Seat {
    if (!isSeat(seat)) throw new RuleBookError(`seat must be one of ${Object.keys(SEATS).join(", ")}`);
    if (!SEATS[seat].stamps.includes(stamp)) {
      throw new RuleBookError(`the ${seat} agent does not sign "${stamp}"; it signs ${SEATS[seat].stamps.join(", ")}`);
    }
    const body = `${scope} ${text}`;
    if (!text.trim() || !scope.trim()) throw new RuleBookError("a rule needs a scope and text");
    if (text.length > MAX_RULE_LENGTH) throw new RuleBookError(`keep a rule under ${MAX_RULE_LENGTH} characters`);
    if (IDENTITY_STAMPS.has(stamp) && LOOSENING.test(body) && IDENTITY_WORDS.test(body)) {
      throw new RuleBookError("a rule cannot loosen identity or bank-detail checks; every bank change and new vendor still runs CRS");
    }
    if (EVERYONE.test(scope)) throw new RuleBookError("scope a rule to a vendor, site or PO, not to everyone");
    return seat;
  }

  function apply(change: RuleChange): { rule?: LearnedRule; removed?: LearnedRule } {
    if (change.action === "remove") {
      const i = store.rules.findIndex((r) => r.id === change.ruleId && r.seat === change.seat);
      if (i < 0) throw new RuleBookError(`no rule ${change.ruleId} in the ${change.seat} rule book`);
      const [removed] = store.rules.splice(i, 1);
      save();
      return { removed };
    }
    const seat = check(change.seat, change.stamp, change.scope, change.text);
    const fields = {
      seat,
      stamp: change.stamp,
      scope: change.scope.trim(),
      text: change.text.trim(),
      sourceBillId: change.sourceBillId,
      byRole: change.byRole,
      decision: change.decision,
      createdAt: new Date().toISOString(),
    };
    if (change.action === "replace") {
      const i = store.rules.findIndex((r) => r.id === change.ruleId && r.seat === seat);
      if (i < 0) throw new RuleBookError(`no rule ${change.ruleId} in the ${seat} rule book to replace`);
      store.rules[i] = { ...fields, id: change.ruleId };
      save();
      return { rule: store.rules[i] };
    }
    if (learned(seat).length >= MAX_RULES_PER_SEAT) {
      throw new RuleBookError(`the ${seat} rule book is full (${MAX_RULES_PER_SEAT} rules); replace a rule instead`);
    }
    const number = (store.nextNumber[seat] ?? 0) + 1;
    store.nextNumber[seat] = number;
    const rule = { ...fields, id: `${SEAT_LETTER[seat]}-${number}` };
    store.rules.push(rule);
    save();
    return { rule };
  }

  return { render, learned, apply, all: () => [...store.rules], title: (seat: Seat) => SEAT_TITLE[seat] };
}

export type RuleBooks = ReturnType<typeof createRuleBooks>;

/** Which seat signs a stamp, from the seat permissions. */
export function seatForStamp(stamp: string): Seat | undefined {
  return (Object.keys(SEATS) as Seat[]).find((seat) => SEATS[seat].stamps.includes(stamp));
}
