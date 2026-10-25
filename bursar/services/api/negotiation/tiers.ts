// Risk tier and its caps, from the CRS facts on the table and the buyer's Rulebook. Code limits, not prompt suggestions.

import { fmtUsd, type Card, type CrsCallRecord, type RiskTier, type Rulebook, type TierCaps } from "@terms-room/shared";

export const TRUST_START = 50;
export const clampTrust = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const has = (cards: Card[], prefix: string) => cards.some((c) => c.id === prefix || c.id.startsWith(prefix + "-"));
const lastCall = (calls: CrsCallRecord[], p: string) => [...calls].reverse().find((c) => c.product === p);

/** Blocked if nothing can vouch for the business or a stop condition is on file; caution for records, slow pay or a young or medium-risk business. */
export function tierFrom(cards: Card[], calls: CrsCallRecord[]): { tier: RiskTier; reason: string } {
  const blocked: string[] = [];
  if (has(cards, "idv-failed")) blocked.push("identity failed");
  if (has(cards, "qs-look-alike")) blocked.push("look-alike business");
  if (has(cards, "fs-ofac")) blocked.push("OFAC possible match");
  if (has(cards, "reg-inactive") || has(cards, "fs-inactive")) blocked.push("business inactive");
  const rd = (lastCall(calls, "biz_risk_dashboard")?.response as any)?.results;
  if (rd && !rd.intelliscore) blocked.push("no business credit history");
  if (rd?.intelliscore && rd.intelliscore.riskClass.code >= 4) blocked.push(`Intelliscore ${rd.intelliscore.score}, ${rd.intelliscore.riskClass.definition.toLowerCase()} risk`);
  if (blocked.length) return { tier: "blocked", reason: `Blocked: ${blocked.join(", ")}.` };

  const caution: string[] = [];
  const records = cards.filter((c) => c.product === "pitchpoint" && c.tone !== "good");
  if (records.length) caution.push(`PitchPoint ${records.map((c) => c.headline.toLowerCase()).join(" and ")}`);
  if (rd && rd.paymentPerformance.currentDbt > 15) caution.push(`pays ${rd.paymentPerformance.currentDbt} days beyond terms`);
  if (rd && (rd.uccFilings.cautionaryUccIndicator || rd.uccFilings.count >= 8)) caution.push(`${rd.uccFilings.count} UCC filings`);
  if (rd?.intelliscore && rd.intelliscore.riskClass.code === 3) caution.push(`Intelliscore ${rd.intelliscore.score}, medium risk`);
  if (has(cards, "reg-young") || has(cards, "reg-new")) caution.push("registered less than two years ago");
  if (caution.length) return { tier: "caution", reason: `Caution: ${caution.join("; ")}.` };
  return { tier: "low", reason: "Low risk: identity verified, clean records, the business pays on time." };
}

/** The tier's caps, with the credit-limit anchor applied when it's on and Risk Dashboard recommends a limit. */
export function capsFor(tier: RiskTier, rb: Rulebook, calls: CrsCallRecord[]): TierCaps {
  const t = rb.buyerRules.tiers[tier];
  const a = rb.buyerRules.creditLimitAnchor;
  const rec = (lastCall(calls, "biz_risk_dashboard")?.response as any)?.results?.creditLimitRecommendation?.recommendedCreditLimitAmount;
  const anchor = a.on && typeof rec === "number"
    ? { recommendedCents: rec * 100, pct: a.pct, capCents: Math.floor((rec * 100 * a.pct) / 100 / 500_000) * 500_000 }
    : null;
  return { ...t, limitCapCents: anchor ? Math.min(t.maxLimitCents, anchor.capCents) : t.maxLimitCents, anchor };
}

export const capsLine = (c: TierCaps) =>
  `best net ${c.bestNetDays} · max upfront ${c.maxUpfrontPct}% · max limit ${fmtUsd(c.limitCapCents)}`;

export const depositCents = (limitCents: number, pct: number) => Math.round((limitCents * pct) / 100);
export const approversNeeded = (cents: number, rb: Rulebook) => (cents > rb.buyerRules.approval.secondApproverAboveCents ? 2 : 1);
