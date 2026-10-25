// Real mode: the story negotiation/engine.ts tells, told by the LLM agents. Same DealEvents, same shapes, same order,
// so The Table can't tell the modes apart. Per round: DOC_ANALYST (cached for built-in documents, live for the judge's
// W-9) → CRS through the engine's clients (persona allowlist, cache, masking, console events; simulated business data)
// → EVIDENCE_RISK_JUDGE → the tier, clamped in code by the Rulebook's hard stops → the vendor's or the buyer's agent →
// the gateway (one retry) → STORYTELLER_CLERK's caption. An agent that still fails after its retry hands that turn to a
// person (the `escalated` event); real mode never falls back to the rule-based stand-ins.
// Server-only: nothing here is imported by negotiation/index.ts, so the browser bundle never sees it.

import { fmtUsd, maskDeep, maskLast4, type Card, type Citation, type Claim, type ClaimCheck, type CrsCallProduct, type CrsCallRecord,
  type CrsLogEntry, type DealEvent, type Exhibit, type Offer, type RiskTier, type RuleId, type Rulebook, type TierCaps, type TierRule,
  type Thought, type UploadedW9, type Verdict, type VendorExhibit } from "@terms-room/shared";
import { CONTRACTOR, ownerFor, titleCase } from "../../negotiation/cast.ts";
import { cardsFor, creditFacts, summarize, type CreditFactCheck } from "../../negotiation/facts.ts";
import { creditFactsExhibit, documentExhibit, factCard, productsFor, statement, w9Exhibit } from "../../negotiation/duel.ts";
import { appliedText, normalizeRulebook, ruleText, EXHIBIT_LABEL, TIER_NAME } from "../../negotiation/rulebook.ts";
import { scenarioCase } from "../../negotiation/scenarios.ts";
import { simulatedBiz, type BizInput, type BizProduct, type BizSource } from "../../negotiation/business.ts";
import { TRUST_START, approversNeeded, capsFor, capsLine, clampTrust, depositCents, tierFrom } from "../../negotiation/tiers.ts";
import { resolveField } from "../../negotiation/path.ts";
import { sameTerms, schedule } from "../../negotiation/standins/agents.ts";
import { fixtureCrs, type CrsSource, type PeopleProduct } from "../../negotiation/standins/fixtureCrs.ts";
import { fraudAlert, hardStops, standinGateway, type Gateway } from "../../negotiation/standins/gateway.ts";
import { assertConsent, consentFrom, type Negotiation } from "../../negotiation/engine.ts";
import { AgentError, type AgentCall, type Llm } from "./llm.ts";
import { agentCitation, dollars, fullCitation, termsInDollars, type AgentCitation, type AgentOffer } from "./contracts.ts";
import { BUSINESS_PRODUCTS, documentText, w9Text, type DocKind } from "./docs.ts";
import { analyzeDocument, type DocAnalysis } from "./docAnalyst.ts";
import { judge, type ClaimWithCrs, type Judgment } from "./judge.ts";
import { vendorStrategist, type VendorInput, type VendorTurn } from "./vendor.ts";
import { buyerNegotiator, crossExamLines, type BuyerInput, type BuyerTurn } from "./buyer.ts";
import { caption, closePaperwork, type StoryClose } from "./storyteller.ts";

export interface RealNegotiation extends Negotiation {
  closing: StoryClose | null; // the clerk's terms card, approval memo and recommendation
  agentCalls: AgentCall[];
}

export interface RealDeps {
  llm: Llm;
  crs?: CrsSource;
  biz?: BizSource;
  gateway?: Gateway;
  now?: () => Date;
  judge?: (req: { round: number; draft: UploadedW9 }) => Promise<UploadedW9 | null>;
  log?: (msg: string) => void;
  captionDeadlineMs?: number;
}

const PURPOSE: Record<CrsCallProduct, string> = {
  tu_idv: "Cross-examine “I'm the owner”: is this person who they say they are",
  fraud_finder: "Cross-examine “these are my email and phone”: risk on the email, phone and IP",
  reverse_phone: "Cross-examine “this is my phone”: who the number belongs to",
  pitchpoint: "Cross-examine “no liens or judgments”, and set the risk level",
  credit_report: "Vendor side, with signed consent: its own report, so it can share the facts it allows",
  biz_quick_search: "Cross-examine “I own this business”: does it exist, and is it a look-alike",
  biz_registration: "Cross-examine the business's name, age and standing with the secretary of state",
  biz_fraud_shields: "Check the EIN and address on the W-9, OFAC and active status",
  biz_risk_dashboard: "Set the risk level and the first-order cap: business credit score, how late it pays suppliers, suggested credit limit",
};

const CHAPTERS = ["The pitch", "Cross-examination", "Risk level", "Negotiation", "Verdict"] as const;
const RISK: Record<RiskTier, number> = { low: 0, caution: 1, blocked: 2 };
const stricter = (a: RiskTier, b: RiskTier) => (RISK[a] >= RISK[b] ? a : b);
const PERSON: CrsCallProduct[] = ["tu_idv", "fraud_finder", "reverse_phone", "pitchpoint"];
const BUSINESS: CrsCallProduct[] = ["biz_quick_search", "biz_registration", "biz_fraud_shields", "biz_risk_dashboard"];
const LATER: VendorExhibit[] = ["reference", "credit_facts", "invoices", "bank_letter"];
const REC_FIELD = "results.creditLimitRecommendation.recommendedCreditLimitAmount";
const LABEL: Record<string, string> = { legal_name: "Legal name", address: "Address", standing: "Standing", pays_on_time: "Pays on time",
  volume: "Past work", bank_balance: "Bank balance" };

type Plan =
  | { kind: "statement"; claim: Claim }
  | { kind: "doc"; claim: Claim; check: { product: CrsCallProduct; crsField: string } | null }
  | { kind: "fact"; claim: Claim; fact: CreditFactCheck };
interface Played { ex: Exhibit; plans: Plan[]; thought?: Thought }

/** The checks as our agent would name them out loud. */
const CHECK_NAME: Record<CrsCallProduct, string> = {
  tu_idv: "TransUnion identity check", fraud_finder: "Fraud Finder email and phone risk", reverse_phone: "reverse phone lookup",
  pitchpoint: "PitchPoint liens and judgments search", credit_report: "vendor's own credit report", biz_quick_search: "Quick Search for the business and look-alikes",
  biz_registration: "secretary of state registration", biz_fraud_shields: "Fraud Shields EIN and address match", biz_risk_dashboard: "Risk Dashboard payment history",
};

const within = <T>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** One line per event for the storyteller. Cards and uploads are left out: the checks and offers carry the story. */
function brief(e: DealEvent): string | null {
  const terms = (o: Offer) => `paid in ${o.netDays} days, ${o.depositPct}% up front, a ${fmtUsd(o.limitCents)} first order`;
  switch (e.type) {
    case "negotiation_started": return `${titleCase(e.sub.contact)} of ${e.sub.business} asks ${e.contractor} to be paid in ${e.ask.netDays} days, with ${e.ask.upfrontPct}% up front and a ${fmtUsd(e.ask.limitCents)} first order.`;
    case "exhibit_played": return `${e.exhibit.from === "judge" ? "The judge hands in" : "The vendor plays"} ${e.exhibit.title}: ${e.exhibit.argument}`;
    case "crs_call": return `CRS ${e.entry.product}: ${e.entry.summary}.`;
    case "claim_checked": return `${e.check.verdict}: “${e.check.text}”. ${e.check.reason}`;
    case "rule_applied": return `Rule: ${e.text}.`;
    case "report_held": return "The vendor keeps its own credit report private.";
    case "tier_changed": return `Risk level ${TIER_NAME[e.tier]}. ${e.reason}`;
    case "offer_made": return `${e.offer.from === "sub" ? "The vendor" : "Keystone"} offers ${terms(e.offer)}: ${e.offer.rationale}`;
    case "offer_rejected": return `The rule check refuses ${e.offer.from === "sub" ? "the vendor's" : "Keystone's"} offer: ${e.reasons[0] ?? ""}`;
    default: return null;
  }
}

export async function runRealNegotiation(
  input: Rulebook | unknown,
  opts: RealDeps & { negotiationId?: string; emit?: (e: DealEvent) => void },
): Promise<RealNegotiation> {
  const rb = normalizeRulebook(input);
  const now = opts.now ?? (() => new Date());
  const crs = opts.crs ?? fixtureCrs();
  const biz = opts.biz ?? simulatedBiz(now);
  const gateway = opts.gateway ?? standinGateway();
  const log = opts.log ?? (() => {});
  const deadline = opts.captionDeadlineMs ?? 6_000;
  const agentCalls: AgentCall[] = [];
  const llm: Llm = { ...opts.llm, onCall: (c) => { agentCalls.push(c); opts.llm.onCall?.(c); } };
  const sc = scenarioCase(rb);
  const sub = sc.sub;
  const owner = ownerFor(sc.owner);
  const ask = rb.vendorRules.opening;
  const negotiationId = opts.negotiationId ?? `neg_${rb.scenario.id}_${sc.owner}_${now().getTime().toString(36)}`;
  const lastRound = rb.buyerRules.escalate.noDeal.on ? Math.min(rb.general.maxRounds, rb.buyerRules.escalate.noDeal.rounds) : rb.general.maxRounds;

  const n: RealNegotiation = {
    deal: { negotiationId, subPersona: sc.owner, scenario: rb.scenario.id, status: "negotiating", rounds: [], riskTier: "low" },
    rulebook: rb, scenario: sc, sub, consent: consentFrom(rb, sub, now()), cards: [], calls: [], checks: [], exhibits: [], events: [],
    trust: TRUST_START, closing: null, agentCalls,
  };
  const at = () => now().toISOString();
  const DONE = Symbol("done");

  // ---------------------------------------------------------------- emission, in order
  // A chapter event can wait on its caption while the work goes on; everything after it waits its turn.
  let queue: Promise<void> = Promise.resolve();
  let sink: DealEvent[] | null = null; // while an exhibit's CRS calls are staged, until its verdicts are in
  const told: string[] = []; // the story so far, one line per event, for the storyteller
  const rulesApplied: string[] = [];
  const send = (e: DealEvent | Promise<DealEvent>) => { queue = queue.then(async () => { const ev = await e; n.events.push(ev); opts.emit?.(ev); }); };
  const emit = (e: DealEvent) => {
    if (sink) { sink.push(e); return; }
    const line = brief(e);
    if (line) told.push(line);
    if (e.type === "rule_applied") rulesApplied.push(e.text);
    send(e);
  };
  let chapter = 0;
  const toChapter = (k: number, template: string, outcome?: string) => {
    if (k <= chapter) return;
    chapter = k;
    const events = [...told.slice(-10), ...(outcome ? [outcome] : []), `Chapter ${k}, ${CHAPTERS[k - 1]}: ${template}`];
    const base = { type: "chapter" as const, at: at(), n: k, title: CHAPTERS[k - 1] };
    send(within(caption(llm, { mode: "caption", chapter: k, recentEvents: events }), deadline)
      .then((c) => ({ ...base, caption: c.caption }))
      .catch((e: Error) => { log(`Chapter ${k} caption: ${e.message}; using the chapter's built-in caption.`); return { ...base, caption: template }; }));
  };
  /** thought: one line for a run of rules, so the bubble says it once instead of once per rule. */
  const rule = (ruleId: RuleId, detail: string, round: number, thought?: string) =>
    emit({ type: "rule_applied", at: at(), ruleId, text: appliedText(ruleId, rb, { tier: n.deal.riskTier, caps: n.caps, detail }), round,
      ...(thought ? { thought: { side: "contractor" as const, text: thought } } : {}) });

  // ---------------------------------------------------------------- CRS and the table
  async function pull(product: CrsCallProduct, input?: BizInput, thought?: Thought) {
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
    emit({ type: "crs_call", at: at(), entry, ...(thought ? { thought } : {}) });
    for (const c of cardsFor(call, sub)) land(c);
    return call;
  }
  const land = (c: Card) => { n.cards.push(c); emit({ type: "card_landed", at: at(), card: c, trust: n.trust }); };
  const has = (p: CrsCallProduct) => n.calls.some((c) => c.product === p);
  const lastCall = (p: CrsCallProduct) => [...n.calls].reverse().find((c) => c.product === p);
  const cardsOfCall = (callId: string) => n.cards.filter((c) => c.citations.some((k) => k.callId === callId));
  const evidence = () => n.cards.flatMap((c) => c.citations.map((k) => ({ ...agentCitation(k), product: k.product, fact: c.headline })));
  const summaryOf = (ps: CrsCallProduct[]) => n.cards.filter((c) => ps.includes(c.product as CrsCallProduct))
    .map((c) => ({ product: c.product, fact: c.headline, detail: c.detail, citations: c.citations.map(agentCitation) }));

  // ---------------------------------------------------------------- outcomes (each one ends the story)
  /** Sets the tier and returns what our agent thinks of it, for the rules that follow. */
  const setTier = (tier: RiskTier, reason: string, caps: TierCaps, thought?: string) => {
    n.deal.riskTier = tier;
    n.caps = caps;
    tierReason = reason;
    const said = thought ?? (caps.limitCapCents <= 0 ? `${reason} There's nothing I can offer.`
      : `${reason} So we can pay in ${caps.bestNetDays} days at the soonest, up to ${caps.maxUpfrontPct}% up front, with a first order up to ${fmtUsd(caps.limitCapCents)}.`);
    emit({ type: "tier_changed", at: at(), tier, reason, limits: caps, thought: { side: "contractor", text: said } });
    return said;
  };
  const verdict = (template: string, outcome: string) => toChapter(5, template, `Outcome: ${outcome}`);
  const end = (round: number, hits: { ruleId: RuleId; text: string; detail: string }[]): never => {
    const said = hits.length === 1 ? `${hits[0].detail.replace(/\.$/, "")}. That's a hard stop in my rulebook, so talks end here.`
      : `${hits.length} hard stops: ${hits.map((h) => h.detail.replace(/\.$/, "")).join("; ")}. My rulebook ends this.`;
    for (const h of hits) rule(h.ruleId, h.detail, round, said);
    if (n.deal.riskTier !== "blocked" || !n.caps)
      setTier("blocked", hits.length === 1 ? `Blocked: ${hits[0].text.replace(" → talks end", "").toLowerCase()}.` : `Blocked: ${hits.length} hard stops fired.`, capsFor("blocked", rb, n.calls), said);
    verdict("Talks end. No up-front payment, no order.", `talks end (${hits.map((h) => h.text.replace(" → talks end", "")).join("; ")})`);
    n.deal.status = "ended";
    emit({ type: "talks_ended", at: at(), round, reasons: hits.map((h) => `${h.text} (${h.detail.replace(/\.$/, "")}).`), ruleIds: hits.map((h) => h.ruleId) });
    throw DONE;
  };
  const endedBy = (round: number, reason: string): never => {
    verdict("Talks end. No up-front payment, no order.", `talks end. ${reason}`);
    n.deal.status = "ended";
    emit({ type: "talks_ended", at: at(), round, reasons: [reason], ruleIds: [] });
    throw DONE;
  };
  const escalate = (round: number, reason: string, ruleId?: RuleId, detail = ""): never => {
    if (ruleId) rule(ruleId, detail, round);
    verdict("A person decides.", `a person decides. ${reason}`);
    n.deal.status = "escalated";
    emit({ type: "escalated", at: at(), round, reason, ruleId });
    throw DONE;
  };
  const close = (terms: Offer): never => {
    n.deal.status = "agreed";
    n.depositCents = depositCents(terms.limitCents, terms.depositPct);
    n.approversNeeded = approversNeeded(n.depositCents, rb);
    if (n.approversNeeded > 1) rule("approval.second", `${fmtUsd(n.depositCents)} up front`, terms.round);
    verdict(`Deal: paid in ${terms.netDays} days, ${terms.depositPct}% up front, ${fmtUsd(terms.limitCents)} first order. The controller approves before money moves.`,
      `deal: paid in ${terms.netDays} days, ${terms.depositPct}% up front (${fmtUsd(n.depositCents)}), ${fmtUsd(terms.limitCents)} first order; ${n.approversNeeded} approver${n.approversNeeded > 1 ? "s" : ""}`);
    emit({ type: "deal_closed", at: at(), terms, rounds: terms.round, depositCents: n.depositCents, approversNeeded: n.approversNeeded });
    throw DONE;
  };
  const checkStops = (round: number) => { const hits = hardStops(n.cards, n.calls, rb); if (hits.length) end(round, hits); };
  /** An agent's answer, or the turn goes to a person when it still fails after its retry. */
  async function agent<T>(p: () => Promise<T>, round: number, who: string): Promise<T> {
    try {
      return await p();
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      log(e.message);
      return escalate(round, `${who} didn't give a usable answer after a retry, so a person decides.`);
    }
  }

  // ---------------------------------------------------------------- the tier: the judge proposes, the Rulebook clamps
  let judgeTier: RiskTier = "low";
  let judgeReasons: string[] = [];
  let tierReason = "";
  const judgeReason = (t: RiskTier) => `${TIER_NAME[t]}: ${judgeReasons.map((r) => r.replace(/\.$/, "")).join("; ")}.`;
  const tierNow = () => {
    const code = tierFrom(n.cards, n.calls);
    const tier = stricter(code.tier, judgeTier);
    return { tier, reason: tier === judgeTier && judgeReasons.length ? judgeReason(tier) : code.reason };
  };
  const noRoom = (t: RiskTier) => ({ ruleId: `tier.${t}` as RuleId, text: ruleText(`tier.${t}` as RuleId, rb), detail: `no first order allowed, so there's nothing to offer` });
  /** Mid-negotiation the tier only gets stricter. */
  const retier = (round: number) => {
    const { tier, reason } = tierNow();
    const t = stricter(tier, n.deal.riskTier);
    if (t === n.deal.riskTier) return;
    const caps = capsFor(t, rb, n.calls);
    rule(`tier.${t}` as RuleId, "", round, setTier(t, reason, caps));
    if (caps.limitCapCents <= 0) end(round, [noRoom(t)]);
  };

  // ---------------------------------------------------------------- exhibits: documents → claims → CRS → verdicts
  let index = 0;
  const allowed = (k: string) => rb.vendorRules.exhibits.includes(k as VendorExhibit);
  const played = (k: string) => n.exhibits.some((e) => e.kind === k);
  const analyze = (docType: DocKind, text: string, cache: boolean) =>
    analyzeDocument(llm, { docType, text, availableProducts: BUSINESS_PRODUCTS }, { cache });
  const docJobs = new Map<DocKind, Promise<DocAnalysis>>();
  const prefetch = (k: DocKind, text: string) => { const p = analyze(k, text, true); p.catch(() => {}); docJobs.set(k, p); };

  // What the claim reads as on the table: the document's own words when they're short, else "Label: value". EINs masked.
  const claimText = (c: DocAnalysis["claims"][number]) => {
    const quote = c.sourceText.replace(/\s+/g, " ").trim();
    return c.field === "ein" ? `EIN ${maskLast4(c.value)}`
      : c.field !== "legal_name" && c.field !== "address" && quote.length <= 90 ? quote : `${LABEL[c.field]}: ${c.value}`;
  };
  const docExhibit = (base: Exhibit, a: DocAnalysis): Played => {
    const plans: Plan[] = a.claims.map((c) => ({ kind: "doc", check: c.check ? { product: c.check.product as CrsCallProduct, crsField: c.check.crsField } : null,
      claim: { id: `${base.id}:${c.claimId}`, topic: c.field, text: claimText(c), value: c.value } }));
    return { ex: { ...base, claims: plans.map((p) => p.claim) }, plans };
  };

  type Row = ClaimWithCrs & { claim: Claim; cards: string[] };
  const productsOf = (p: Plan): CrsCallProduct[] => (p.kind === "statement" ? productsFor(p.claim.topic) : p.kind === "doc" && p.check ? [p.check.product] : []);
  /** Each claim beside what CRS returned for it. fs is the Fraud Shields call made with this exhibit's EIN and address. */
  const rowsOf = (plans: Plan[], fs?: CrsCallRecord): Row[] => plans.map((p) => {
    const base = { claim: p.claim, claimId: p.claim.id, field: p.claim.topic, claimValue: p.claim.value ?? p.claim.text };
    if (p.kind === "fact") {
      const c = p.fact.citations[0];
      return { ...base, crsValue: p.fact.headline, citation: c ? agentCitation(c) : null, cards: [`fact-${p.fact.fact}`] };
    }
    if (p.kind === "doc") {
      const call = !p.check ? undefined : p.check.product === "biz_fraud_shields" ? fs : lastCall(p.check.product);
      const v = call && p.check ? resolveField(call.response, p.check.crsField) : undefined;
      return { ...base, crsValue: v ?? null, citation: call && v !== undefined ? { callId: call.callId, field: p.check!.crsField, value: v } : null,
        cards: call ? cardsOfCall(call.callId).map((c) => c.id) : [] };
    }
    const cards = productsFor(p.claim.topic).flatMap((pr) => { const call = lastCall(pr); return call ? cardsOfCall(call.callId) : []; });
    return { ...base, crsValue: cards.length ? cards.map((c) => `${c.headline}. ${c.detail}`).join(" | ") : null,
      citation: cards[0]?.citations[0] ? agentCitation(cards[0].citations[0]) : null, cards: cards.map((c) => c.id) };
  });
  const judgeInput = (rows: Row[]) => ({
    claimsWithCrs: rows.map(({ claimId, field, claimValue, crsValue, citation }) => ({ claimId, field, claimValue, crsValue, citation })),
    quickSearchResults: quickSearch(), personCrsSummary: summaryOf(PERSON), businessCrsSummary: summaryOf(BUSINESS),
  });

  // The documents and credit facts the vendor can still play are fixed once talks start, and what CRS says about
  // them is already in the log, so the judge rules on them while the vendor's agent thinks. An exhibit that would
  // need a new CRS call is judged when it's played instead.
  const early = new Map<string, Promise<Judgment | null>>();
  function judgeAhead() {
    for (const k of LATER) {
      if (!allowed(k) || played(k)) continue;
      const job = (async () => {
        let pl: Played;
        if (k === "credit_facts") {
          const facts = shareable();
          if (!facts.length) return null;
          const ex = creditFactsExhibit(facts, 0, 0);
          pl = { ex, plans: facts.map((fact, i) => ({ kind: "fact", claim: ex.claims[i], fact })) };
        } else {
          const doc = docJobs.get(k as DocKind);
          if (!doc) return null;
          pl = docExhibit(documentExhibit(k as Exclude<DocKind, "w9">, sc, 0, 0), await doc);
        }
        if (pl.plans.some((p) => productsOf(p).some((pr) => pr === "biz_fraud_shields" || !has(pr)))) return null;
        const rows = rowsOf(pl.plans);
        return rows.length ? judge(llm, judgeInput(rows), n.calls) : null;
      })();
      job.catch(() => {});
      early.set(k, job);
    }
  }
  async function ruledAhead(group: Played[], rows: Row[]) {
    const pre = (await Promise.all(group.map((g) => (early.get(g.ex.kind) ?? Promise.resolve(null)).catch(() => null)))).filter((j): j is Judgment => !!j);
    const verdicts = pre.flatMap((j) => j.verdicts);
    if (!pre.length || !rows.every((r) => verdicts.some((v) => v.claimId === r.claimId))) return null;
    return { ...pre.at(-1)!, verdicts, proposedTier: pre.map((j) => j.proposedTier).reduce(stricter) };
  }

  // What our agent says as each claim goes to CRS. Asked for as early as the claims are known (the statement at the
  // start, each document as soon as it's been read), so the lines are usually ready before the exhibit is played.
  const lineJobs = new Map<string, Promise<Map<string, string>>>();
  const claimsToVoice = (plans: Plan[]) => plans.filter((p) => productsOf(p).length)
    .map((p) => ({ claimId: p.claim.id, claim: p.claim.text, checks: productsOf(p).map((pr) => CHECK_NAME[pr]) }));
  function askLines(ex: Exhibit, plans: Plan[]): Promise<Map<string, string>> {
    let job = lineJobs.get(ex.id);
    if (!job) {
      const claims = claimsToVoice(plans);
      job = !claims.length ? Promise.resolve(new Map())
        : crossExamLines(llm, { vendor: { owner: titleCase(sub.contact), business: sub.business },
            exhibit: { title: ex.title, handedInBy: ex.from === "judge" ? "the judge" : "the vendor" }, claims })
          .then((out) => new Map(out.lines.map((l) => [l.claimId, l.thought] as [string, string])));
      job.catch(() => {});
      lineJobs.set(ex.id, job);
    }
    return job;
  }
  /** The lines for an exhibit being played. Never fails: past a short wait, a line built from the claim stands in. */
  function examLines(ex: Exhibit, plans: Plan[]): Promise<Map<string, string>> {
    const fallback = new Map(claimsToVoice(plans).map((c) => [c.claimId, `“${c.claim}” Let's see what the ${c.checks.join(" and the ")} says.`]));
    return within(askLines(ex, plans), 4_000)
      .then((said) => new Map([...fallback, ...said]))
      .catch((e: Error) => { log(`Cross-examination lines for ${ex.title}: ${e.message}; using lines built from the claims.`); return fallback; });
  }

  async function playGroup(group: Played[], round: number) {
    type Stage = { ex: Exhibit; events: DealEvent[]; rows: Row[]; lines: Promise<Map<string, string>>; asked: Map<DealEvent, string> };
    const staged: Stage[] = [];
    for (const [i, { ex, plans, thought }] of group.entries()) {
      n.exhibits.push(ex);
      // The first exhibit goes on the table at once and its CRS calls follow as soon as our agent has said what it's
      // checking; later ones wait for their verdicts so each exhibit reads in order.
      const shown: DealEvent = { type: "exhibit_played", at: at(), exhibit: ex, ...(thought ? { thought } : {}) };
      const events: DealEvent[] = i === 0 ? [] : [shown];
      if (i === 0) emit(shown);
      const lines = examLines(ex, plans);
      const asked = new Map<DealEvent, string>(); // each CRS call, and the claim that sent it there
      sink = events;
      let fs: CrsCallRecord | undefined;
      try {
        for (const p of plans) {
          for (const product of productsOf(p)) {
            const before = events.length;
            if (product === "biz_fraud_shields") {
              const value = (f: string) => plans.find((x) => x.claim.topic === f)?.claim.value;
              fs ??= await pull(product, { ein: value("ein"), address: value("address") });
            } else if (!has(product)) await pull(product);
            for (const e of events.slice(before)) if (e.type === "crs_call") asked.set(e, p.claim.id);
          }
        }
      } finally { sink = null; }
      staged.push({ ex, events, rows: rowsOf(plans, fs), lines, asked });
    }

    const all = staged.flatMap((s) => s.rows);
    const judging = all.length ? (async () => (await ruledAhead(group, all)) ?? judge(llm, judgeInput(all), n.calls))() : Promise.resolve(null);
    judging.catch(() => {}); // awaited below, after the first exhibit's CRS calls are out
    const voice = async (s: Stage) => {
      const said = await s.lines;
      for (const [e, claimId] of s.asked) { const text = said.get(claimId); if (text) e.thought = { side: "contractor", text }; }
      s.events.splice(0).forEach(emit);
    };
    await voice(staged[0]);
    const ruling = all.length ? await agent(() => judging, round, "The evidence check") : null;
    if (ruling) {
      judgeTier = stricter(judgeTier, ruling.proposedTier);
      judgeReasons = ruling.topReasons.map((r) => r.reason);
    }
    const w = rb.buyerRules.evidence;
    for (const [k, s] of staged.entries()) {
      await voice(s);
      for (const [j, r] of s.rows.entries()) {
        const v = ruling!.verdicts.find((x) => x.claimId === r.claimId)!;
        const verdict = v.verdict.toLowerCase() as Verdict;
        const delta = verdict === "verified" ? w.verified : verdict === "contradicted" ? -w.contradicted : -w.unverified;
        n.trust = clampTrust(n.trust + delta);
        const cited = v.citation ? cardsOfCall(v.citation.callId) : n.cards.filter((c) => r.cards.includes(c.id));
        // A contradiction strings its red thread to the first card, so lead with a bad one.
        const ordered = verdict === "contradicted" ? [...cited].sort((a, b) => Number(b.tone === "bad") - Number(a.tone === "bad")) : cited;
        const check: ClaimCheck = { claimId: r.claimId, exhibitId: s.ex.id, topic: r.claim.topic, text: r.claim.text, verdict, reason: v.reason,
          citations: v.citation ? [fullCitation(v.citation, n.calls)] : [], cardIds: ordered.map((c) => c.id), delta, trust: n.trust };
        n.checks.push(check);
        // Each verdict's bubble is the judge's reason in its own words; the group's last one is its overall reaction.
        const last = k === staged.length - 1 && j === s.rows.length - 1;
        emit({ type: "claim_checked", at: at(), check, thought: { side: "contractor", text: last && ruling?.thought ? ruling.thought : v.reason } });
      }
    }
  }
  function quickSearch() {
    const q = lastCall("biz_quick_search");
    if (!q) return null;
    const r = q.response as any;
    return { callId: q.callId, lookAlikeIndicator: r.lookAlikeIndicator, results: r.results.map((x: any) => ({ businessName: x.businessName,
      address: x.address, yearOfIncorporation: x.yearOfIncorporation, numberOfTradelines: x.numberOfTradelines, nameSimilarityScore: x.nameSimilarityScore ?? null })) };
  }

  // ---------------------------------------------------------------- offers through the gateway
  const toOffer = (from: Offer["from"], round: number, t: AgentOffer, cites: AgentCitation[], rationale: string, sharedCards?: Citation[]): Offer => ({
    negotiationId, round, from, depositPct: t.upfrontPct, schedule: schedule(t.upfrontPct, t.netDays), netDays: t.netDays, limitCents: t.limit * 100,
    conditions: [...t.conditions], citations: cites.map((c) => fullCitation(c, n.calls)), ...(sharedCards?.length ? { sharedCards } : {}), rationale });
  const gate = (o: Offer, thought: Thought): { ok: true } | { ok: false; reasons: string[] } => {
    const v = gateway.check(o, { log: n.calls, tier: n.deal.riskTier, caps: n.caps!, rulebook: rb });
    if (v.ok) { n.deal.rounds.push(o); emit({ type: "offer_made", at: at(), offer: o, thought }); return v; }
    emit({ type: "offer_rejected", at: at(), offer: o, reasons: v.reasons, ruleIds: v.ruleIds });
    for (const d of v.details) rule(d.ruleId, d.short, o.round);
    log(`Gateway refused the ${o.from === "sub" ? "vendor's" : "buyer's"} round ${o.round} offer: ${v.reasons.join(" ")}`);
    return { ok: false, reasons: v.reasons };
  };
  const lastFrom = (side: Offer["from"]) => [...n.deal.rounds].reverse().find((o) => o.from === side);
  const withArgument = (o: Offer | undefined) => (o ? { ...termsInDollars(o), argument: o.rationale } : null);

  // ---------------------------------------------------------------- the agents' inputs
  let report: CrsCallRecord | undefined;
  const shareable = () => (report && n.consent ? creditFacts(report).filter((f) => n.consent!.scope.includes(f.fact) && f.available) : []);
  const summaryFor = (k: VendorExhibit) => k === "reference" ? `${sc.docs.reference.from}: ${sub.business} ${sc.docs.reference.claim}`
    : k === "invoices" ? sc.docs.invoices : k === "bank_letter" ? sc.docs.bank : "Facts from your own credit report; choose them in sharedCreditFacts";
  const vendorInput = (round: number, gatewayRejection?: string[]): VendorInput => ({
    vendorRules: { opening: inDollars(rb.vendorRules.opening), walkAway: inDollars(rb.vendorRules.walkAway), style: rb.vendorRules.style },
    exhibitsAvailable: LATER.filter((k) => allowed(k) && !played(k) && (k !== "credit_facts" || shareable().length > 0))
      .map((k) => ({ id: k, title: EXHIBIT_LABEL[k], summary: summaryFor(k) })),
    exhibitsPlayed: n.exhibits.map((e) => ({ id: e.kind, title: e.title, round: e.round })),
    verdictsSoFar: n.checks.map((c) => ({ claimId: c.claimId, claim: c.text, verdict: c.verdict, reason: c.reason })),
    creditFacts: report ? shareable().map((f) => ({ fact: f.fact, headline: f.headline, favorable: f.favorable, citations: f.citations.map(agentCitation) })) : null,
    evidence: evidence(),
    lastBuyerOffer: withArgument(lastFrom("contractor")),
    round, maxRounds: lastRound,
    ...(gatewayRejection ? { gatewayRejection } : {}),
  });
  const limitsOf = (t: TierRule) => ({ bestNetDays: t.bestNetDays, maxUpfrontPct: t.maxUpfrontPct, maxLimit: dollars(t.maxLimitCents) });
  const buyerInput = (round: number, gatewayRejection?: string[]): BuyerInput => {
    const b = rb.buyerRules, caps = n.caps!;
    const rd = lastCall("biz_risk_dashboard");
    const rec = rd ? resolveField(rd.response, REC_FIELD) : undefined;
    return {
      buyerRules: { opening: inDollars(b.opening), tierLimits: { low: limitsOf(b.tiers.low), caution: limitsOf(b.tiers.caution), blocked: limitsOf(b.tiers.blocked) },
        creditCap: { anchorOn: b.creditLimitAnchor.on, anchorPct: b.creditLimitAnchor.pct }, evidenceWeights: { ...b.evidence },
        secondApproverAbove: dollars(b.approval.secondApproverAboveCents) },
      tier: n.deal.riskTier, tierReasons: [tierReason],
      limits: { bestNetDays: caps.bestNetDays, maxUpfrontPct: caps.maxUpfrontPct, maxLimit: dollars(caps.limitCapCents) },
      evidence: evidence(),
      recommendedCreditLimit: rd && rec !== undefined ? { amount: Number(rec), citation: { callId: rd.callId, field: REC_FIELD, value: rec } } : null,
      availableChecks: [...PERSON, ...BUSINESS].filter((p) => !has(p)),
      lastVendorOffer: withArgument(lastFrom("sub")),
      history: n.deal.rounds.map((o) => ({ round: o.round, from: o.from === "sub" ? "vendor" as const : "buyer" as const, netDays: o.netDays, upfrontPct: o.depositPct, limit: dollars(o.limitCents) })),
      round, maxRounds: lastRound,
      ...(gatewayRejection ? { gatewayRejection } : {}),
    };
  };

  /** What the vendor's agent put on the table this turn: credit facts it chose to share, and the exhibit it picked. */
  async function vendorExhibits(t: VendorTurn, round: number) {
    const group: Played[] = [];
    const thought: Thought = { side: "sub", text: t.thought };
    const facts = shareable().filter((f) => t.sharedCreditFacts.includes(f.fact));
    if (facts.length && !played("credit_facts")) {
      for (const f of facts) land(factCard(f));
      const ex = creditFactsExhibit(facts, index++, round);
      group.push({ ex, thought, plans: facts.map((fact, i) => ({ kind: "fact", claim: ex.claims[i], fact })) });
    }
    const k = t.exhibit_id as Exclude<DocKind, "w9"> | null; // validated against exhibitsAvailable, which only holds later exhibits
    if (k && LATER.includes(k) && !played(k) && docJobs.has(k)) {
      const a = await agent(() => docJobs.get(k)!, round, "The document check");
      group.push({ ...docExhibit(documentExhibit(k, sc, index++, round), a), thought });
    }
    if (!group.length) return;
    await playGroup(group, round);
    checkStops(round);
    retier(round);
  }

  // ---------------------------------------------------------------- the story
  async function story() {
    // 1. The pitch
    emit({ type: "negotiation_started", at: at(), negotiationId, sub, ask, contractor: CONTRACTOR.name, rulebook: rb,
      business: { name: sc.record.legalName, einLast4: sc.record.ein.slice(-4), address: `${titleCase(sc.record.address.street)}, ${titleCase(sc.record.address.city)} ${sc.record.address.state}`,
        state: sc.record.stateOfOrigin, profile: sc.profile, simulated: true } });
    toChapter(1, `${titleCase(sub.contact)} of ${sub.business} asks ${CONTRACTOR.name} to be paid in ${ask.netDays} days, with ${ask.upfrontPct}% up front and a ${fmtUsd(ask.limitCents)} first order.`);
    // Our agent starts thinking about the opening statement first; the vendor's documents are read in the background,
    // and our agent's lines for each one are asked for as soon as it has been read.
    const opening = statement(sc, ask);
    const openingPlans: Plan[] = opening.claims.map((claim) => ({ kind: "statement", claim }));
    askLines(opening, openingPlans);
    if (allowed("w9")) prefetch("w9", w9Text(sc.docs.w9));
    for (const k of ["license", "reference", "invoices", "bank_letter"] as const) if (allowed(k)) prefetch(k, documentText(k, sc));
    for (const [k, job] of docJobs) job.then((a) => {
      const base = k === "w9" ? w9Exhibit(sc.docs.w9, "sub", 0, 1) : documentExhibit(k, sc, 0, 0);
      const pl = docExhibit(base, a);
      askLines(pl.ex, pl.plans);
    }, () => {});

    // 2. Cross-examination
    toChapter(2, "CRS cross-examines every claim the vendor makes.");
    await playGroup([{ ex: opening, plans: openingPlans }], 1);
    let w9: UploadedW9 | null = null;
    let from: "sub" | "judge" = "sub";
    if (rb.scenario.judgeUpload && opts.judge) {
      emit({ type: "upload_requested", at: at(), round: 1, draft: sc.docs.w9,
        prompt: "The vendor reaches for its W-9. Hand in your own document, edit what it claims, or let the vendor play its copy." });
      const up = await opts.judge({ round: 1, draft: sc.docs.w9 });
      if (up) { w9 = up; from = "judge"; }
    }
    if (!w9 && allowed("w9")) w9 = sc.docs.w9;
    const firstDocs: Played[] = [];
    if (w9) {
      const a = await agent(() => (from === "judge" ? analyze("w9", w9Text(w9!), false) : docJobs.get("w9")!), 1, "The document check");
      firstDocs.push(docExhibit(w9Exhibit(w9, from, index++, 1), a));
    }
    if (allowed("license")) firstDocs.push(docExhibit(documentExhibit("license", sc, index++, 1), await agent(() => docJobs.get("license")!, 1, "The document check")));
    if (firstDocs.length) await playGroup(firstDocs, 1);
    checkStops(1);
    const alert = fraudAlert(n.cards, n.calls);
    if (alert && rb.buyerRules.escalate.fraudAlert) escalate(1, alert, "escalate.fraud_alert", alert.startsWith("TransUnion") ? "TransUnion reason code 2401" : "Fraud Shields victim statement");

    // 3. Risk tier
    toChapter(3, "The risk level decides how far we can go on every offer.");
    const ours = (text: string): Thought => ({ side: "contractor", text });
    if (!has("pitchpoint")) await pull("pitchpoint", undefined, ours("Before I decide the risk level: any liens, judgments or bankruptcies on file?"));
    if (!has("biz_risk_dashboard")) await pull("biz_risk_dashboard", undefined, ours("This one sets my limits: how does the business pay its other suppliers, and what limit does Risk Dashboard recommend?"));
    if (!has("biz_fraud_shields")) await pull("biz_fraud_shields", undefined, ours("One more look before the tier: any OFAC match, and is the business actually active?"));
    checkStops(1);
    const { tier, reason } = tierNow();
    const caps = capsFor(tier, rb, n.calls);
    const said = setTier(tier, reason, caps);
    rule(`tier.${tier}` as RuleId, "", 1, said);
    if (caps.anchor) rule("anchor", caps.limitCapCents < caps.anchor.capCents ? "the risk level's own limit is lower" : "", 1, said);
    if (caps.limitCapCents <= 0) end(1, [noRoom(tier)]);

    // 4. Negotiation
    toChapter(4, `Every offer is checked against the rulebook: ${capsLine(caps)}.`);
    if (allowed("credit_facts")) {
      if (!n.consent) rule("consent", "", 1);
      else {
        report = await pull("credit_report");
        emit({ type: "report_held", at: at(), side: "sub", callId: report.callId,
          reason: "The vendor's own TransUnion report, pulled with its signed consent. It stays face down; its agent shares only the facts it chooses." });
      }
    }
    judgeAhead();
    for (let round = 1; round <= lastRound; round++) {
      let vt = await agent(() => vendorStrategist(llm, vendorInput(round), n.calls), round, "The vendor's agent");
      await vendorExhibits(vt, round);
      let s!: Offer;
      for (let attempt = 1; ; attempt++) {
        if (vt.action === "walk_away") endedBy(round, `${sub.business} walks away: ${vt.argument}`);
        const theirs = lastFrom("contractor");
        const terms = vt.action === "accept" && theirs ? termsInDollars(theirs) : vt.offer!;
        const o = toOffer("sub", round, terms, vt.citations, vt.argument, n.cards.filter((c) => c.shared).flatMap((c) => c.citations));
        const res = gate(o, { side: "sub", text: vt.thought });
        if (res.ok) { s = o; break; }
        if (attempt === 2) escalate(round, "The vendor's offer failed the rule check twice.");
        vt = await agent(() => vendorStrategist(llm, vendorInput(round, res.reasons), n.calls), round, "The vendor's agent");
      }
      const ours = [...n.deal.rounds].reverse().find((o) => o.from === "contractor" && o !== s);
      if (ours && sameTerms(s, ours)) close(s);

      let bt: BuyerTurn = await agent(() => buyerNegotiator(llm, buyerInput(round), n.calls), round, "Our agent");
      if (bt.request_checks.length) {
        for (const p of bt.request_checks) if (!has(p as CrsCallProduct)) await pull(p as CrsCallProduct, undefined, { side: "contractor", text: bt.thought });
        checkStops(round);
        retier(round);
      }
      for (let attempt = 1; ; attempt++) {
        if (bt.action === "end_talks") endedBy(round, `${CONTRACTOR.name} ends the talks: ${bt.argument}`);
        if (bt.action === "escalate") escalate(round, bt.argument);
        const terms = bt.action === "accept" ? termsInDollars(s) : bt.offer!;
        const c = toOffer("contractor", round, terms, bt.citations, bt.argument);
        const res = gate(c, { side: "contractor", text: bt.thought });
        if (res.ok) { if (sameTerms(c, s)) close(c); break; }
        if (attempt === 2) escalate(round, "Our agent's offer failed the rule check twice.");
        bt = await agent(() => buyerNegotiator(llm, buyerInput(round, res.reasons), n.calls), round, "Our agent");
      }
    }
    if (rb.buyerRules.escalate.noDeal.on)
      escalate(lastRound, `No deal after ${lastRound} round${lastRound > 1 ? "s" : ""}. A person decides.`, "escalate.no_deal", `${lastRound} round${lastRound > 1 ? "s" : ""}`);
    end(lastRound, [{ ruleId: "rounds.max", text: ruleText("rounds.max", rb), detail: `${lastRound} rounds, no deal` }]);
  }

  /** 5. The clerk's paperwork for the controller. It doesn't change the outcome; if it fails, the deal stands without it. */
  async function paperwork() {
    const agreed = n.deal.status === "agreed";
    const last = n.deal.rounds.at(-1);
    const rank = (c: Card) => (agreed ? ["good", "neutral", "warn", "bad"] : ["bad", "warn", "neutral", "good"]).indexOf(c.tone);
    try {
      n.closing = await closePaperwork(llm, {
        mode: "close",
        outcome: agreed ? "agreed" : n.deal.status === "escalated" ? "escalated" : "talks_ended",
        finalTerms: agreed && last ? { ...termsInDollars(last), upfrontAmount: dollars(n.depositCents ?? 0), approversNeeded: n.approversNeeded ?? 1 } : null,
        vendor: { business: sub.business, trade: sub.trade, scope: sub.scope },
        owner: { persona: sub.persona, name: titleCase(sub.contact) },
        keyEvidence: [...n.cards].filter((c) => c.citations.length).sort((a, b) => rank(a) - rank(b)).slice(0, 8)
          .map((c) => ({ ...agentCitation(c.citations[0]), fact: c.headline })),
        rulesApplied: [...new Set(rulesApplied)],
      }, n.calls);
    } catch (e) {
      log(`Closing paperwork unavailable: ${(e as Error).message}`);
    }
  }

  try {
    await story();
  } catch (e) {
    if (e !== DONE) { await queue.catch(() => {}); throw e; }
  }
  await paperwork();
  await queue;
  return n;
}

const inDollars = (t: { netDays: number; upfrontPct: number; limitCents: number }) => ({ netDays: t.netDays, upfrontPct: t.upfrontPct, limit: dollars(t.limitCents) });
