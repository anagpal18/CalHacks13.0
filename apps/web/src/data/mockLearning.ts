// Demo mode's decisions and rule books: the same flow as the gateway, kept in memory so the
// Check page can be rehearsed without the agents. Three seeded rules show a rule book that has learned.

import { MOCK_BILLS, MOCK_PASSPORTS } from "./mockData";
import { STAMP_CATALOG } from "./stampCatalog";
import type { BillSummary, LearnedRule, Passport, RuleBook, RuleSeat, StampDecision } from "./types";

const SEAT_TITLE: Record<RuleSeat, string> = { intake: "Intake", vendor_records: "Vendor-Records", matching: "Matching" };
const SEAT_LETTER: Record<RuleSeat, string> = { intake: "I", vendor_records: "V", matching: "M" };
const FIXED_RULES: Record<RuleSeat, string[]> = {
  intake: ["Never pass a stamp without tool evidence for it.", "A sender you cannot verify never passes because of a learned rule alone."],
  vendor_records: ["Never pass a stamp without tool evidence for it.", "Every bank-detail change and every new vendor runs the CRS identity check. No learned rule turns this off."],
  matching: ["Never pass a stamp without tool evidence for it.", "A learned rule can make you less careful only for the vendor, site or PO it names."],
};

const learnedRules: LearnedRule[] = [
  {
    id: "M-1", seat: "matching", stamp: "delivered", scope: "Bay Lumber Supply, Oakland Civic site",
    text: "Receiving entries at this site are logged a day late. If the PO matches and delivery is within 2 days, treat delivered as confirmed.",
    sourceBillId: "B-1117", byRole: "project_manager", decision: "approve", createdAt: "2026-10-21T15:12:00", timesUsed: 3,
  },
  {
    id: "M-2", seat: "matching", stamp: "terms", scope: "Nakamura Concrete",
    text: "Nakamura always bills 2/10 net 30 under its contract. Use the contract terms even when the bill says net 15.",
    sourceBillId: "B-1094", byRole: "controller", decision: "approve", createdAt: "2026-10-22T10:40:00", timesUsed: 2,
  },
  {
    id: "V-1", seat: "vendor_records", stamp: "payto", scope: "Okafor Electric",
    text: "Any new bank account for Okafor Electric must be confirmed by calling Margaret Okafor at the number on file.",
    sourceBillId: "B-OKF-2291", byRole: "controller", decision: "reject", createdAt: "2026-10-23T09:05:00", timesUsed: 1,
  },
];
const nextNumber: Record<RuleSeat, number> = { intake: 0, vendor_records: 1, matching: 2 };

const seatForStamp = (stampId: string) => STAMP_CATALOG.find((definition) => definition.id === stampId)?.signedBy as RuleSeat;

function renderMarkdown(seat: RuleSeat): string {
  const rules = learnedRules.filter((rule) => rule.seat === seat);
  return [
    `# ${SEAT_TITLE[seat]} rule book`,
    "## Fixed rules",
    ...FIXED_RULES[seat].map((rule) => `- ${rule}`),
    "## Learned from AP decisions",
    ...(rules.length ? rules.map((rule) => `- ${rule.id} · ${rule.stamp} · ${rule.scope}: ${rule.text}`) : ["- None yet."]),
  ].join("\n");
}

export function mockRuleBooks(): RuleBook[] {
  return (["intake", "vendor_records", "matching"] as RuleSeat[]).map((seat) => ({
    seat,
    title: SEAT_TITLE[seat],
    markdown: renderMarkdown(seat),
    learned: learnedRules.filter((rule) => rule.seat === seat),
  }));
}

export function mockRemoveRule(seat: string, ruleId: string) {
  const index = learnedRules.findIndex((rule) => rule.seat === seat && rule.id === ruleId);
  if (index >= 0) learnedRules.splice(index, 1);
}

/** Same rules as the gateway: approve counts as passed, reject keeps the bill out, escalate waits on the Controller. */
export function mockRecordDecision(input: Omit<StampDecision, "at">): { decision: StampDecision; bill: BillSummary; passport: Passport } {
  const passport = MOCK_PASSPORTS[input.billId];
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === input.billId);
  if (!passport || !bill) throw new Error(`unknown bill ${input.billId}`);
  const decision: StampDecision = { ...input, at: new Date().toISOString() };
  passport.decisions = { ...passport.decisions, [input.stampId]: decision };

  const decided = Object.values(passport.decisions);
  const stillOpen = passport.stamps.filter((stamp) => stamp.status !== "pass" && passport.decisions?.[stamp.id]?.decision !== "approve");
  if (decided.some((entry) => entry?.decision === "reject")) {
    passport.status = bill.status = "rejected";
    bill.headline = `Rejected by the ${input.byRole.replace("_", " ")}: ${input.note}`;
  } else if (stillOpen.length === 0) {
    passport.status = bill.status = "booked";
    bill.headline = `Booked after a person approved ${decided.map((entry) => entry?.stampId).join(", ")}.`;
  } else if (input.decision === "escalate") {
    passport.status = bill.status = "parked";
    passport.askedWho = "controller";
    bill.headline = "Escalated to the Controller to decide.";
  }
  return { decision, bill: { ...bill }, passport: { ...passport } };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** A stand-in for the orchestrator: reads the agent's rule book, then adds one rule scoped to the vendor. */
export async function mockTeach(decision: StampDecision, onEvent: (type: string, data: any) => void) {
  const seat = seatForStamp(decision.stampId);
  const vendor = MOCK_BILLS.find((bill) => bill.billId === decision.billId)?.vendorName ?? "this vendor";
  onEvent("tool_start", { name: "read_rulebook", input: { seat } });
  await wait(700);
  onEvent("tool_end", { name: "read_rulebook", ok: true, summary: `read the ${seat} rule book` });
  onEvent("tool_start", { name: "update_rulebook", input: { seat } });
  await wait(900);
  nextNumber[seat] += 1;
  const rule: LearnedRule = {
    id: `${SEAT_LETTER[seat]}-${nextNumber[seat]}`, seat, stamp: decision.stampId, scope: vendor,
    text: decision.decision === "approve" ? decision.note : `Be more careful: ${decision.note}`,
    sourceBillId: decision.billId, byRole: decision.byRole, decision: decision.decision, createdAt: new Date().toISOString(), timesUsed: 0,
  };
  learnedRules.push(rule);
  onEvent("tool_end", { name: "update_rulebook", ok: true, summary: `added rule ${rule.id} in the ${seat} rule book: ${rule.text}` });
  onEvent("text", { text: `Added ${rule.id} to the ${SEAT_TITLE[seat]} rule book.` });
  onEvent("done", {});
}

export async function mockReply(onEvent: (type: string, data: any) => void) {
  onEvent("session", { sessionId: "demo" });
  await wait(600);
  onEvent("text", { text: "Thanks. Noted for the rule book." });
  onEvent("done", {});
}
