// The Rulebook: what the start page sets and the engine, gateway and agents obey.
// Defaults are the "Demo default" preset; normalizeRulebook clamps anything a client sends to the allowed ranges,
// so the API and the in-browser engine always run the same, valid rules.

import { fmtUsd, type BuyerRules, type CreditFact, type GeneralRules, type RiskTier, type RuleId, type Rulebook, type Scenario,
  type ScenarioId, type Terms, type TierCaps, type VendorExhibit, type VendorRules } from "@terms-room/shared";

export const CREDIT_FACTS: CreditFact[] = ["no_late_payments", "utilization", "account_age", "no_collections"];
export const VENDOR_EXHIBITS: VendorExhibit[] = ["w9", "license", "reference", "credit_facts", "invoices", "bank_letter"];
export const FACT_LABEL: Record<CreditFact, string> = {
  no_late_payments: "no recent late payments", utilization: "credit utilization", account_age: "account age", no_collections: "no collections",
};
export const EXHIBIT_LABEL: Record<VendorExhibit, string> = {
  w9: "W-9", license: "business license", bank_letter: "bank letter", reference: "reference letter", invoices: "past invoices", credit_facts: "credit facts",
};

const K = 100; // cents per dollar

export const DEMO_BUYER: BuyerRules = {
  opening: { netDays: 60, upfrontPct: 0, limitCents: 25_000 * K },
  tiers: {
    low: { bestNetDays: 15, maxUpfrontPct: 20, maxLimitCents: 150_000 * K },
    caution: { bestNetDays: 45, maxUpfrontPct: 0, maxLimitCents: 50_000 * K },
    blocked: { bestNetDays: 60, maxUpfrontPct: 0, maxLimitCents: 0 },
  },
  creditLimitAnchor: { on: true, pct: 80 },
  hardStops: {
    idvFails: { on: true },
    fraudFinder: { on: true, threshold: 80 },
    ofac: { on: true },
    inactive: { on: true },
    registeredDays: { on: true, days: 90 },
    lookAlike: { on: true },
    mismatch: { on: true },
  },
  evidence: { verified: 4, contradicted: 15, unverified: 2 },
  escalate: { fraudAlert: true, noDeal: { on: true, rounds: 4 } },
  approval: { secondApproverAboveCents: 20_000 * K },
};

export const DEMO_VENDOR: VendorRules = {
  opening: { netDays: 15, upfrontPct: 30, limitCents: 150_000 * K },
  walkAway: { netDays: 45, upfrontPct: 0, limitCents: 25_000 * K },
  style: "balanced",
  consent: { allow: true, facts: [...CREDIT_FACTS] },
  exhibits: [...VENDOR_EXHIBITS],
};

export const DEMO_GENERAL: GeneralRules = { maxRounds: 4, speed: 1, narrator: true };

/** Scenario defaults that belong to the story, not to a preset: who shares credit data. The judge always gets to hand in a W-9. */
const SCENARIO_DEFAULTS: Record<ScenarioId, { scenario: Scenario; consent: boolean }> = {
  A: { scenario: { id: "A", owner: "P19", profile: "clean", judgeUpload: true }, consent: true },
  B: { scenario: { id: "B", owner: "P08", profile: "slow_payer", judgeUpload: true }, consent: false },
  C: { scenario: { id: "C", owner: "P12", profile: "look_alike", judgeUpload: true }, consent: false },
  D: { scenario: { id: "D", owner: "P13", profile: "clean", judgeUpload: true }, consent: false },
  E: { scenario: { id: "E", owner: "P01", profile: "clean", judgeUpload: true }, consent: true },
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export type PresetId = "demo" | "strict" | "friendly";

function presetBuyer(p: PresetId): BuyerRules {
  const b = clone(DEMO_BUYER);
  if (p === "strict") {
    b.opening = { netDays: 60, upfrontPct: 0, limitCents: 15_000 * K };
    b.tiers.low = { bestNetDays: 30, maxUpfrontPct: 10, maxLimitCents: 75_000 * K };
    b.tiers.caution = { bestNetDays: 60, maxUpfrontPct: 0, maxLimitCents: 20_000 * K };
    b.creditLimitAnchor = { on: true, pct: 50 };
    b.hardStops.fraudFinder.threshold = 60;
    b.hardStops.registeredDays.days = 365;
    b.evidence = { verified: 3, contradicted: 20, unverified: 4 };
    b.escalate.noDeal.rounds = 3;
    b.approval.secondApproverAboveCents = 10_000 * K;
  }
  if (p === "friendly") {
    b.opening = { netDays: 45, upfrontPct: 5, limitCents: 50_000 * K };
    b.tiers.low = { bestNetDays: 15, maxUpfrontPct: 30, maxLimitCents: 200_000 * K };
    b.tiers.caution = { bestNetDays: 30, maxUpfrontPct: 10, maxLimitCents: 75_000 * K };
    b.creditLimitAnchor = { on: true, pct: 100 };
    b.hardStops.fraudFinder.threshold = 90;
    b.hardStops.registeredDays.days = 30;
    b.evidence = { verified: 6, contradicted: 10, unverified: 1 };
    b.approval.secondApproverAboveCents = 40_000 * K;
  }
  return b;
}

/** A full rulebook for a scenario under a preset. Custom scenario E keeps the owner and profile you pass. */
export function rulebookFor(id: ScenarioId, preset: PresetId = "demo", custom?: Partial<Pick<Scenario, "owner" | "profile">>): Rulebook {
  const d = SCENARIO_DEFAULTS[id];
  const vendor = clone(DEMO_VENDOR);
  vendor.consent.allow = d.consent;
  if (preset === "strict") vendor.style = "firm";
  if (preset === "friendly") vendor.style = "flexible";
  return {
    scenario: { ...d.scenario, ...(id === "E" ? custom : {}) },
    buyerRules: presetBuyer(preset),
    vendorRules: vendor,
    general: { ...DEMO_GENERAL },
    preset,
  };
}

// ---------------------------------------------------------------- validation

const num = (v: unknown, lo: number, hi: number, dflt: number, step = 1) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n / step) * step));
};
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
const OWNERS = ["P01", "P08", "P12", "P13", "P16", "P19"];
const PROFILES = ["clean", "slow_payer", "brand_new", "look_alike", "ofac_hit", "ucc_heavy"] as const;

const terms = (t: Partial<Terms> | undefined, d: Terms): Terms => ({
  netDays: num(t?.netDays, 15, 60, d.netDays, 5),
  upfrontPct: num(t?.upfrontPct, 0, 30, d.upfrontPct, 5),
  limitCents: num(t?.limitCents, 0, 500_000 * K, d.limitCents, 1_000 * K),
});

/** Clamp a rulebook from a client to the ranges the start page offers. Unknown fields are dropped. */
export function normalizeRulebook(input: unknown): Rulebook {
  const r = (input ?? {}) as Partial<Rulebook>;
  const id = (["A", "B", "C", "D", "E"] as const).find((x) => x === r.scenario?.id) ?? "A";
  const base = rulebookFor(id);
  const s = r.scenario ?? base.scenario;
  const scenario: Scenario = {
    id,
    owner: id === "E" && OWNERS.includes(String(s.owner)) ? String(s.owner) : base.scenario.owner,
    profile: id === "E" ? (PROFILES.find((p) => p === s.profile) ?? "clean") : base.scenario.profile,
    judgeUpload: true, // the judge always gets to hand in a document during the duel
  };
  const b = r.buyerRules, db = base.buyerRules;
  const tier = (t: RiskTier) => ({
    bestNetDays: num(b?.tiers?.[t]?.bestNetDays, 15, 60, db.tiers[t].bestNetDays, 5),
    maxUpfrontPct: num(b?.tiers?.[t]?.maxUpfrontPct, 0, 30, db.tiers[t].maxUpfrontPct, 5),
    maxLimitCents: num(b?.tiers?.[t]?.maxLimitCents, 0, 500_000 * K, db.tiers[t].maxLimitCents, 1_000 * K),
  });
  const hs = b?.hardStops, dhs = db.hardStops;
  const general: GeneralRules = {
    maxRounds: num(r.general?.maxRounds, 1, 6, base.general.maxRounds),
    speed: num(r.general?.speed, 1, 3, base.general.speed),
    narrator: bool(r.general?.narrator, base.general.narrator),
  };
  const buyerRules: BuyerRules = {
    opening: terms(b?.opening, db.opening),
    tiers: { low: tier("low"), caution: tier("caution"), blocked: tier("blocked") },
    creditLimitAnchor: { on: bool(b?.creditLimitAnchor?.on, db.creditLimitAnchor.on), pct: num(b?.creditLimitAnchor?.pct, 10, 100, db.creditLimitAnchor.pct, 5) },
    hardStops: {
      idvFails: { on: bool(hs?.idvFails?.on, dhs.idvFails.on) },
      fraudFinder: { on: bool(hs?.fraudFinder?.on, dhs.fraudFinder.on), threshold: num(hs?.fraudFinder?.threshold, 1, 100, dhs.fraudFinder.threshold) },
      ofac: { on: bool(hs?.ofac?.on, dhs.ofac.on) },
      inactive: { on: bool(hs?.inactive?.on, dhs.inactive.on) },
      registeredDays: { on: bool(hs?.registeredDays?.on, dhs.registeredDays.on), days: num(hs?.registeredDays?.days, 1, 3650, dhs.registeredDays.days) },
      lookAlike: { on: bool(hs?.lookAlike?.on, dhs.lookAlike.on) },
      mismatch: { on: bool(hs?.mismatch?.on, dhs.mismatch.on) },
    },
    evidence: {
      verified: num(b?.evidence?.verified, 0, 30, db.evidence.verified),
      contradicted: num(b?.evidence?.contradicted, 0, 50, db.evidence.contradicted),
      unverified: num(b?.evidence?.unverified, 0, 30, db.evidence.unverified),
    },
    escalate: {
      fraudAlert: bool(b?.escalate?.fraudAlert, db.escalate.fraudAlert),
      noDeal: { on: bool(b?.escalate?.noDeal?.on, db.escalate.noDeal.on), rounds: num(b?.escalate?.noDeal?.rounds, 1, 6, db.escalate.noDeal.rounds) },
    },
    approval: { secondApproverAboveCents: num(b?.approval?.secondApproverAboveCents, 0, 500_000 * K, db.approval.secondApproverAboveCents, 1_000 * K) },
  };
  const v = r.vendorRules, dv = base.vendorRules;
  const vendorRules: VendorRules = {
    opening: terms(v?.opening, dv.opening),
    walkAway: terms(v?.walkAway, dv.walkAway),
    style: (["firm", "balanced", "flexible"] as const).find((x) => x === v?.style) ?? dv.style,
    consent: {
      allow: bool(v?.consent?.allow, dv.consent.allow),
      facts: Array.isArray(v?.consent?.facts) ? CREDIT_FACTS.filter((f) => v!.consent!.facts.includes(f)) : dv.consent.facts,
    },
    exhibits: Array.isArray(v?.exhibits) ? VENDOR_EXHIBITS.filter((e) => v!.exhibits.includes(e)) : dv.exhibits,
  };
  return { scenario, buyerRules, vendorRules, general, preset: r.preset ?? "custom" };
}

// ---------------------------------------------------------------- wording

export const TIER_NAME: Record<RiskTier, string> = { low: "Low risk", caution: "Caution", blocked: "Blocked" };
export const tierLine = (rb: Rulebook, t: RiskTier) => {
  const x = rb.buyerRules.tiers[t];
  return `${TIER_NAME[t]}: pay in ${x.bestNetDays} days at the soonest · up to ${x.maxUpfrontPct}% up front · first order up to ${fmtUsd(x.maxLimitCents)}`;
};

/** The rule as the Rulebook prints it, e.g. "Fraud Finder risk ≥ 80 → talks end". */
export function ruleText(id: RuleId, rb: Rulebook): string {
  const b = rb.buyerRules, hs = b.hardStops;
  switch (id) {
    case "stop.idv": return "Identity verification fails → talks end";
    case "stop.fraud_finder": return `Fraud Finder risk ≥ ${hs.fraudFinder.threshold} → talks end`;
    case "stop.ofac": return "OFAC / watch-list hit → talks end";
    case "stop.inactive": return "Business inactive → talks end";
    case "stop.registered": return `Registered less than ${hs.registeredDays.days} days ago → talks end`;
    case "stop.look_alike": return "Look-alike match in Quick Search → talks end";
    case "stop.mismatch": return "Phone, address or EIN mismatch → talks end";
    case "tier.low": return tierLine(rb, "low");
    case "tier.caution": return tierLine(rb, "caution");
    case "tier.blocked": return tierLine(rb, "blocked");
    case "cap.net": return "We never promise to pay sooner than the risk level allows";
    case "cap.upfront": return "We never pay more up front than the risk level allows";
    case "cap.limit": return "Our first order never goes above what the risk level allows";
    case "anchor": return `First order at most ${b.creditLimitAnchor.pct}% of the credit limit CRS recommends`;
    case "escalate.fraud_alert": return "Fraud alert on file → a person decides";
    case "escalate.no_deal": return `No deal after ${b.escalate.noDeal.rounds} rounds → a person decides`;
    case "rounds.max": return `No deal after ${rb.general.maxRounds} rounds → talks end`;
    case "approval.second": return `Up-front payment over ${fmtUsd(b.approval.secondApproverAboveCents)} → a second person approves`;
    case "consent": return "Vendor credit data only with the vendor's signed consent, and only the facts it allows";
    case "evidence": return `Each verdict moves trust: verified +${b.evidence.verified}, contradicted −${b.evidence.contradicted}, unverified −${b.evidence.unverified}`;
  }
}

/** Which hard stops and escalations are switched on, in the order the gateway checks them. */
export function activeRules(rb: Rulebook): RuleId[] {
  const hs = rb.buyerRules.hardStops;
  const out: RuleId[] = [];
  if (hs.idvFails.on) out.push("stop.idv");
  if (hs.fraudFinder.on) out.push("stop.fraud_finder");
  if (hs.ofac.on) out.push("stop.ofac");
  if (hs.inactive.on) out.push("stop.inactive");
  if (hs.registeredDays.on) out.push("stop.registered");
  if (hs.lookAlike.on) out.push("stop.look_alike");
  if (hs.mismatch.on) out.push("stop.mismatch");
  return out;
}

/** The line the transcript prints when a rule decides something, e.g. "Caution tier max upfront 0% → our offer held at 0% (offered 10%)". */
export function appliedText(id: RuleId, rb: Rulebook, x: { tier?: RiskTier; caps?: TierCaps; detail?: string } = {}): string {
  const d = x.detail ? ` (${x.detail.replace(/\.$/, "")})` : "";
  const T = x.tier ? TIER_NAME[x.tier] : "This risk level";
  const c = x.caps;
  switch (id) {
    case "tier.low": case "tier.caution": case "tier.blocked": {
      const t = id.slice(5) as RiskTier, r = rb.buyerRules.tiers[t];
      return `${TIER_NAME[t]} → we pay in ${r.bestNetDays} days at the soonest, up to ${r.maxUpfrontPct}% up front, first order up to ${fmtUsd(r.maxLimitCents)}${d}`;
    }
    case "cap.net": return `${T}: we pay in ${c?.bestNetDays} days at the soonest → our offer held at ${c?.bestNetDays} days${d}`;
    case "cap.upfront": return `${T}: up to ${c?.maxUpfrontPct}% up front → our offer held at ${c?.maxUpfrontPct}%${d}`;
    case "cap.limit": return `${T}: first order up to ${fmtUsd(c?.limitCapCents ?? 0)} → our offer held at ${fmtUsd(c?.limitCapCents ?? 0)}${d}`;
    case "anchor": return c?.anchor
      ? `First order at most ${c.anchor.pct}% of the ${fmtUsd(c.anchor.recommendedCents)} credit limit CRS recommends → capped at ${fmtUsd(c.limitCapCents)}${d}`
      : `${ruleText(id, rb)}${d}`;
    case "consent": return `No signed consent → the vendor's agent can't pull its own credit report, so it shares no credit facts${d}`;
    default: return `${ruleText(id, rb)}${d}`;
  }
}

/** The same rules on another scenario: swap the story (owner, business, judge upload) and that story's consent default. */
export function switchScenario(rb: Rulebook, id: ScenarioId, custom?: Partial<Pick<Scenario, "owner" | "profile">>): Rulebook {
  const d = SCENARIO_DEFAULTS[id];
  const keepCustom = rb.scenario.id === "E" ? { owner: rb.scenario.owner, profile: rb.scenario.profile } : {};
  const scenario: Scenario = id === "E" ? { ...d.scenario, ...keepCustom, ...custom } : { ...d.scenario };
  return { ...rb, scenario, vendorRules: { ...rb.vendorRules, consent: { ...rb.vendorRules.consent, allow: d.consent } } };
}
