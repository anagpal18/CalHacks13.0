// STAND-INS for Kenil's Creao agents (services/api/agents): the buyer's contractor agent and the vendor's agent.
// Deterministic so the demo and tests repeat exactly. They take the Rulebook as constraints and output the same
// Offer JSON the real agents will; the gateway checks them the same way.
//   Buyer: the more the evidence holds up (trust), the closer it moves from its opening toward the vendor's ask.
//   It doesn't know the tier caps until the gateway refuses an offer, the way a model might not; then it remembers.
//   Vendor: concedes from its opening toward its walk-away at a pace set by its style, upfront first, net days last.

import { fmtUsd, type Card, type ClaimCheck, type Condition, type Offer, type RiskTier, type Rulebook, type RuleId,
  type SubProfile, type Terms, type TierCaps } from "@terms-room/shared";

export interface AgentView {
  negotiationId: string;
  round: number;
  lastRound: number;
  sub: SubProfile;
  rulebook: Rulebook;
  tier: RiskTier;
  caps: TierCaps;
  trust: number;
  cards: Card[]; // face-up on the table
  checks: ClaimCheck[]; // every verdict so far
  history: Offer[]; // offers the gateway accepted, oldest first
}

export interface ContractorAgent {
  propose(v: AgentView): Offer;
  revise(v: AgentView, rejected: Offer, reasons: string[], ruleIds: RuleId[]): Offer;
  accepts(v: AgentView, offer: Offer): boolean;
}

export interface SubAgent {
  propose(v: AgentView): Offer;
  revise(v: AgentView, rejected: Offer, reasons: string[]): Offer;
  accepts(v: AgentView, offer: Offer): boolean;
}

const r5up = (n: number) => Math.ceil(n / 5 - 1e-9) * 5;
const r5down = (n: number) => Math.floor(n / 5 + 1e-9) * 5;
const k5up = (c: number) => Math.ceil(c / 500_000 - 1e-9) * 500_000;
const k5down = (c: number) => Math.floor(c / 500_000 + 1e-9) * 500_000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lastFrom = (h: Offer[], side: Offer["from"]) => [...h].reverse().find((o) => o.from === side);
const toTerms = (o: Offer): Terms => ({ netDays: o.netDays, upfrontPct: o.depositPct, limitCents: o.limitCents });

export function schedule(upfrontPct: number, netDays: number): Offer["schedule"] {
  return upfrontPct >= 100 ? [] : [{ label: `Balance on net ${netDays}`, pct: 100 - upfrontPct }];
}

export function sameTerms(a: Offer, b: Offer) {
  return a.depositPct === b.depositPct && a.netDays === b.netDays && a.limitCents === b.limitCents &&
    [...a.conditions].sort().join() === [...b.conditions].sort().join();
}

function offer(v: AgentView, from: Offer["from"], t: Terms, conditions: Condition[], citations: Offer["citations"], rationale: string, sharedCards?: Offer["citations"]): Offer {
  return { negotiationId: v.negotiationId, round: v.round, from, depositPct: t.upfrontPct, schedule: schedule(t.upfrontPct, t.netDays),
    netDays: t.netDays, limitCents: t.limitCents, conditions, citations, ...(sharedCards?.length ? { sharedCards } : {}), rationale };
}

const tally = (v: AgentView) => {
  const n = (x: ClaimCheck["verdict"]) => v.checks.filter((c) => c.verdict === x).length;
  return { verified: n("verified"), contradicted: n("contradicted"), unverified: n("unverified") };
};

// ---------------------------------------------------------------- buyer (contractor agent, our side)

export function standinContractor(): ContractorAgent {
  const known: { net?: number; up?: number; limit?: number } = {};
  const evidenceWeight = (v: AgentView) => clamp01((v.trust - 20) / 50);
  const desire = (v: AgentView, V: Terms): Terms => {
    const o = v.rulebook.buyerRules.opening, w = evidenceWeight(v);
    return {
      netDays: r5up(o.netDays - w * (o.netDays - V.netDays)),
      upfrontPct: r5down(o.upfrontPct + w * (V.upfrontPct - o.upfrontPct)),
      limitCents: k5down(o.limitCents + w * (V.limitCents - o.limitCents)),
    };
  };
  const conditions = (v: AgentView): Condition[] => (v.cards.some((c) => c.id.startsWith("pp-lien")) ? ["lien_release"] : []);
  const evidence = (v: AgentView) => {
    const ids = v.tier === "low" ? ["idv-verified", "pp-clean", "rd-score", "rd-limit"] : ["pp-lien", "pp-judgment", "pp-bankruptcy", "rd-dbt", "rd-score", "rd-limit", "reg-young"];
    const cs = v.cards.filter((c) => c.side === "contractor" && ids.some((id) => c.id === id || c.id.startsWith(id + "-"))).flatMap((c) => c.citations);
    return cs.length ? cs : v.cards.filter((c) => c.side === "contractor").slice(0, 1).flatMap((c) => c.citations);
  };
  const clampKnown = (t: Terms): Terms => ({
    netDays: known.net !== undefined ? Math.max(t.netDays, known.net) : t.netDays,
    upfrontPct: known.up !== undefined ? Math.min(t.upfrontPct, known.up) : t.upfrontPct,
    limitCents: known.limit !== undefined ? Math.min(t.limitCents, known.limit) : t.limitCents,
  });
  const why = (v: AgentView, t: Terms) => {
    const k = tally(v);
    return `Trust ${v.trust}: ${k.verified} claims verified, ${k.contradicted} contradicted, ${k.unverified} unverified. We can do net ${t.netDays}, ${t.upfrontPct}% upfront and a ${fmtUsd(t.limitCents)} first order.`;
  };

  return {
    accepts(v, o) {
      const d = desire(v, toTerms(o)), c = v.caps;
      return o.netDays >= Math.max(c.bestNetDays, d.netDays) && o.depositPct <= Math.min(c.maxUpfrontPct, d.upfrontPct) && o.limitCents <= Math.min(c.limitCapCents, d.limitCents);
    },
    propose(v) {
      const theirs = lastFrom(v.history, "sub");
      const o = v.rulebook.buyerRules.opening;
      const V = theirs ? toTerms(theirs) : v.rulebook.vendorRules.opening;
      if (theirs && this.accepts(v, theirs))
        return offer(v, "contractor", V, theirs.conditions.length ? theirs.conditions : conditions(v), evidence(v),
          `The evidence holds up and it's inside the rulebook. Agreed: net ${V.netDays}, ${V.upfrontPct}% upfront, ${fmtUsd(V.limitCents)} first order.`);
      const d = desire(v, V);
      const f = Math.min(1, v.round / 2);
      let t: Terms = {
        netDays: r5up(o.netDays - f * (o.netDays - d.netDays)),
        upfrontPct: r5down(o.upfrontPct + f * (d.upfrontPct - o.upfrontPct)),
        limitCents: k5down(o.limitCents + f * (d.limitCents - o.limitCents)),
      };
      t = { netDays: Math.max(t.netDays, V.netDays), upfrontPct: Math.min(t.upfrontPct, V.upfrontPct), limitCents: Math.min(t.limitCents, V.limitCents) };
      t = clampKnown(t);
      return offer(v, "contractor", t, conditions(v), evidence(v), why(v, t));
    },
    revise(v, rejected, _reasons, ruleIds) {
      if (ruleIds.includes("cap.net")) known.net = v.caps.bestNetDays;
      if (ruleIds.includes("cap.upfront")) known.up = v.caps.maxUpfrontPct;
      if (ruleIds.includes("cap.limit") || ruleIds.includes("anchor")) known.limit = v.caps.limitCapCents;
      const t = clampKnown(toTerms(rejected));
      return { ...offer(v, "contractor", t, rejected.conditions, evidence(v), ""), rationale: `Held to the rulebook: net ${t.netDays}, ${t.upfrontPct}% upfront, ${fmtUsd(t.limitCents)} first order.` };
    },
  };
}

// ---------------------------------------------------------------- vendor (sub agent, their side)

const PACE = { firm: 0.2, balanced: 0.4, flexible: 0.65 } as const;
const PRIORITY = { upfront: 1, limit: 0.6, net: 0.25 }; // what it gives up first

export function standinSub(): SubAgent {
  const utility = (v: AgentView, t: Terms) => {
    const open = v.rulebook.vendorRules.opening;
    return 0.5 * (60 - t.netDays) / 45 + 0.3 * t.upfrontPct / 30 + 0.2 * t.limitCents / Math.max(1, open.limitCents);
  };
  const next = (v: AgentView, cur: Terms): Terms => {
    const w = v.rulebook.vendorRules.walkAway, s = PACE[v.rulebook.vendorRules.style];
    return {
      netDays: Math.min(w.netDays, Math.max(cur.netDays, r5down(cur.netDays + s * PRIORITY.net * (w.netDays - cur.netDays)))),
      upfrontPct: Math.max(w.upfrontPct, Math.min(cur.upfrontPct, r5up(cur.upfrontPct + s * PRIORITY.upfront * (w.upfrontPct - cur.upfrontPct)))),
      limitCents: Math.max(w.limitCents, Math.min(cur.limitCents, k5up(cur.limitCents + s * PRIORITY.limit * (w.limitCents - cur.limitCents)))),
    };
  };
  const withinWalkAway = (v: AgentView, t: Terms) => {
    const w = v.rulebook.vendorRules.walkAway;
    return t.netDays <= w.netDays && t.upfrontPct >= w.upfrontPct && t.limitCents >= w.limitCents;
  };
  const favorable = (v: AgentView) => v.checks.filter((c) => c.verdict === "verified" && !c.topic.match(/^(no_late_payments|utilization|account_age|no_collections)$/)).flatMap((c) => c.citations);
  const shared = (v: AgentView) => v.cards.filter((c) => c.shared).flatMap((c) => c.citations);
  const cites = (v: AgentView) => {
    const f = favorable(v);
    return f.length ? f : v.cards.slice(0, 1).flatMap((c) => c.citations);
  };
  const mine = (v: AgentView) => lastFrom(v.history, "sub");

  return {
    accepts(v, o) {
      const t = toTerms(o);
      if (!withinWalkAway(v, t)) return false;
      if (v.round >= v.lastRound) return true;
      const cur = mine(v) ? toTerms(mine(v)!) : v.rulebook.vendorRules.opening;
      return utility(v, t) >= utility(v, next(v, cur)) - 1e-9;
    },
    propose(v) {
      const theirs = lastFrom(v.history, "contractor");
      const m = mine(v);
      if (theirs && this.accepts(v, theirs))
        return offer(v, "sub", toTerms(theirs), theirs.conditions, cites(v),
          `Net ${theirs.netDays}, ${theirs.depositPct}% upfront and a ${fmtUsd(theirs.limitCents)} first order works for us.${theirs.conditions.includes("lien_release") ? " We'll sign the lien release." : ""}`, shared(v));
      const t = m ? next(v, toTerms(m)) : v.rulebook.vendorRules.opening;
      const k = tally(v);
      const said = m ? `We can move: net ${t.netDays}, ${t.upfrontPct}% upfront, ${fmtUsd(t.limitCents)}.`
        : `Net ${t.netDays}, ${t.upfrontPct}% upfront and a ${fmtUsd(t.limitCents)} first order.`;
      return offer(v, "sub", t, [], cites(v), `${k.verified ? `${k.verified} of our claims checked out. ` : ""}${said}`, shared(v));
    },
    revise(v, rejected, reasons) {
      // Drop whatever the gateway refused and resend with only the facts CRS actually returned.
      return { ...rejected, citations: cites(v), sharedCards: shared(v),
        rationale: `Resending with the facts CRS returned (${reasons.length} problem${reasons.length > 1 ? "s" : ""} fixed).` };
    },
  };
}

/** For the "Make the vendor bluff" control: an offer that cites a value CRS never returned. */
export function bluffOffer(v: AgentView): Offer {
  const ff = v.cards.find((c) => c.id === "ff-score")?.citations[0];
  const fake = ff ? { ...ff, value: "2" } : { product: "fraud_finder" as const, field: "risk.score", value: "2", callId: "00000000-0000-0000-0000-000000000000" };
  return offer(v, "sub", { netDays: 15, upfrontPct: 30, limitCents: v.rulebook.vendorRules.opening.limitCents }, [], [fake],
    "Fraud Finder scored us 2/100, so we should get 30% upfront on net 15.");
}
