// What every real-mode agent agrees on. Money is whole US dollars inside real mode; the orchestrator converts to the
// cents the events and the gateway use. A citation is { callId, field, value } copied from the input, and it only
// counts if that field of that logged CRS response holds exactly that value.

import { z } from "zod";
import type { Citation, CrsCallRecord, CrsProduct, Offer } from "@terms-room/shared";
import { resolveField } from "../../negotiation/path.ts";
import { words } from "./llm.ts";

export const citation = z.object({
  callId: z.string().describe("callId of a logged CRS response, copied from the input"),
  field: z.string().describe("field path in that response, copied from the input"),
  value: z.string().describe("the value at that field, copied exactly from the input"),
});
export type AgentCitation = z.infer<typeof citation>;

export const condition = z.enum(["lien_release", "pay_supplier_direct"]);

export const offer = z.object({
  netDays: z.number().int().describe("days after delivery we pay, 15 to 60"),
  upfrontPct: z.number().int().describe("percent paid before delivery, 0 to 30"),
  limit: z.number().int().describe("first-order limit in whole US dollars"),
  conditions: z.array(condition),
});
export type AgentOffer = z.infer<typeof offer>;

/** Asks for max words; only sends back an answer well past it, since plain words ("paid in 30 days") run a little long. */
export const sentence = (max: number) => {
  const hard = Math.ceil(max * 1.4);
  return z.string().min(1).refine((s) => words(s) <= hard, `must be about ${max} words; this is too long`).describe(`one plain sentence, ${max} words or fewer`);
};

/** An agent's private thought for its bubble. Asked for in about 20 words; only a runaway length is sent back, since it decides nothing. */
export const thoughtField = (what: string) =>
  z.string().min(1).refine((s) => words(s) <= 40, "must be about 20 words").describe(`${what}; about 20 words`);

/** Words the UI never shows (the product's own rule: nothing reads as a simulation). */
export const UI_WORDS = /simulat|\bdemo\b|test data/i;
const JARGON = /\bnet[\s-]?\d+\b/i; // "net 30": say "paid in 30 days"

/** How every agent talks, since what they write is shown to people who've never seen trade-credit jargon. */
export const PLAIN_WORDS = `Write for someone who has never seen trade-credit jargon: say "paid in 30 days" (never "net 30"), "10% up front", "a first order up to $75,000", and "risk level" rather than "tier".`;

export const uiWordProblems = (texts: Record<string, string>) => Object.entries(texts).flatMap(([k, t]) => [
  ...(UI_WORDS.test(t) ? [`${k} mentions simulations, demos or test data`] : []),
  ...(JARGON.test(t) ? [`${k} says "${t.match(JARGON)![0]}"; say "paid in N days" instead`] : []),
]);

const productOf = (call: CrsCallRecord): CrsProduct => (call.product === "credit_report" ? "credit_fact" : call.product);

/** Problems with citations: unknown callIds, fields that don't exist, values CRS never returned. */
export function citationProblems(cs: (AgentCitation | null)[], log: CrsCallRecord[], where = "citation"): string[] {
  const out: string[] = [];
  for (const c of cs) {
    if (!c) continue;
    const call = log.find((l) => l.callId === c.callId);
    if (!call) { out.push(`${where} callId ${c.callId} is not a logged CRS response`); continue; }
    const actual = resolveField(call.response, c.field);
    if (actual === undefined) out.push(`${where} field ${c.field} doesn't exist in call ${c.callId}`);
    else if (actual !== c.value) out.push(`${where} ${c.field} is "${actual}" in call ${c.callId}, not "${c.value}"`);
  }
  return out;
}

/** An agent citation as the engine's Citation (with the product, from the log). Call only after citationProblems passed. */
export function fullCitation(c: AgentCitation, log: CrsCallRecord[]): Citation {
  const call = log.find((l) => l.callId === c.callId)!;
  return { product: productOf(call), field: c.field, value: c.value, callId: c.callId };
}

export const agentCitation = (c: Citation): AgentCitation => ({ callId: c.callId, field: c.field, value: c.value });

export const dollars = (cents: number) => Math.round(cents / 100);
export const termsInDollars = (o: Pick<Offer, "netDays" | "depositPct" | "limitCents" | "conditions">): AgentOffer =>
  ({ netDays: o.netDays, upfrontPct: o.depositPct, limit: dollars(o.limitCents), conditions: o.conditions });

/** The gateway's ranges, checked before an offer gets that far. */
export function offerRangeProblems(o: AgentOffer): string[] {
  const out: string[] = [];
  if (o.netDays < 15 || o.netDays > 60) out.push(`netDays ${o.netDays} is outside 15 to 60`);
  if (o.upfrontPct < 0 || o.upfrontPct > 30) out.push(`upfrontPct ${o.upfrontPct} is outside 0 to 30`);
  if (o.limit <= 0) out.push("limit must be above $0");
  return out;
}
