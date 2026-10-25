// STAND-IN for Kenil's gateway (services/api/gateway, `POST /gateway/offers`).
// Enforces the buyer's Rulebook in code: citation check against the CRS log, tier caps and the credit-limit anchor
// on our offers, ranges and schedule on every offer, and the hard stops. Every refusal names the rule that made it.

import { fmtUsd, type Card, type CrsCallRecord, type Offer, type RiskTier, type RuleId, type Rulebook, type TierCaps } from "@terms-room/shared";
import { resolveField } from "../path.ts";
import { ruleText } from "../rulebook.ts";

export interface GatewayContext {
  log: CrsCallRecord[];
  tier: RiskTier;
  caps: TierCaps;
  rulebook: Rulebook;
}

export type GatewayVerdict = { ok: true } | { ok: false; reasons: string[]; ruleIds: RuleId[]; details: { ruleId: RuleId; reason: string; short: string }[] };

export interface Gateway {
  check(offer: Offer, ctx: GatewayContext): GatewayVerdict;
}

const PRODUCT_OF_CALL: Record<string, string> = { credit_fact: "credit_report" };

export function standinGateway(): Gateway {
  return {
    check(offer, { log, caps, rulebook }) {
      const reasons: string[] = [];
      const details: { ruleId: RuleId; reason: string; short: string }[] = [];
      const ruled = (ruleId: RuleId, reason: string, short: string) => { reasons.push(reason); details.push({ ruleId, reason, short }); };
      if (!offer.citations.length) reasons.push("Every offer has to cite at least one CRS fact.");
      for (const c of [...offer.citations, ...(offer.sharedCards ?? [])]) {
        const call = log.find((l) => l.callId === c.callId);
        if (!call) { reasons.push(`Cited call ${c.callId.slice(0, 8)} isn't in the CRS log.`); continue; }
        if ((PRODUCT_OF_CALL[c.product] ?? c.product) !== call.product) { reasons.push(`Call ${c.callId.slice(0, 8)} is ${call.product}, not ${c.product}.`); continue; }
        const actual = resolveField(call.response, c.field);
        if (actual === undefined) reasons.push(`${c.field} doesn't exist in call ${c.callId.slice(0, 8)}.`);
        else if (actual !== c.value) reasons.push(`CRS returned ${c.field} = ${actual}, not ${c.value}.`);
      }
      const max = rulebook.general.maxRounds;
      if (offer.round < 1 || offer.round > max) reasons.push(`Round ${offer.round} is outside 1 to ${max}.`);
      if (offer.depositPct < 0 || offer.depositPct > 30) reasons.push("Up front has to be 0 to 30%.");
      if (offer.netDays < 15 || offer.netDays > 60) reasons.push("Payment has to be due in 15 to 60 days.");
      if (offer.limitCents <= 0) reasons.push("The first order has to be above $0.");
      const sum = offer.depositPct + offer.schedule.reduce((s, m) => s + m.pct, 0);
      if (sum !== 100) reasons.push(`Up front plus the rest is ${sum}%, not 100%.`);
      if (offer.from === "contractor") {
        if (offer.netDays < caps.bestNetDays) {
          ruled("cap.net", `At this risk level we pay in ${caps.bestNetDays} days at the soonest. Offered ${offer.netDays} days.`, `offered ${offer.netDays} days`);
        }
        if (offer.depositPct > caps.maxUpfrontPct) {
          ruled("cap.upfront", `At this risk level we pay at most ${caps.maxUpfrontPct}% up front. Offered ${offer.depositPct}%.`, `offered ${offer.depositPct}%`);
        }
        if (offer.limitCents > caps.limitCapCents) {
          const anchored = caps.anchor && caps.anchor.capCents < caps.maxLimitCents;
          ruled(anchored ? "anchor" : "cap.limit", anchored
            ? `The first order can be at most ${caps.anchor!.pct}% of the ${fmtUsd(caps.anchor!.recommendedCents)} credit limit CRS recommends, so ${fmtUsd(caps.limitCapCents)}. Offered ${fmtUsd(offer.limitCents)}.`
            : `At this risk level the first order can be at most ${fmtUsd(caps.limitCapCents)}. Offered ${fmtUsd(offer.limitCents)}.`, `offered ${fmtUsd(offer.limitCents)}`);
        }
      }
      return reasons.length ? { ok: false, reasons, ruleIds: details.map((d) => d.ruleId), details } : { ok: true };
    },
  };
}

// ---------------------------------------------------------------- hard stops and escalation

export interface StopHit { ruleId: RuleId; text: string; detail: string }

const find = (cards: Card[], prefix: string) => cards.find((c) => c.id === prefix || c.id.startsWith(prefix + "-"));
const lastCall = (calls: CrsCallRecord[], p: string) => [...calls].reverse().find((c) => c.product === p);

/** Every switched-on hard stop that the facts so far trigger, in Rulebook order. */
export function hardStops(cards: Card[], calls: CrsCallRecord[], rb: Rulebook): StopHit[] {
  const hs = rb.buyerRules.hardStops;
  const hit = (ruleId: RuleId, detail: string): StopHit => ({ ruleId, text: ruleText(ruleId, rb), detail });
  const out: StopHit[] = [];
  const idv = find(cards, "idv-failed");
  if (hs.idvFails.on && idv) out.push(hit("stop.idv", idv.headline));
  const ff = find(cards, "ff-score");
  const score = ff ? Number(ff.citations[0]?.value) : NaN;
  if (hs.fraudFinder.on && score >= hs.fraudFinder.threshold) out.push(hit("stop.fraud_finder", `Fraud Finder scored ${score}`));
  const ofac = find(cards, "fs-ofac");
  if (hs.ofac.on && ofac) out.push(hit("stop.ofac", ofac.detail));
  const inactive = find(cards, "reg-inactive") ?? find(cards, "fs-inactive");
  if (hs.inactive.on && inactive) out.push(hit("stop.inactive", inactive.headline));
  const reg = lastCall(calls, "biz_registration");
  if (hs.registeredDays.on && reg) {
    const inc = (reg.response as any).results.corporateRegistration.incorporatedDate as string;
    const days = Math.floor((Date.parse(reg.at) - Date.parse(inc)) / 86_400_000);
    if (days < hs.registeredDays.days) out.push(hit("stop.registered", `registered ${days} days ago, on ${inc}`));
  }
  const look = find(cards, "qs-look-alike");
  if (hs.lookAlike.on && look) out.push(hit("stop.look_alike", `${look.citations[0].value.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())}, est. ${look.citations[1].value}`));
  const mismatch = [find(cards, "phone-someone-else"), find(cards, "fs-ein-mismatch"), find(cards, "fs-address-mismatch")].filter((c): c is Card => !!c);
  if (hs.mismatch.on && mismatch.length) out.push(hit("stop.mismatch", mismatch.map((c) => c.headline).join("; ")));
  return out;
}

export function fraudAlert(cards: Card[], calls: CrsCallRecord[]): string | null {
  if (find(cards, "idv-step-up")) return "TransUnion: fraud alert on file (2401). Step-up authentication is recommended, which we can't run here.";
  const fs = (lastCall(calls, "biz_fraud_shields")?.response as any)?.results?.fraudShields;
  if (fs?.businessVictimStatementIndicator) return "Fraud Shields: a victim statement is on file for this business.";
  return null;
}
