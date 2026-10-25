import { describe, expect, it } from "vitest";
import { maskDeep, type DealEvent, type Rulebook } from "@terms-room/shared";
import { approveDeal, bluff, runNegotiation, type Negotiation } from "./engine.ts";
import { normalizeRulebook, rulebookFor } from "./rulebook.ts";
import { resolveField } from "./path.ts";
import fixtures from "./fixtures/crs_fixtures.json";

const clock = () => new Date("2026-10-24T20:00:00Z");
const run = (rb: Rulebook, judge?: Parameters<typeof runNegotiation>[1] extends infer O ? O extends { judge?: infer J } ? J : never : never) =>
  runNegotiation(rb, { now: clock, negotiationId: `neg_test_${rb.scenario.id}`, judge });
const closed = (n: Negotiation) => n.events.find((e): e is Extract<DealEvent, { type: "deal_closed" }> => e.type === "deal_closed");
const rules = (n: Negotiation) => n.events.flatMap((e) => (e.type === "rule_applied" ? [e.ruleId] : []));
const verdicts = (n: Negotiation, topic: string) => n.checks.filter((c) => c.topic === topic).map((c) => c.verdict);
const edit = (rb: Rulebook, f: (r: Rulebook) => void) => { const c = structuredClone(rb); f(c); return c; };

describe("scenarios A to D land on their expected outcomes with the Demo default preset", () => {
  it("A Nakamura Electric (P19, clean): net 15", async () => {
    const n = await run(rulebookFor("A"));
    const d = closed(n)!;
    expect(n.deal.status).toBe("agreed");
    expect(n.deal.riskTier).toBe("low");
    expect([d.terms.netDays, d.terms.depositPct, d.terms.limitCents]).toEqual([15, 20, 12_000_000]);
    expect(rules(n)).toEqual(expect.arrayContaining(["tier.low", "anchor", "approval.second"]));
    expect(n.checks.every((c) => c.verdict === "verified")).toBe(true);
  });

  it("B Venkatesan Builders (P08, lien + judgment, slow payer): about net 45, 0% upfront", async () => {
    const n = await run(rulebookFor("B"));
    const d = closed(n)!;
    expect(n.deal.riskTier).toBe("caution");
    expect(d.terms.depositPct).toBe(0);
    expect(d.terms.netDays).toBeGreaterThanOrEqual(40);
    expect(d.terms.netDays).toBeLessThanOrEqual(50);
    expect(verdicts(n, "records")).toEqual(["contradicted"]);
    expect(verdicts(n, "pays_on_time")).toEqual(["contradicted"]);
    // The gateway, not the agent, holds the caution caps.
    const refused = n.events.filter((e) => e.type === "offer_rejected");
    expect(refused.length).toBeGreaterThan(0);
    expect(rules(n)).toEqual(expect.arrayContaining(["cap.upfront", "cap.net"]));
    expect(n.calls.map((c) => c.product)).not.toContain("credit_report"); // no consent by default
  });

  it("C “Okafor Electric Supply” look-alike (P12): talks end", async () => {
    const n = await run(rulebookFor("C"));
    expect(n.deal.status).toBe("ended");
    expect(rules(n)).toEqual(expect.arrayContaining(["stop.look_alike", "stop.mismatch"]));
    expect(verdicts(n, "company")).toEqual(["contradicted"]);
    expect(n.deal.rounds).toHaveLength(0);
  });

  it("D the judge's doctored W-9 (P13): talks end, red verdict", async () => {
    const n = await run(rulebookFor("D"), async (req) => ({ ...req.draft, fileName: "w9-doctored.pdf" }));
    expect(n.deal.status).toBe("ended");
    expect(n.events.some((e) => e.type === "upload_requested")).toBe(true);
    const w9 = n.exhibits.find((x) => x.kind === "w9")!;
    expect(w9.from).toBe("judge");
    expect(verdicts(n, "ein")).toEqual(["contradicted"]);
    expect(rules(n)).toEqual(expect.arrayContaining(["stop.fraud_finder", "stop.mismatch"]));
  });
});

describe("changing one rule changes the outcome, and the transcript names it", () => {
  it("A with the low tier capped at 10% upfront closes at 10%", async () => {
    const n = await run(edit(rulebookFor("A"), (r) => { r.buyerRules.tiers.low.maxUpfrontPct = 10; }));
    expect(closed(n)!.terms.depositPct).toBe(10);
    expect(rules(n)).toContain("cap.upfront");
  });

  it("D with the Fraud Finder threshold at 90 no longer ends on Fraud Finder", async () => {
    const base = await run(rulebookFor("D"));
    const n = await run(edit(rulebookFor("D"), (r) => { r.buyerRules.hardStops.fraudFinder.threshold = 90; }));
    expect(rules(base)).toContain("stop.fraud_finder");
    expect(rules(n)).not.toContain("stop.fraud_finder");
    expect(n.events.find((e) => e.type === "rule_applied" && e.ruleId === "stop.idv")).toBeTruthy();
  });

  it("D with an honest W-9 from the judge: the EIN checks out", async () => {
    const n = await run(rulebookFor("D"), async () => ({ legalName: "BRENNAN SITE SERVICES LLC", ein: "92-4471830", address: "9021 Kingston Pike Ste 4, Knoxville, TN 37923", signer: "KAYLA BRENNAN" }));
    expect(verdicts(n, "ein")).toEqual(["verified"]);
    expect(verdicts(n, "legal_name")).toEqual(["verified"]);
  });

  it("B under Strict buyer escalates after 3 rounds", async () => {
    const n = await run(rulebookFor("B", "strict"));
    expect(n.deal.status).toBe("escalated");
    expect(rules(n)).toContain("escalate.no_deal");
  });

  it("A with the credit-limit anchor at 50% of Risk Dashboard's $150,000 closes at a $75,000 limit", async () => {
    const n = await run(edit(rulebookFor("A"), (r) => { r.buyerRules.creditLimitAnchor.pct = 50; }));
    expect(closed(n)!.terms.limitCents).toBe(7_500_000);
    expect(rules(n)).toContain("anchor");
  });

  it("a custom fraud-alert owner (P16) escalates; with that rule off, talks go on", async () => {
    const e = await run(rulebookFor("E", "demo", { owner: "P16", profile: "clean" }));
    expect(e.deal.status).toBe("escalated");
    const off = await run(edit(rulebookFor("E", "demo", { owner: "P16", profile: "clean" }), (r) => { r.buyerRules.escalate.fraudAlert = false; }));
    expect(off.deal.status).not.toBe("escalated");
  });

  it.each(["brand_new", "look_alike", "ofac_hit"] as const)("custom %s profile ends talks on its stop", async (profile) => {
    const n = await run(rulebookFor("E", "demo", { owner: "P19", profile }));
    expect(n.deal.status).toBe("ended");
    expect(rules(n)).toContain(profile === "brand_new" ? "stop.registered" : profile === "look_alike" ? "stop.look_alike" : "stop.ofac");
  });
});

describe("consent, data and the gateway", () => {
  it("shares only the credit facts consent allows, and the report stays face down", async () => {
    const n = await run(edit(rulebookFor("A"), (r) => { r.vendorRules.consent.facts = ["account_age"]; }));
    const facts = n.checks.filter((c) => ["no_late_payments", "utilization", "account_age", "no_collections"].includes(c.topic));
    expect(facts.map((c) => c.topic)).toEqual(["account_age"]);
    const report = n.events.find((e) => e.type === "crs_call" && e.entry.product === "credit_report");
    expect(report && report.type === "crs_call" && report.entry.response).toBeNull();
  });

  it("people calls are live CRS data; business calls are tagged as simulated internally", async () => {
    const n = await run(rulebookFor("A"));
    for (const c of n.calls) {
      if (c.product.startsWith("biz_")) expect(c.source).toBe("simulated");
      else expect(c.source).toBe("live");
    }
  });

  it("every cited value resolves against the logged response", async () => {
    for (const id of ["A", "B"] as const) {
      const n = await run(rulebookFor(id));
      for (const o of n.deal.rounds) for (const c of [...o.citations, ...(o.sharedCards ?? [])]) {
        const call = n.calls.find((x) => x.callId === c.callId)!;
        expect(resolveField(call.response, c.field)).toBe(c.value);
      }
    }
  });

  it("the gateway refuses a bluff that cites a value CRS never returned", async () => {
    const n = await run(rulebookFor("A"));
    const e = bluff(n);
    expect(e.type).toBe("offer_rejected");
    expect(e.type === "offer_rejected" && e.reasons.join(" ")).toMatch(/CRS returned risk\.score = 9, not 2/);
  });

  it("A's $24,000 upfront needs two approvers", async () => {
    const n = await run(rulebookFor("A"));
    expect(closed(n)!.approversNeeded).toBe(2);
    expect(() => approveDeal(n, ["J. Park"])).toThrow(/2 different approvers/);
    expect(approveDeal(n, ["J. Park", "L. Moreno"]).map((e) => e.type)).toEqual(["approved", "deposit_paid"]);
  });

  it("no SSN leaves the engine unmasked, and EINs are cut to the last 4", async () => {
    const n = await run(rulebookFor("A"));
    const text = JSON.stringify(n.events);
    expect(text).not.toMatch(/666\d{6}/);
    expect(JSON.stringify(fixtures)).not.toMatch(/666\d{6}/);
    expect(text).not.toContain("843920175");
    expect(maskDeep({ taxId: "843920175", ssn: "666-70-1019" })).toEqual({ taxId: "•••••0175", ssn: "•••-••-1019" });
  });

  it("normalizeRulebook clamps a client's rulebook to the allowed ranges", () => {
    const r = normalizeRulebook({ scenario: { id: "E", owner: "P99", profile: "nope" }, general: { maxRounds: 40, speed: 9 },
      buyerRules: { tiers: { low: { maxUpfrontPct: 80, bestNetDays: 7 } }, hardStops: { fraudFinder: { threshold: -5 } } } });
    expect(r.scenario).toMatchObject({ id: "E", owner: "P01", profile: "clean" });
    expect(r.general.maxRounds).toBe(6);
    expect(r.general.speed).toBe(3);
    expect(r.buyerRules.tiers.low).toMatchObject({ maxUpfrontPct: 30, bestNetDays: 15 });
    expect(r.buyerRules.hardStops.fraudFinder.threshold).toBe(1);
  });
});
