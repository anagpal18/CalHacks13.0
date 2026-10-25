// VENDOR_STRATEGIST (smart model): the vendor's side. Each turn it may play one exhibit, share credit facts it was
// allowed to pull, and make, accept or walk away from an offer, never conceding past its walk-away terms.

import { z } from "zod";
import type { CrsCallRecord } from "@terms-room/shared";
import { callAgent, type Llm } from "./llm.ts";
import { citation, citationProblems, offer, offerRangeProblems, sentence, thoughtField, uiWordProblems, PLAIN_WORDS, type AgentCitation, type AgentOffer } from "./contracts.ts";

export const vendorTurn = z.object({
  thought: thoughtField("what you privately think this turn: first person, conversational, reacting to the buyer's last move or the newest verdicts"),
  action: z.enum(["offer", "accept", "walk_away"]),
  exhibit_id: z.string().nullable(),
  offer: offer.nullable(),
  argument: sentence(25),
  sharedCreditFacts: z.array(z.string()).describe("fact ids copied from creditFacts"),
  citations: z.array(citation),
});
export type VendorTurn = z.infer<typeof vendorTurn>;

type Terms = Omit<AgentOffer, "conditions">;
export interface VendorInput {
  vendorRules: { opening: Terms; walkAway: Terms; style: string };
  exhibitsAvailable: { id: string; title: string; summary: string }[];
  exhibitsPlayed: { id: string; title: string; round: number }[];
  verdictsSoFar: { claimId: string; claim: string; verdict: string; reason: string }[];
  creditFacts: { fact: string; headline: string; favorable: boolean; citations: AgentCitation[] }[] | null;
  evidence: (AgentCitation & { product: string; fact: string })[];
  lastBuyerOffer: (AgentOffer & { argument: string }) | null;
  round: number;
  maxRounds: number;
  gatewayRejection?: string[];
}

const SYSTEM = `You are the Vendor Strategist. You negotiate payment terms for a subcontractor (the vendor) with Keystone Bay Builders (the buyer). Each turn you may play one exhibit and you make, accept, or walk away from an offer.

Terms: netDays is how many days after delivery the buyer pays (fewer is better for you); upfrontPct is the percent paid before delivery (more is better); limit is the first order's size in whole US dollars (more is better); conditions are only "lien_release" or "pay_supplier_direct".

Rules:
- Round 1 with no lastBuyerOffer: action "offer" with exactly vendorRules.opening and no conditions.
- Never offer worse than vendorRules.walkAway: netDays at most walkAway.netDays, upfrontPct at least walkAway.upfrontPct, limit at least walkAway.limit.
- Concede at the pace of vendorRules.style (firm: small steps, balanced: moderate, flexible: larger). Give up the up-front share first, then the first-order size, and the days until you're paid last.
- accept only a lastBuyerOffer that is within your walk-away terms and no worse than what you could expect next round. walk_away only in the last round, when the buyer stays outside your walk-away terms.
- exhibit_id is one id from exhibitsAvailable that helps your case this round, or null.
- sharedCreditFacts are fact ids copied from creditFacts that help you; empty when creditFacts is null. Never claim credit facts you weren't given.
- citations: at least one, copied exactly ({callId, field, value}) from evidence or creditFacts, backing what you say.
- argument is what you say to the buyer: one sentence, at most 25 words, claiming only what the cited facts show.
- thought is what you're privately thinking, the way a real owner would at a negotiating table: first person, conversational, about 20 words. React to the buyer's last offer or the newest verdicts on your claims, and say what you're going for. Don't repeat the argument.
- If gatewayRejection is present, your last offer was refused for those reasons; fix them.

${PLAIN_WORDS}

Answer by calling the submit_vendor_turn tool exactly once.`;

const same = (a: Terms, b: Terms) => a.netDays === b.netDays && a.upfrontPct === b.upfrontPct && a.limit === b.limit;
const withinWalkAway = (o: Terms, w: Terms) => o.netDays <= w.netDays && o.upfrontPct >= w.upfrontPct && o.limit >= w.limit;

function problems(out: VendorTurn, input: VendorInput, log: CrsCallRecord[]): string[] {
  const p: string[] = [];
  const w = input.vendorRules.walkAway;
  if (input.round === 1 && !input.lastBuyerOffer && !input.gatewayRejection) {
    if (out.action !== "offer" || !out.offer || !same(out.offer, input.vendorRules.opening) || out.offer.conditions.length)
      p.push("round 1 with no buyer offer must be action offer with exactly vendorRules.opening and no conditions");
  }
  if (out.action === "offer") {
    if (!out.offer) p.push("action offer needs an offer");
    else {
      p.push(...offerRangeProblems(out.offer));
      if (!withinWalkAway(out.offer, w)) p.push(`offer concedes past walkAway (net ≤ ${w.netDays}, upfront ≥ ${w.upfrontPct}%, limit ≥ $${w.limit})`);
    }
  }
  if (out.action === "accept") {
    if (!input.lastBuyerOffer) p.push("there is no buyer offer to accept");
    else if (!withinWalkAway(input.lastBuyerOffer, w)) p.push("the buyer's offer is outside walkAway, so it can't be accepted");
  }
  if (out.action !== "walk_away" && !out.citations.length) p.push("an offer or acceptance needs at least one citation");
  if (out.exhibit_id !== null && !input.exhibitsAvailable.some((e) => e.id === out.exhibit_id)) p.push(`exhibit_id ${out.exhibit_id} isn't in exhibitsAvailable`);
  const facts = (input.creditFacts ?? []).map((f) => f.fact);
  const unknown = out.sharedCreditFacts.filter((f) => !facts.includes(f));
  if (unknown.length) p.push(`sharedCreditFacts ${unknown.join(", ")} aren't in creditFacts`);
  p.push(...citationProblems(out.citations, log), ...uiWordProblems({ thought: out.thought, argument: out.argument }));
  return p;
}

export function vendorStrategist(llm: Llm, input: VendorInput, log: CrsCallRecord[]): Promise<VendorTurn> {
  return callAgent(llm, {
    agent: "VENDOR_STRATEGIST", model: "smart", system: SYSTEM,
    tool: { name: "submit_vendor_turn", description: "Submit the vendor's move for this round." },
    schema: vendorTurn, input, check: (out) => problems(out, input, log),
  });
}
