// The document duel: the vendor's agent argues and plays exhibits, and CRS cross-examines every claim.
// Each claim says which CRS products can test it; examine() returns VERIFIED, CONTRADICTED or UNVERIFIED with the
// citations and cards it rests on. A claim nothing in CRS can test stays UNVERIFIED: no source, no credit.

import { fmtUsd, maskLast4, type Ask, type Card, type Citation, type Claim, type ClaimTopic, type CreditFact, type CrsCallProduct,
  type CrsCallRecord, type Exhibit, type SubProfile, type UploadedW9, type Verdict, type VendorExhibit } from "@terms-room/shared";
import { titleCase } from "./cast.ts";
import { cite, creditFacts, daysBetween } from "./facts.ts";
import type { ScenarioCase } from "./scenarios.ts";
import { FACT_LABEL } from "./rulebook.ts";

const LETTER = "ABCDEFGH";
const phoneFmt = (p: string) => p.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function statement(sc: ScenarioCase, ask: Ask): Exhibit {
  const s = sc.sub;
  const who = titleCase(s.contact);
  return {
    id: "ex-statement", kind: "statement", label: "Opening statement", title: `${who}, for ${s.business}`, from: "sub", round: 1,
    argument: `I'm ${who}, owner of ${s.business}. ${s.trade} since ${sc.docs.licenseSince}. We're asking to be paid within ${ask.netDays} days, with ${ask.upfrontPct}% up front and a ${fmtUsd(ask.limitCents)} first order.`,
    claims: [
      { id: "s-identity", topic: "identity", text: `I'm ${who}.` },
      { id: "s-contact", topic: "contact", text: `${phoneFmt(s.phone)} and ${s.email} are mine.` },
      { id: "s-company", topic: "company", text: `I own ${s.business}.` },
      { id: "s-records", topic: "records", text: "No liens, judgments or bankruptcies against me." },
    ],
  };
}

export function w9Exhibit(w: UploadedW9, from: "sub" | "judge", index: number, round: number): Exhibit {
  const ein = maskLast4(w.ein);
  return {
    id: `ex-w9-${from}`, kind: "w9", label: `Exhibit ${LETTER[index]}`, title: "Form W-9", from, round,
    argument: from === "judge" ? "The judge hands in a W-9. CRS checks it like any other exhibit." : "Here's our W-9.",
    claims: [
      { id: `${from}-w9-name`, topic: "legal_name", text: `Legal name: ${titleCase(w.legalName)}`, value: w.legalName },
      { id: `${from}-w9-ein`, topic: "ein", text: `EIN ${ein}`, value: w.ein },
      { id: `${from}-w9-address`, topic: "address", text: `Address: ${w.address}`, value: w.address },
    ],
    fields: [["Name", w.legalName], ["EIN", ein], ["Address", w.address], ["Signed", w.signer]],
    fileName: w.fileName,
  };
}

export function documentExhibit(kind: Exclude<VendorExhibit, "w9" | "credit_facts">, sc: ScenarioCase, index: number, round: number): Exhibit {
  const d = sc.docs, b = sc.sub.business;
  const label = `Exhibit ${LETTER[index]}`;
  switch (kind) {
    case "license":
      return { id: "ex-license", kind, label, title: "Business license", from: "sub", round, argument: `Our license. We've been licensed since ${d.licenseSince}.`,
        claims: [{ id: "license-standing", topic: "standing", text: `Licensed and in business since ${d.licenseSince}.`, value: String(d.licenseSince) }],
        fields: [["Licensee", b], ["Since", String(d.licenseSince)], ["Status", "Active"]] };
    case "reference":
      return { id: "ex-reference", kind, label, title: "Reference letter", from: "sub", round, argument: `${d.reference.from} will vouch for us.`,
        claims: [{ id: "reference-pays", topic: "pays_on_time", text: `${b} ${d.reference.claim}. (${d.reference.from})` }],
        fields: [["From", d.reference.from], ["Says", `${b} ${d.reference.claim}`]] };
    case "invoices":
      return { id: "ex-invoices", kind, label, title: "Past invoices", from: "sub", round, argument: "Our track record speaks for itself.",
        claims: [{ id: "invoices-volume", topic: "volume", text: `${d.invoices}.` }], fields: [["Summary", d.invoices]] };
    case "bank_letter":
      return { id: "ex-bank", kind, label, title: "Bank letter", from: "sub", round, argument: "Our bank confirms we're good for it.",
        claims: [{ id: "bank-balance", topic: "bank_balance", text: `${d.bank}.` }], fields: [["Bank says", d.bank]] };
  }
}

export function creditFactsExhibit(shared: { fact: CreditFact; headline: string }[], index: number, round: number): Exhibit {
  return {
    id: "ex-credit", kind: "credit_facts", label: `Exhibit ${LETTER[index]}`, title: "Credit facts, shared with consent", from: "sub", round,
    argument: `From my own credit report, with my consent: ${shared.map((s) => s.headline.toLowerCase()).join(", ")}. The rest of the report stays with me.`,
    claims: shared.map((s) => ({ id: `credit-${s.fact}`, topic: s.fact, text: s.headline })),
    fields: shared.map((s) => [FACT_LABEL[s.fact], s.headline] as [string, string]),
  };
}

/** The CRS products that can test a claim. The engine pulls whichever aren't in the log yet. */
export function productsFor(topic: ClaimTopic): CrsCallProduct[] {
  switch (topic) {
    case "identity": return ["tu_idv"];
    case "contact": return ["reverse_phone", "fraud_finder"];
    case "company": return ["biz_quick_search", "biz_registration"];
    case "records": return ["pitchpoint"];
    case "legal_name": case "standing": return ["biz_registration"];
    case "ein": case "address": return ["biz_fraud_shields"];
    case "pays_on_time": return ["biz_risk_dashboard"];
    case "volume": case "bank_balance": return [];
    default: return ["credit_report"]; // credit facts
  }
}

export interface Examined { verdict: Verdict; reason: string; citations: Citation[]; cardIds: string[] }

const findCard = (cards: Card[], prefix: string) => cards.find((c) => c.id === prefix || c.id.startsWith(prefix + "-"));
const lastCall = (calls: CrsCallRecord[], p: CrsCallProduct) => [...calls].reverse().find((c) => c.product === p);
const verdict = (v: Verdict, reason: string, cards: (Card | undefined)[], extra: Citation[] = []): Examined => {
  const cs = cards.filter((c): c is Card => !!c);
  return { verdict: v, reason, citations: [...cs.flatMap((c) => c.citations), ...extra], cardIds: cs.map((c) => c.id) };
};

/** Cross-examine one claim against what CRS returned. Pure: same log in, same verdict out. */
export function examine(claim: Claim, sub: SubProfile, calls: CrsCallRecord[], cards: Card[]): Examined {
  const c = (p: string) => findCard(cards, p);
  switch (claim.topic) {
    case "identity": {
      if (c("idv-verified")) return verdict("verified", "TransUnion matched name, SSN, date of birth and address. No reason codes.", [c("idv-verified")]);
      if (c("idv-step-up")) return verdict("unverified", "Identity matches, but a fraud alert is on file (2401). It needs a step-up check we can't run here.", [c("idv-step-up")]);
      return verdict("contradicted", `TransUnion returned ${c("idv-failed")?.headline.replace("Identity failed · ", "reason codes ") ?? "reason codes"}: ${c("idv-failed")?.detail.toLowerCase()}`, [c("idv-failed")]);
    }
    case "contact": {
      const someone = c("phone-someone-else");
      if (someone) return verdict("contradicted", `${someone.headline}, not ${titleCase(sub.contact)}.`, [someone, c("ff-score")]);
      const flags = ["ff-email-new", "ff-voip", "ff-phone-owner"].map(c).filter(Boolean) as Card[];
      if (flags.length) return verdict("contradicted", `${flags.map((f) => f.headline).join("; ")}.`, [...flags, c("phone-no-record")]);
      if (c("phone-no-record")) return verdict("unverified", "Nobody is on record for that phone, so it can't be tied to them.", [c("phone-no-record"), c("ff-score")]);
      return verdict("verified", `${c("phone-match")?.headline}, and Fraud Finder scores the email and phone ${c("ff-score")?.headline.replace("Fraud risk ", "")}.`, [c("phone-match"), c("ff-score")]);
    }
    case "company": {
      const look = c("qs-look-alike");
      if (look) return verdict("contradicted", `Quick Search finds an older business with nearly this name: ${titleCase(look.citations[0].value)}, est. ${look.citations[1].value}.`, [look]);
      const reg = lastCall(calls, "biz_registration");
      const officer = (reg?.response as any)?.results?.corporateRegistration?.officers?.[0]?.name as string | undefined;
      const regCard = cards.find((x) => x.id.startsWith("reg-"));
      if (reg && officer && norm(officer) !== norm(sub.contact))
        return verdict("contradicted", `The registered officer is ${titleCase(officer)}.`, [regCard], [cite(reg, "biz_registration", "results.corporateRegistration.officers[0].name")]);
      return verdict("verified", `Quick Search finds it and the registration lists ${titleCase(sub.contact)} as officer.`, [c("qs-found"), regCard],
        reg ? [cite(reg, "biz_registration", "results.corporateRegistration.officers[0].name")] : []);
    }
    case "records": {
      if (c("pp-clean")) return verdict("verified", "PitchPoint has no bankruptcies, liens or judgments on file.", [c("pp-clean")]);
      const recs = cards.filter((x) => x.product === "pitchpoint" && x.tone !== "good");
      return verdict("contradicted", `PitchPoint shows ${recs.map((x) => x.headline.toLowerCase()).join(" and ")}.`, recs);
    }
    case "legal_name": {
      const reg = lastCall(calls, "biz_registration")!;
      const name = (reg.response as any).results.businessHeader.businessName as string;
      const regCard = cards.find((x) => x.id.startsWith("reg-"));
      const ok = norm(name) === norm(claim.value ?? "");
      return verdict(ok ? "verified" : "contradicted", ok ? `Registered as ${titleCase(name)}.` : `Registered as ${titleCase(name)}, not ${titleCase(claim.value ?? "")}.`,
        [regCard], [cite(reg, "biz_registration", "results.businessHeader.businessName")]);
    }
    case "ein": {
      const fs = lastCall(calls, "biz_fraud_shields")!;
      const ok = (fs.response as any).results.fraudShields.taxIdMatchIndicator === true;
      const card = cards.find((x) => x.id.startsWith(ok ? "fs-clear" : "fs-ein-mismatch") && x.citations.some((k) => k.callId === fs.callId));
      return verdict(ok ? "verified" : "contradicted", ok ? "Fraud Shields matches the EIN to this business." : `Fraud Shields: EIN ${maskLast4(claim.value ?? "")} doesn't belong to this business.`,
        [card], [cite(fs, "biz_fraud_shields", "results.fraudShields.taxIdMatchIndicator")]);
    }
    case "address": {
      const fs = lastCall(calls, "biz_fraud_shields")!;
      const ok = (fs.response as any).results.fraudShields.addressMatchIndicator === true;
      const card = cards.find((x) => x.id.startsWith(ok ? "fs-clear" : "fs-address-mismatch") && x.citations.some((k) => k.callId === fs.callId));
      const street = (fs.response as any).results.businessHeader.address;
      return verdict(ok ? "verified" : "contradicted", ok ? "Fraud Shields matches the address." : `The business is registered at ${titleCase(street.street)}, ${titleCase(street.city)} ${street.state}.`,
        [card], [cite(fs, "biz_fraud_shields", "results.fraudShields.addressMatchIndicator")]);
    }
    case "standing": {
      const reg = lastCall(calls, "biz_registration")!;
      const r = (reg.response as any).results.corporateRegistration;
      const regCard = cards.find((x) => x.id.startsWith("reg-"));
      const year = Number(r.incorporatedDate.slice(0, 4));
      if (r.statusDescription !== "ACTIVE") return verdict("contradicted", `The registration is ${r.statusDescription.toLowerCase()}.`, [regCard]);
      if (year > Number(claim.value)) return verdict("contradicted", `Registered ${r.incorporatedDate} (${daysBetween(r.incorporatedDate, reg.at)} days ago), not ${claim.value}.`, [regCard]);
      return verdict("verified", `Registered ${r.incorporatedDate} and active.`, [regCard]);
    }
    case "pays_on_time": {
      const rd = lastCall(calls, "biz_risk_dashboard")!;
      const dbt = Number((rd.response as any).results.paymentPerformance.currentDbt);
      const citation = cite(rd, "biz_risk_dashboard", "results.paymentPerformance.currentDbt");
      if (dbt <= 10) return verdict("verified", `Risk Dashboard: ${dbt} days beyond terms. They pay on time.`, [], [citation]);
      if (dbt > 15) return verdict("contradicted", `Risk Dashboard: they pay ${dbt} days beyond terms.`, [c("rd-dbt")], c("rd-dbt") ? [] : [citation]);
      return verdict("unverified", `Risk Dashboard: ${dbt} days beyond terms. Not clearly on time or late.`, [], [citation]);
    }
    case "volume":
      return verdict("unverified", "CRS has no source for past invoices, so this stays unverified.", []);
    case "bank_balance":
      return verdict("unverified", "CRS has no bank data, so this stays unverified.", []);
    default: {
      const report = lastCall(calls, "credit_report");
      const f = report ? creditFacts(report).find((x) => x.fact === claim.topic) : undefined;
      const card = cards.find((x) => x.id === `fact-${claim.topic}`);
      if (!f || !f.available) return verdict("unverified", "The vendor's report has nothing on this.", [card]);
      return verdict(f.favorable ? "verified" : "contradicted", `${f.headline}, from the vendor's own TransUnion report (shared with consent).`, [card], card ? [] : f.citations);
    }
  }
}

/** The vendor's agent shares a credit fact only if consent allows it and it helps. The rest stays with the vendor. */
export function factsToShare(report: CrsCallRecord, allowed: CreditFact[]) {
  const all = creditFacts(report);
  return {
    shared: all.filter((f) => allowed.includes(f.fact) && f.available && f.favorable),
    withheld: all.filter((f) => allowed.includes(f.fact) && !(f.available && f.favorable)),
  };
}

export function factCard(f: ReturnType<typeof creditFacts>[number]): Card {
  return { id: `fact-${f.fact}`, side: "sub", product: "credit_fact", source: "live", title: "Credit fact · shared with consent",
    headline: f.headline, detail: `From the vendor's own TransUnion report. Only this fact leaves the vendor's side; the report stays face down.`,
    tone: "good", trustDelta: 0, citations: f.citations, shared: true };
}
