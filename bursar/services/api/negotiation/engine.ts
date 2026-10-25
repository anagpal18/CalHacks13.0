// The negotiation engine (Shresth). One Rulebook in, a story of DealEvents out, in the order The Table plays them:
//   1 The pitch: the vendor's opening ask and statement.
//   2 Cross-examination: CRS checks every claim in the statement and the round-1 exhibits; hard stops fire here.
//   3 Risk tier: PitchPoint and Risk Dashboard set the tier; its caps and the credit-limit anchor bind the gateway.
//   4 Negotiation: rounds of offers through the gateway; the vendor plays more exhibits as it goes.
//   5 Verdict: deal, talks end, or a person decides.
// CRS (people, live sandbox data), the simulated business source, the gateway, both agents and the judge are
// injected, so Kenil's real pieces replace the stand-ins without touching this file. The same engine runs in the
// browser when there's no API, so offline runs follow the same rules.

import { fmtUsd, maskDeep, type Card, type ClaimCheck, type ConsentRecord, type CrsCallProduct, type CrsCallRecord, type CrsLogEntry,
  type Deal, type DealEvent, type Exhibit, type Offer, type RiskTier, type RuleId, type Rulebook, type SubProfile, type TierCaps,
  type UploadedW9 } from "@terms-room/shared";
import { CONTRACTOR, ownerFor, titleCase } from "./cast.ts";
import { cardsFor, summarize } from "./facts.ts";
import { creditFactsExhibit, documentExhibit, examine, factCard, factsToShare, productsFor, statement, w9Exhibit } from "./duel.ts";
import { appliedText, normalizeRulebook, ruleText, FACT_LABEL } from "./rulebook.ts";
import { scenarioCase, type ScenarioCase } from "./scenarios.ts";
import { simulatedBiz, type BizInput, type BizProduct, type BizSource } from "./business.ts";
import { TRUST_START, approversNeeded, capsFor, capsLine, clampTrust, depositCents, tierFrom } from "./tiers.ts";
import { bluffOffer, sameTerms, standinContractor, standinSub, type AgentView, type ContractorAgent, type SubAgent } from "./standins/agents.ts";
import { fixtureCrs, type CrsSource, type PeopleProduct } from "./standins/fixtureCrs.ts";
import { fraudAlert, hardStops, standinGateway, type Gateway } from "./standins/gateway.ts";

export interface NegotiationDeps {
  crs?: CrsSource;
  biz?: BizSource;
  gateway?: Gateway;
  contractor?: ContractorAgent;
  sub?: SubAgent;
  now?: () => Date;
  /** Asked when the Rulebook lets the judge hand in a W-9. Resolve with the W-9's fields, or null to let the vendor play its own. */
  judge?: (req: { round: number; draft: UploadedW9 }) => Promise<UploadedW9 | null>;
}

export interface Negotiation {
  deal: Deal;
  rulebook: Rulebook;
  scenario: ScenarioCase;
  sub: SubProfile;
  consent: ConsentRecord | null;
  cards: Card[];
  calls: CrsCallRecord[];
  checks: ClaimCheck[];
  exhibits: Exhibit[];
  events: DealEvent[];
  trust: number;
  caps?: TierCaps;
  depositCents?: number;
  approversNeeded?: number;
}

const PURPOSE: Record<CrsCallProduct, string> = {
  tu_idv: "Cross-examine “I'm the owner”: is this person who they say they are",
  fraud_finder: "Cross-examine “these are my email and phone”: risk on the email, phone and IP",
  reverse_phone: "Cross-examine “this is my phone”: who the number belongs to",
  pitchpoint: "Cross-examine “no liens or judgments”, and set the risk tier",
  credit_report: "Vendor side, with signed consent: its own report, so it can share the facts it allows",
  biz_quick_search: "Cross-examine “I own this business”: does it exist, and is it a look-alike",
  biz_registration: "Cross-examine the business's name, age and standing with the secretary of state",
  biz_fraud_shields: "Check the EIN and address on the W-9, OFAC and active status",
  biz_risk_dashboard: "Set the risk tier and the credit-limit anchor: Intelliscore, days beyond terms, recommended limit",
};

const CHAPTERS = ["The pitch", "Cross-examination", "Risk tier", "Negotiation", "Verdict"] as const;

export class ConsentRequiredError extends Error {}

/** The vendor's consent, signed on the start page when its rules allow sharing. Scope is exactly the facts it allows. */
export function consentFrom(rb: Rulebook, sub: SubProfile, now: Date): ConsentRecord | null {
  if (!rb.vendorRules.consent.allow || !rb.vendorRules.consent.facts.length) return null;
  return {
    persona: sub.persona, signedBy: sub.contact, signedAt: now.toISOString(),
    purpose: `Let my agent pull my own credit report and share only ${rb.vendorRules.consent.facts.map((f) => FACT_LABEL[f]).join(", ")} with ${CONTRACTOR.name}. My full report stays with me.`,
    scope: [...rb.vendorRules.consent.facts], expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
  };
}

/** Consent gate: the vendor's agent may pull the vendor's own report only with a signed, unexpired consent. */
export function assertConsent(c: ConsentRecord | null, now: Date = new Date()): ConsentRecord {
  if (!c) throw new ConsentRequiredError("No signed consent, so the vendor's agent may not pull a credit report.");
  if (Date.parse(c.expiresAt) < now.getTime()) throw new ConsentRequiredError(`Consent expired on ${c.expiresAt}.`);
  return c;
}

export async function runNegotiation(
  input: Rulebook | unknown,
  opts: NegotiationDeps & { negotiationId?: string; emit?: (e: DealEvent) => void } = {},
): Promise<Negotiation> {
  const rb = normalizeRulebook(input);
  const now = opts.now ?? (() => new Date());
  const crs = opts.crs ?? fixtureCrs();
  const biz = opts.biz ?? simulatedBiz(now);
  const gateway = opts.gateway ?? standinGateway();
  const contractor = opts.contractor ?? standinContractor();
  const subAgent = opts.sub ?? standinSub();
  const sc = scenarioCase(rb);
  const sub = sc.sub;
  const owner = ownerFor(sc.owner);
  const ask = rb.vendorRules.opening;
  const negotiationId = opts.negotiationId ?? `neg_${rb.scenario.id}_${sc.owner}_${now().getTime().toString(36)}`;
  const lastRound = rb.buyerRules.escalate.noDeal.on ? Math.min(rb.general.maxRounds, rb.buyerRules.escalate.noDeal.rounds) : rb.general.maxRounds;

  const n: Negotiation = {
    deal: { negotiationId, subPersona: sc.owner, scenario: rb.scenario.id, status: "negotiating", rounds: [], riskTier: "low" },
    rulebook: rb, scenario: sc, sub, consent: consentFrom(rb, sub, now()), cards: [], calls: [], checks: [], exhibits: [], events: [], trust: TRUST_START,
  };
  const at = () => now().toISOString();
  const emit = (e: DealEvent) => { n.events.push(e); opts.emit?.(e); };
  let chapter = 0;
  const toChapter = (k: number, caption: string) => { if (k <= chapter) return; chapter = k; emit({ type: "chapter", at: at(), n: k, title: CHAPTERS[k - 1], caption }); };
  const rule = (ruleId: RuleId, detail: string, round: number) =>
    emit({ type: "rule_applied", at: at(), ruleId, text: appliedText(ruleId, rb, { tier: n.deal.riskTier, caps: n.caps, detail }), round });

  async function pull(product: CrsCallProduct, input?: BizInput) {
    let call: CrsCallRecord;
    if (product.startsWith("biz_")) call = await biz.call(product as BizProduct, sc.record, PURPOSE[product], input);
    else {
      const side = product === "credit_report" ? "sub" : "contractor";
      if (product === "credit_report") assertConsent(n.consent, now());
      call = await crs.call(product as PeopleProduct, owner.persona, PURPOSE[product], side);
    }
    n.calls.push(call);
    const entry: CrsLogEntry = { callId: call.callId, product: call.product, persona: call.persona, purpose: call.purpose, side: call.side,
      source: call.source, method: call.method, path: call.path, status: call.status, latencyMs: call.latencyMs, at: call.at, cached: call.cached,
      summary: summarize(call), response: call.product === "credit_report" ? null : maskDeep(call.response) };
    emit({ type: "crs_call", at: at(), entry });
    for (const c of cardsFor(call, sub)) land(c);
    return call;
  }
  function land(c: Card) {
    n.cards.push(c);
    emit({ type: "card_landed", at: at(), card: c, trust: n.trust });
  }
  const has = (p: CrsCallProduct) => n.calls.some((c) => c.product === p);

  async function play(ex: Exhibit) {
    n.exhibits.push(ex);
    emit({ type: "exhibit_played", at: at(), exhibit: ex });
    let fsInputDone = false;
    for (const claim of ex.claims) {
      for (const p of productsFor(claim.topic)) {
        if (p === "biz_fraud_shields") {
          if (fsInputDone) continue;
          fsInputDone = true;
          const ein = ex.claims.find((c) => c.topic === "ein")?.value, address = ex.claims.find((c) => c.topic === "address")?.value;
          await pull(p, { ein, address });
        } else if (!has(p)) await pull(p);
      }
      const res = examine(claim, sub, n.calls, n.cards);
      const w = rb.buyerRules.evidence;
      const delta = res.verdict === "verified" ? w.verified : res.verdict === "contradicted" ? -w.contradicted : -w.unverified;
      n.trust = clampTrust(n.trust + delta);
      const check: ClaimCheck = { claimId: claim.id, exhibitId: ex.id, topic: claim.topic, text: claim.text, ...res, delta, trust: n.trust };
      n.checks.push(check);
      emit({ type: "claim_checked", at: at(), check });
    }
  }

  const setTier = (tier: RiskTier, reason: string, caps: TierCaps) => {
    n.deal.riskTier = tier;
    n.caps = caps;
    emit({ type: "tier_changed", at: at(), tier, reason, limits: caps });
  };
  const verdict = (caption: string) => toChapter(5, caption);
  const end = (round: number, hits: { ruleId: RuleId; text: string; detail: string }[], why?: string) => {
    for (const h of hits) rule(h.ruleId, h.detail, round);
    if (n.deal.riskTier !== "blocked" || !n.caps)
      setTier("blocked", hits.length ? `Blocked: ${hits.length === 1 ? hits[0].text.replace(" → talks end", "").toLowerCase() : `${hits.length} hard stops fired`}.` : `Blocked: ${why}.`, capsFor("blocked", rb, n.calls));
    verdict("Talks end. No upfront payment, no order.");
    n.deal.status = "ended";
    emit({ type: "talks_ended", at: at(), round, reasons: hits.length ? hits.map((h) => `${h.text} (${h.detail.replace(/\.$/, "")}).`) : [why ?? "Talks ended."], ruleIds: hits.map((h) => h.ruleId) });
    return n;
  };
  const escalate = (round: number, reason: string, ruleId?: RuleId, detail = "") => {
    if (ruleId) rule(ruleId, detail, round);
    verdict("A person decides.");
    n.deal.status = "escalated";
    emit({ type: "escalated", at: at(), round, reason, ruleId });
    return n;
  };
  const checkStops = (round: number) => {
    const hits = hardStops(n.cards, n.calls, rb);
    return hits.length ? end(round, hits) : null;
  };

  // ---------------------------------------------------------------- 1. the pitch
  emit({ type: "negotiation_started", at: at(), negotiationId, sub, ask, contractor: CONTRACTOR.name, rulebook: rb,
    business: { name: sc.record.legalName, einLast4: sc.record.ein.slice(-4), address: `${titleCase(sc.record.address.street)}, ${titleCase(sc.record.address.city)} ${sc.record.address.state}`,
      state: sc.record.stateOfOrigin, profile: sc.profile, simulated: true } });
  toChapter(1, `${titleCase(sub.contact)} of ${sub.business} asks ${CONTRACTOR.name} for net ${ask.netDays}, ${ask.upfrontPct}% upfront and a ${fmtUsd(ask.limitCents)} first order.`);
  const opening = statement(sc, ask);

  // ---------------------------------------------------------------- 2. cross-examination
  toChapter(2, "CRS cross-examines every claim the vendor makes.");
  await play(opening);
  let index = 0;
  const allowed = (k: string) => rb.vendorRules.exhibits.includes(k as never);
  let w9: UploadedW9 | null = null;
  let from: "sub" | "judge" = "sub";
  if (rb.scenario.judgeUpload && opts.judge) {
    emit({ type: "upload_requested", at: at(), round: 1, draft: sc.docs.w9,
      prompt: "The vendor reaches for its W-9. Hand in your own document, edit what it claims, or let the vendor play its copy." });
    const up = await opts.judge({ round: 1, draft: sc.docs.w9 });
    if (up) { w9 = up; from = "judge"; }
  }
  if (!w9 && allowed("w9")) w9 = sc.docs.w9;
  if (w9) await play(w9Exhibit(w9, from, index++, 1));
  if (allowed("license")) await play(documentExhibit("license", sc, index++, 1));
  if (checkStops(1)) return n;
  const alert = fraudAlert(n.cards, n.calls);
  if (alert && rb.buyerRules.escalate.fraudAlert) return escalate(1, alert, "escalate.fraud_alert", alert.startsWith("TransUnion") ? "TransUnion reason code 2401" : "Fraud Shields victim statement");

  // ---------------------------------------------------------------- 3. risk tier
  toChapter(3, "The risk tier sets the limits the gateway enforces on every offer we make.");
  if (!has("pitchpoint")) await pull("pitchpoint");
  if (!has("biz_risk_dashboard")) await pull("biz_risk_dashboard");
  if (!has("biz_fraud_shields")) await pull("biz_fraud_shields");
  if (checkStops(1)) return n;
  const { tier, reason } = tierFrom(n.cards, n.calls);
  const caps = capsFor(tier, rb, n.calls);
  setTier(tier, reason, caps);
  rule(`tier.${tier}` as RuleId, "", 1);
  if (caps.anchor) rule("anchor", caps.limitCapCents < caps.anchor.capCents ? `the tier's max limit is lower` : "", 1);
  if (caps.limitCapCents <= 0) return end(1, [{ ruleId: `tier.${tier}` as RuleId, text: ruleText(`tier.${tier}` as RuleId, rb), detail: `max limit ${fmtUsd(0)}, so there's nothing to offer` }]);

  // ---------------------------------------------------------------- 4. negotiation
  toChapter(4, `Offers go through the gateway, which refuses anything outside the rulebook: ${capsLine(caps)}.`);
  const view = (round: number): AgentView => ({ negotiationId, round, lastRound, sub, rulebook: rb, tier: n.deal.riskTier, caps: n.caps!, trust: n.trust,
    cards: n.cards, checks: n.checks, history: n.deal.rounds });
  const submit = (offer: Offer, revise: (o: Offer, reasons: string[], ruleIds: RuleId[]) => Offer): Offer | null => {
    let o = offer;
    for (let attempt = 0; attempt < 2; attempt++) {
      const v = gateway.check(o, { log: n.calls, tier: n.deal.riskTier, caps: n.caps!, rulebook: rb });
      if (v.ok) { n.deal.rounds.push(o); emit({ type: "offer_made", at: at(), offer: o }); return o; }
      emit({ type: "offer_rejected", at: at(), offer: o, reasons: v.reasons, ruleIds: v.ruleIds });
      for (const d of v.details) rule(d.ruleId, d.short, o.round);
      o = revise(o, v.reasons, v.ruleIds);
    }
    return null;
  };
  const close = (terms: Offer) => {
    n.deal.status = "agreed";
    n.depositCents = depositCents(terms.limitCents, terms.depositPct);
    n.approversNeeded = approversNeeded(n.depositCents, rb);
    if (n.approversNeeded > 1) rule("approval.second", `${fmtUsd(n.depositCents)} upfront`, terms.round);
    verdict(`Deal: net ${terms.netDays}, ${terms.depositPct}% upfront, ${fmtUsd(terms.limitCents)} first order. The controller approves before money moves.`);
    emit({ type: "deal_closed", at: at(), terms, rounds: terms.round, depositCents: n.depositCents, approversNeeded: n.approversNeeded });
    return n;
  };

  const LATER: Record<number, string[]> = { 2: ["reference", "credit_facts"], 3: ["invoices", "bank_letter"] };
  for (let round = 1; round <= lastRound; round++) {
    for (const k of LATER[round] ?? []) {
      if (!allowed(k)) continue;
      if (k === "credit_facts") {
        if (!n.consent) { rule("consent", "", round); continue; }
        const report = has("credit_report") ? n.calls.find((c) => c.product === "credit_report")! : await pull("credit_report");
        const { shared, withheld } = factsToShare(report, n.consent.scope);
        emit({ type: "report_held", at: at(), side: "sub", callId: report.callId,
          reason: `The vendor's own TransUnion report, pulled with its signed consent. It stays face down.${withheld.length ? ` Kept private: ${withheld.map((f) => FACT_LABEL[f.fact]).join(", ")}.` : ""}` });
        if (!shared.length) continue;
        for (const f of shared) land(factCard(f));
        await play(creditFactsExhibit(shared, index++, round));
      } else await play(documentExhibit(k as "reference" | "invoices" | "bank_letter", sc, index++, round));
      if (checkStops(round)) return n;
    }
    const s = submit(subAgent.propose(view(round)), (o, r) => subAgent.revise(view(round), o, r));
    if (!s) return escalate(round, "The vendor's offer failed the gateway twice.");
    const lastC = [...n.deal.rounds].reverse().find((o) => o.from === "contractor" && o !== s);
    if (lastC && sameTerms(s, lastC)) return close(s);

    const c = submit(contractor.propose(view(round)), (o, r, ids) => contractor.revise(view(round), o, r, ids));
    if (!c) return escalate(round, "Our agent's offer failed the gateway twice.");
    if (sameTerms(c, s)) return close(c);
    if (subAgent.accepts(view(round), c)) {
      const echo = submit(subAgent.propose(view(round)), (o, r) => subAgent.revise(view(round), o, r));
      if (echo && sameTerms(echo, c)) return close(echo);
    }
  }
  if (rb.buyerRules.escalate.noDeal.on)
    return escalate(lastRound, `No deal after ${lastRound} round${lastRound > 1 ? "s" : ""}. A person decides.`, "escalate.no_deal", `${lastRound} round${lastRound > 1 ? "s" : ""}`);
  return end(lastRound, [{ ruleId: "rounds.max", text: ruleText("rounds.max", rb), detail: `${lastRound} rounds, no deal` }]);
}

/** Controller approval, then the upfront payment. Nessie is Aditya's; until it's wired the transfer is simulated and labeled so. */
export function approveDeal(n: Negotiation, approvers: string[], now: () => Date = () => new Date()): DealEvent[] {
  if (n.deal.status !== "agreed") throw new Error(`Only an agreed deal can be approved (this one is ${n.deal.status}).`);
  const distinct = [...new Set(approvers.map((a) => a.trim()).filter(Boolean))];
  const needed = n.approversNeeded ?? 1;
  if (distinct.length < needed) throw new Error(`This upfront payment needs ${needed} different approvers; got ${distinct.length}.`);
  const out: DealEvent[] = [];
  n.deal.status = "approved";
  n.deal.approvedBy = distinct.join(" + ");
  out.push({ type: "approved", at: now().toISOString(), approvers: distinct });
  const transferId = `NESSIE-${n.deal.negotiationId.slice(-6).toUpperCase()}`;
  n.deal.status = "deposit_paid";
  n.deal.nessieTransferId = transferId;
  out.push({ type: "deposit_paid", at: now().toISOString(), transferId, amountCents: n.depositCents ?? 0, simulated: true });
  n.events.push(...out);
  return out;
}

/** "Make the vendor bluff": an offer citing a value CRS never returned, run through the gateway. Never changes the deal. */
export function bluff(n: Negotiation, gateway: Gateway = standinGateway(), now: () => Date = () => new Date()): DealEvent {
  const round = Math.min(n.rulebook.general.maxRounds, n.deal.rounds.at(-1)?.round ?? 1);
  const caps = n.caps ?? capsFor(n.deal.riskTier, n.rulebook, n.calls);
  const offer = bluffOffer({ negotiationId: n.deal.negotiationId, round, lastRound: round, sub: n.sub, rulebook: n.rulebook, tier: n.deal.riskTier,
    caps, trust: n.trust, cards: n.cards, checks: n.checks, history: n.deal.rounds });
  const v = gateway.check(offer, { log: n.calls, tier: n.deal.riskTier, caps, rulebook: n.rulebook });
  const e: DealEvent = v.ok ? { type: "offer_made", at: now().toISOString(), offer } : { type: "offer_rejected", at: now().toISOString(), offer, reasons: v.reasons, ruleIds: v.ruleIds };
  n.events.push(e);
  return e;
}
