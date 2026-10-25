// BUYER_NEGOTIATOR (smart model): Keystone Bay Builders' side. Counters, accepts, ends talks or hands the deal to a
// person, strictly inside the tier's limits (the credit-limit anchor included). Blocked always ends talks.

import { z } from "zod";
import type { CrsCallRecord, RiskTier } from "@terms-room/shared";
import { callAgent, type Llm } from "./llm.ts";
import { citation, citationProblems, offer, offerRangeProblems, sentence, thoughtField, uiWordProblems, PLAIN_WORDS, type AgentCitation, type AgentOffer } from "./contracts.ts";

export const buyerTurn = z.object({
  thought: thoughtField("what you privately think this turn: first person, conversational, reacting to the vendor's last move or the newest verdicts"),
  action: z.enum(["counter", "accept", "end_talks", "escalate"]),
  offer: offer.nullable(),
  request_checks: z.array(z.string()).describe("CRS products copied from availableChecks, or empty"),
  argument: sentence(25),
  citations: z.array(citation),
});
export type BuyerTurn = z.infer<typeof buyerTurn>;

export interface Limits { bestNetDays: number; maxUpfrontPct: number; maxLimit: number }
export interface BuyerInput {
  buyerRules: {
    opening: Omit<AgentOffer, "conditions">;
    tierLimits: Record<RiskTier, Limits>;
    creditCap: { anchorOn: boolean; anchorPct: number };
    evidenceWeights: { verified: number; contradicted: number; unverified: number };
    secondApproverAbove: number;
  };
  tier: RiskTier;
  tierReasons: string[];
  limits: Limits;
  evidence: (AgentCitation & { product: string; fact: string })[];
  recommendedCreditLimit: { amount: number; citation: AgentCitation } | null;
  availableChecks: string[];
  lastVendorOffer: (AgentOffer & { argument: string }) | null;
  history: { round: number; from: "vendor" | "buyer"; netDays: number; upfrontPct: number; limit: number }[];
  round: number;
  maxRounds: number;
  gatewayRejection?: string[];
}

const SYSTEM = `You are the Buyer Negotiator for Keystone Bay Builders, a general contractor setting payment terms with a vendor. You protect the company's cash and stay strictly inside its rulebook.

Terms: netDays is how many days after delivery we pay (more is better for us); upfrontPct is the percent we pay before delivery (less is better); limit is the first order's size in whole US dollars; conditions are only "lien_release" or "pay_supplier_direct" (ask for lien_release when liens are on file).

Hard limits for the current tier are in limits and already include the credit-limit anchor: netDays at least limits.bestNetDays, upfrontPct at most limits.maxUpfrontPct, limit at most limits.maxLimit. Never cross them, in a counter or by accepting.

Rules:
- tier "blocked": action "end_talks", offer null.
- Open near buyerRules.opening and move toward the vendor only as far as the evidence supports. evidenceWeights are the trust points one verdict of each kind moves: a weight per verdict, not a count of claims. Verified evidence earns movement; contradicted evidence costs a lot.
- accept only a lastVendorOffer that is inside the limits; otherwise counter. escalate when a person has to decide (a fraud alert, or no deal in the final round). end_talks when the evidence shows fraud.
- request_checks: CRS products from availableChecks you still need, or empty.
- citations: at least one for a counter or an accept, copied exactly ({callId, field, value}) from evidence.
- argument is what you say to the vendor: one sentence, at most 25 words, grounded in the cited facts.
- thought is what you're privately thinking, the way a real controller would at a negotiating table: first person, conversational, about 20 words. React to the vendor's last offer or the newest verdicts, and say what you're protecting. Don't repeat the argument.
- If gatewayRejection is present, your last offer was refused for those reasons; fix them.

${PLAIN_WORDS}

Answer by calling the submit_buyer_turn tool exactly once.`;

const overLimits = (o: Omit<AgentOffer, "conditions">, l: Limits) => [
  ...(o.netDays < l.bestNetDays ? [`netDays ${o.netDays} is below the tier's best ${l.bestNetDays}`] : []),
  ...(o.upfrontPct > l.maxUpfrontPct ? [`upfrontPct ${o.upfrontPct} is above the tier's max ${l.maxUpfrontPct}`] : []),
  ...(o.limit > l.maxLimit ? [`limit $${o.limit} is above the cap $${l.maxLimit}`] : []),
];

function problems(out: BuyerTurn, input: BuyerInput, log: CrsCallRecord[]): string[] {
  const p: string[] = [];
  if (input.tier === "blocked" && out.action !== "end_talks") p.push("tier is blocked, so the action must be end_talks");
  if (out.action === "counter") {
    if (!out.offer) p.push("action counter needs an offer");
    else p.push(...offerRangeProblems(out.offer), ...overLimits(out.offer, input.limits));
  }
  if (out.action === "accept") {
    if (!input.lastVendorOffer) p.push("there is no vendor offer to accept");
    else p.push(...overLimits(input.lastVendorOffer, input.limits).map((x) => `can't accept: ${x}`));
  }
  if ((out.action === "counter" || out.action === "accept") && !out.citations.length) p.push("a counter or acceptance needs at least one citation");
  const unknown = out.request_checks.filter((c) => !input.availableChecks.includes(c));
  if (unknown.length) p.push(`request_checks ${unknown.join(", ")} aren't in availableChecks`);
  p.push(...citationProblems(out.citations, log), ...uiWordProblems({ thought: out.thought, argument: out.argument }));
  return p;
}

// ---------------------------------------------------------------- thinking aloud while CRS cross-examines

export const examLines = z.object({ lines: z.array(z.object({ claimId: z.string(), thought: thoughtField("what you're thinking as this claim goes to CRS") })) });
export type ExamLines = z.infer<typeof examLines>;

export interface ExamInput {
  vendor: { owner: string; business: string };
  exhibit: { title: string; handedInBy: "the vendor" | "the judge" };
  claims: { claimId: string; claim: string; checks: string[] }[];
}

const EXAM_SYSTEM = `You are the buyer's agent for Keystone Bay Builders, thinking aloud while you cross-examine a vendor's claims against CRS credit data before extending payment terms.

For each claim, write one line of what you're thinking as you send it to the listed checks: first person, conversational, specific to that claim and to what those checks can show. About 15 words. Don't predict the result and don't invent facts. Vary how each line starts; never reuse a phrase.

${PLAIN_WORDS}

Answer with the think_aloud tool: one line per claimId.`;

/** The buyer agent's running commentary as each claim goes to CRS (fast model; it never decides anything). */
export function crossExamLines(llm: Llm, input: ExamInput): Promise<ExamLines> {
  return callAgent(llm, {
    agent: "BUYER_NEGOTIATOR", model: "fast", system: EXAM_SYSTEM,
    tool: { name: "think_aloud", description: "Say what you're thinking as each claim goes to CRS." },
    schema: examLines, input, maxTokens: 1024,
    check: (out) => {
      const want = input.claims.map((c) => c.claimId), got = out.lines.map((l) => l.claimId);
      return [
        ...want.filter((id) => !got.includes(id)).map((id) => `no line for ${id}`),
        ...got.filter((id, i) => !want.includes(id) || got.indexOf(id) !== i).map((id) => `unexpected or repeated line for ${id}`),
        ...uiWordProblems(Object.fromEntries(out.lines.map((l) => [l.claimId, l.thought]))),
      ];
    },
  });
}

export function buyerNegotiator(llm: Llm, input: BuyerInput, log: CrsCallRecord[]): Promise<BuyerTurn> {
  return callAgent(llm, {
    agent: "BUYER_NEGOTIATOR", model: "smart", system: SYSTEM,
    tool: { name: "submit_buyer_turn", description: "Submit the buyer's move for this round." },
    schema: buyerTurn, input, check: (out) => problems(out, input, log),
  });
}
