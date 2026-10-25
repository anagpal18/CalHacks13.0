// Turn stored CRS responses into the cards that land on The Table, and the vendor's own report into the credit
// facts it may choose to share. Every card's citations point at a real field in the logged response, so the
// gateway can check them. Trust doesn't move here: it moves by verdicts on the vendor's claims (duel.ts).

import { fmtUsd, type Card, type Citation, type CreditFact, type CrsCallRecord, type CrsProduct, type SubProfile } from "@terms-room/shared";
import { asList, resolveField } from "./path.ts";

const IDV_CODES: Record<string, string> = {
  "2101": "address doesn't match the file",
  "2201": "SSN isn't associated with this name",
  "2202": "date of birth doesn't match the file",
  "2301": "SSN belongs to a deceased person",
  "2401": "fraud alert on file, step-up recommended",
};

export function cite(call: CrsCallRecord, product: CrsProduct, field: string): Citation {
  const value = resolveField(call.response, field);
  if (value === undefined) throw new Error(`Field ${field} is missing from CRS call ${call.callId}`);
  return { product, field, value, callId: call.callId };
}

export const daysBetween = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\b(Llc|Llp|Lp)\b/g, (m) => m.toUpperCase());
const pad2 = (n: unknown) => String(n).padStart(2, "0");
const ppDate = (d: { year?: unknown; month?: unknown; day?: unknown } | undefined) =>
  d ? `${d.year}-${pad2(d.month)}-${pad2(d.day)}` : "date unknown";
const tag = (call: CrsCallRecord) => call.callId.slice(4, 8);

export function cardsFor(call: CrsCallRecord, sub: SubProfile): Card[] {
  const side = call.side;
  const live = { side, source: "live" as const, trustDelta: 0 };
  const sim = { side, source: "simulated" as const, trustDelta: 0 };
  const r = call.response as any;
  switch (call.product) {
    case "tu_idv": {
      const base = "addOnProducts[0].idManagerVerification.messages";
      const msgs = (r.addOnProducts?.[0]?.idManagerVerification?.messages ?? []) as { code: string; text: string }[];
      const t = "TU identity verification";
      if (!msgs.length)
        return [{ ...live, id: "idv-verified", product: "tu_idv", title: t, headline: "Identity verified",
          detail: "Name, SSN, date of birth and address belong together. No reason codes returned.",
          tone: "good", citations: [cite(call, "tu_idv", `${base}.length`)] }];
      if (msgs.every((m) => m.code === "2401"))
        return [{ ...live, id: "idv-step-up", product: "tu_idv", title: t, headline: "Step-up required · 2401",
          detail: "Identity matches, but a fraud alert is on file. TransUnion recommends a knowledge quiz or one-time passcode before credit is extended.",
          tone: "warn", citations: [cite(call, "tu_idv", `${base}[0].code`)] }];
      return [{ ...live, id: "idv-failed", product: "tu_idv", title: t,
        headline: `Identity failed · ${msgs.map((m) => m.code).join(" ")}`,
        detail: msgs.map((m) => `${IDV_CODES[m.code] ?? m.text.toLowerCase()} (${m.code})`).join("; ").replace(/^./, (c) => c.toUpperCase()) + ".",
        tone: "bad", citations: msgs.map((_, i) => cite(call, "tu_idv", `${base}[${i}].code`)) }];
    }

    case "fraud_finder": {
      const score = Number(r.risk.score);
      const t = "Fraud Finder · AtData";
      const tone = score <= 20 ? "good" : score <= 60 ? "warn" : "bad";
      const cards: Card[] = [{ ...live, id: "ff-score", product: "fraud_finder", title: t, headline: `Fraud risk ${score}/100`,
        detail: tone === "good" ? "Low risk across the email, phone and IP address."
          : tone === "warn" ? "Medium risk. Not enough to stop talks on its own."
          : "High risk. AtData suggests a cut-off around 70 to 80.",
        tone, citations: [cite(call, "fraud_finder", "risk.score")] }];
      const seen = r.eam?.date_first_seen as string | undefined;
      if (seen && daysBetween(seen, call.at) < 30)
        cards.push({ ...live, id: "ff-email-new", product: "fraud_finder", title: t, headline: `Email is ${daysBetween(seen, call.at)} days old`,
          detail: `First seen ${seen}. A brand-new address is a common sign of a synthetic identity.`,
          tone: "bad", citations: [cite(call, "fraud_finder", "eam.date_first_seen")] });
      if (r.risk.phone?.line_type === "voip")
        cards.push({ ...live, id: "ff-voip", product: "fraud_finder", title: t,
          headline: r.risk.phone.prepaid ? "Phone is prepaid VoIP" : "Phone is VoIP",
          detail: "Internet phone numbers are cheap to create and hard to trace back to a person.",
          tone: "bad", citations: [cite(call, "fraud_finder", "risk.phone.line_type")] });
      if (r.risk.phone?.owner?.last_name_match === "no_match")
        cards.push({ ...live, id: "ff-phone-owner", product: "fraud_finder", title: t, headline: "Phone isn't in their name",
          detail: "The phone's registered owner doesn't match the name or address on the application.",
          tone: "bad", citations: [cite(call, "fraud_finder", "risk.phone.owner.last_name_match")] });
      if (r.risk.postal?.ip_postal_distance === "> 1000 miles")
        cards.push({ ...live, id: "ff-ip-far", product: "fraud_finder", title: t, headline: "IP is 1,000+ miles away",
          detail: "The device applying is more than 1,000 miles from the address given.",
          tone: "bad", citations: [cite(call, "fraud_finder", "risk.postal.ip_postal_distance")] });
      return cards;
    }

    case "reverse_phone": {
      const recs = (r.data?.records ?? []) as { firstName: string; lastName: string; address: string; city: string; state: string }[];
      const t = "Reverse phone · AccurateAppend";
      const phone = sub.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
      if (!recs.length)
        return [{ ...live, id: "phone-no-record", product: "reverse_phone", title: t, headline: "No owner on record",
          detail: `Nobody is on record for ${phone}, so we can't confirm the number belongs to ${title(sub.contact)}.`,
          tone: "bad", citations: [cite(call, "reverse_phone", "data.records.length")] }];
      const r0 = recs[0];
      const [first, ...rest] = sub.contact.split(" ");
      const match = r0.firstName === first && r0.lastName === rest.join(" ");
      const who = `${r0.firstName} ${r0.lastName}`;
      return [{ ...live, id: match ? "phone-match" : "phone-someone-else", product: "reverse_phone", title: t,
        headline: `Phone belongs to ${title(who)}`,
        detail: match ? `${phone} is registered to ${title(who)} at ${title(r0.address)}, ${title(r0.city)} ${r0.state}.`
          : `${phone} is registered to someone else: ${title(who)} at ${title(r0.address)}, ${title(r0.city)} ${r0.state}.`,
        tone: match ? "good" : "bad",
        citations: [cite(call, "reverse_phone", "data.records[0].firstName"), cite(call, "reverse_phone", "data.records[0].lastName")] }];
    }

    case "pitchpoint": {
      const rep = r.DetailedBLJReport;
      const t = "PitchPoint · bankruptcies, liens & judgments";
      const base = "DetailedBLJReport";
      if (!rep.BankruptciesFound && !rep.JudgmentsFound && !rep.LiensFound)
        return [{ ...live, id: "pp-clean", product: "pitchpoint", title: t, headline: "No bankruptcies, liens or judgments",
          detail: "Nothing on file within the FCRA reporting windows.", tone: "good",
          citations: ["BankruptciesFound", "JudgmentsFound", "LiensFound"].map((f) => cite(call, "pitchpoint", `${base}.${f}`)) }];
      const cards: Card[] = [];
      const liens = asList(rep.Results?.Liens?.LienRecord);
      liens.forEach((l: any, i: number) => {
        const path = `${base}.Results.Liens.LienRecord${liens.length > 1 ? `[${i}]` : ""}.TotalLienAmount`;
        cards.push({ ...live, id: `pp-lien-${i}`, product: "pitchpoint", title: t,
          headline: `${l.KindOfTax === "ST" ? "State tax lien" : "Lien"} ${fmtUsd(Number(l.TotalLienAmount) * 100)}`,
          detail: `${title(l.Plaintiff?.Name?.UnparsedName ?? "Unknown")} · ${l.Status} · filed ${ppDate(l.FilingDate)} · ${l.FilingLocation}.`,
          tone: "warn", citations: [cite(call, "pitchpoint", path)] });
      });
      const judgments = asList(rep.Results?.Judgments?.JudgmentRecord);
      judgments.forEach((j: any, i: number) => {
        const path = `${base}.Results.Judgments.JudgmentRecord${judgments.length > 1 ? `[${i}]` : ""}.TotalJudgmentAmount`;
        cards.push({ ...live, id: `pp-judgment-${i}`, product: "pitchpoint", title: t,
          headline: `${sentence(j.JudgmentType ?? "Judgment")} ${fmtUsd(Number(j.TotalJudgmentAmount) * 100)}`,
          detail: `${title(j.Plaintiff?.Name?.UnparsedName ?? "Unknown")} v. ${title(j.Defendant?.Name?.UnparsedName ?? sub.contact)} · ${j.Status} · filed ${ppDate(j.FilingDate)} · ${j.FilingLocation}.`,
          tone: "warn", citations: [cite(call, "pitchpoint", path)] });
      });
      asList(rep.Results?.Bankruptcies?.BankruptcyRecord).forEach((b: any, i: number, all) => {
        const path = `${base}.Results.Bankruptcies.BankruptcyRecord${all.length > 1 ? `[${i}]` : ""}.Chapter`;
        cards.push({ ...live, id: `pp-bankruptcy-${i}`, product: "pitchpoint", title: t,
          headline: `Chapter ${b.Chapter} bankruptcy`, detail: `${b.Status} · filed ${ppDate(b.FilingDate)} · ${b.FilingLocation}.`,
          tone: "warn", citations: [cite(call, "pitchpoint", path)] });
      });
      return cards;
    }

    case "credit_report":
      return []; // the vendor's report stays face down; only the facts it chooses to share become cards (creditFacts)

    case "biz_quick_search": {
      const t = "Quick Search · business";
      const self = r.results[0];
      if (r.lookAlikeIndicator) {
        const other = r.results[1];
        return [{ ...sim, id: "qs-look-alike", product: "biz_quick_search", title: t, headline: "Look-alike of an older business",
          detail: `${title(other.businessName)} (${title(other.address.city)}, est. ${other.yearOfIncorporation}) has nearly the same name. This one, ${title(self.businessName)}, was filed in ${self.yearOfIncorporation}.`,
          tone: "bad", citations: [cite(call, "biz_quick_search", "results[1].businessName"), cite(call, "biz_quick_search", "results[1].yearOfIncorporation")] }];
      }
      return [{ ...sim, id: "qs-found", product: "biz_quick_search", title: t, headline: `${title(self.businessName)} found`,
        detail: `One match, ${title(self.address.city)} ${self.address.state}, ${self.numberOfTradelines} trade lines on file.`,
        tone: "good", citations: [cite(call, "biz_quick_search", "results[0].bin"), cite(call, "biz_quick_search", "results.length")] }];
    }

    case "biz_registration": {
      const reg = r.results.corporateRegistration;
      const t = "Registration · secretary of state";
      const age = daysBetween(reg.incorporatedDate, call.at);
      const active = reg.statusDescription === "ACTIVE";
      const tone = !active || age < 90 ? "bad" : age < 730 ? "warn" : "good";
      return [{ ...sim, id: active ? (age < 90 ? "reg-new" : age < 730 ? "reg-young" : "reg-active") : "reg-inactive", product: "biz_registration", title: t,
        headline: !active ? `Registration ${title(reg.statusDescription)}` : age < 90 ? `Registered ${age} days ago` : `Registered ${reg.incorporatedDate.slice(0, 4)} · active`,
        detail: `${title(reg.businessType)} filed in ${reg.stateOfOrigin} on ${reg.incorporatedDate}. Officer: ${title(reg.officers[0]?.name ?? "none listed")}.`,
        tone, citations: [cite(call, "biz_registration", "results.corporateRegistration.incorporatedDate"), cite(call, "biz_registration", "results.corporateRegistration.statusDescription")] }];
    }

    case "biz_fraud_shields": {
      const fs = r.results.fraudShields;
      const t = "Fraud Shields · business";
      const base = "results.fraudShields";
      const cards: Card[] = [];
      if (fs.ofacMatchWarning)
        cards.push({ ...sim, id: `fs-ofac-${tag(call)}`, product: "biz_fraud_shields", title: t, headline: "OFAC possible match",
          detail: `${fs.ofacMatchDescription}. A person has to clear this before any business is done.`, tone: "bad",
          citations: [cite(call, "biz_fraud_shields", `${base}.ofacMatchWarning`)] });
      if (fs.taxIdMatchIndicator === false)
        cards.push({ ...sim, id: `fs-ein-mismatch-${tag(call)}`, product: "biz_fraud_shields", title: t, headline: "EIN doesn't match",
          detail: `The EIN given doesn't belong to ${title(r.results.businessHeader.businessName)}.`, tone: "bad",
          citations: [cite(call, "biz_fraud_shields", `${base}.taxIdMatchIndicator`)] });
      if (fs.addressMatchIndicator === false)
        cards.push({ ...sim, id: `fs-address-mismatch-${tag(call)}`, product: "biz_fraud_shields", title: t, headline: "Address doesn't match",
          detail: `The registered address is ${title(r.results.businessHeader.address.street)}, ${title(r.results.businessHeader.address.city)}.`, tone: "bad",
          citations: [cite(call, "biz_fraud_shields", `${base}.addressMatchIndicator`)] });
      if (!fs.activeBusinessIndicator)
        cards.push({ ...sim, id: `fs-inactive-${tag(call)}`, product: "biz_fraud_shields", title: t, headline: "Business not active",
          detail: "Fraud Shields doesn't show this business as active.", tone: "bad", citations: [cite(call, "biz_fraud_shields", `${base}.activeBusinessIndicator`)] });
      if (!cards.length)
        cards.push({ ...sim, id: `fs-clear-${tag(call)}`, product: "biz_fraud_shields", title: t,
          headline: fs.taxIdMatchIndicator ? "EIN and address match" : "No OFAC match · active",
          detail: fs.taxIdMatchIndicator ? "The EIN and address on the W-9 match the business record. No OFAC match." : "Active business, no OFAC match, no victim statement.",
          tone: "good", citations: [cite(call, "biz_fraud_shields", `${base}.ofacMatchWarning`),
            ...(fs.taxIdMatchIndicator ? [cite(call, "biz_fraud_shields", `${base}.taxIdMatchIndicator`)] : [cite(call, "biz_fraud_shields", `${base}.activeBusinessIndicator`)])] });
      return cards;
    }

    case "biz_risk_dashboard": {
      const res = r.results;
      const t = "Risk Dashboard · business credit";
      const cards: Card[] = [];
      if (res.intelliscore) {
        const c = res.intelliscore.riskClass.code;
        cards.push({ ...sim, id: "rd-score", product: "biz_risk_dashboard", title: t, headline: `Intelliscore ${res.intelliscore.score} · ${res.intelliscore.riskClass.definition.toLowerCase()} risk`,
          detail: `${res.intelliscore.modelTitle.replace(/\b\w+/g, (w: string) => (w === "V2" ? w : title(w)))}, ${res.intelliscore.percentileRanking}th percentile.`,
          tone: c <= 2 ? "good" : c === 3 ? "warn" : "bad", citations: [cite(call, "biz_risk_dashboard", "results.intelliscore.score")] });
      } else {
        cards.push({ ...sim, id: "rd-thin", product: "biz_risk_dashboard", title: t, headline: "No business credit history",
          detail: "No Intelliscore and no recommended limit: there are no trade lines to score.", tone: "bad",
          citations: [cite(call, "biz_risk_dashboard", "results.paymentPerformance.tradelineCount")] });
      }
      const dbt = res.paymentPerformance.currentDbt;
      if (dbt > 10)
        cards.push({ ...sim, id: "rd-dbt", product: "biz_risk_dashboard", title: t, headline: `Pays ${dbt} days beyond terms`,
          detail: `Days beyond terms: ${dbt} now, ${res.paymentPerformance.monthlyAverageDbt} on average, ${res.paymentPerformance.highestDbt6Months} at worst in six months. A slow payer.`,
          tone: dbt > 30 ? "bad" : "warn", citations: [cite(call, "biz_risk_dashboard", "results.paymentPerformance.currentDbt")] });
      if (res.uccFilings.cautionaryUccIndicator || res.uccFilings.count >= 8)
        cards.push({ ...sim, id: "rd-ucc", product: "biz_risk_dashboard", title: t, headline: `${res.uccFilings.count} UCC filings`,
          detail: "Lenders have filed liens on the business's assets, including cautionary filings.", tone: "warn",
          citations: [cite(call, "biz_risk_dashboard", "results.uccFilings.count")] });
      const rec = res.creditLimitRecommendation.recommendedCreditLimitAmount;
      if (rec !== null)
        cards.push({ ...sim, id: "rd-limit", product: "biz_risk_dashboard", title: t, headline: `Recommended limit ${fmtUsd(rec * 100)}`,
          detail: "Risk Dashboard's recommended credit limit. The credit-limit anchor caps our first order against it.", tone: "neutral",
          citations: [cite(call, "biz_risk_dashboard", "results.creditLimitRecommendation.recommendedCreditLimitAmount")] });
      return cards;
    }
  }
}

// ---------------------------------------------------------------- the vendor's own credit facts

export interface CreditFactCheck { fact: CreditFact; available: boolean; favorable: boolean; headline: string; citations: Citation[] }

/** What the vendor's report says on each fact. The vendor's agent shares only allowed, favorable ones. */
export function creditFacts(call: CrsCallRecord): CreditFactCheck[] {
  const r = call.response as any;
  const d = r.summaries?.derogatorySummary ?? {};
  const ts = r.summaries?.tradeSummary ?? {};
  const out: CreditFactCheck[] = [];
  const c = (field: string) => cite(call, "credit_fact", field);
  const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  if (has(d, "_30DayLates")) {
    const lates = Number(d._30DayLates) + Number(d._60DayLates) + Number(d._90DayLates);
    out.push({ fact: "no_late_payments", available: true, favorable: lates === 0, headline: lates === 0 ? "No late payments on file" : `${lates} late payments on file`,
      citations: ["_30DayLates", "_60DayLates", "_90DayLates"].map((k) => c(`summaries.derogatorySummary.${k}`)) });
  } else out.push({ fact: "no_late_payments", available: false, favorable: false, headline: "No payment history on file", citations: [] });
  if (has(ts, "revolvingCreditUtilization")) {
    const u = Number(ts.revolvingCreditUtilization);
    out.push({ fact: "utilization", available: true, favorable: u <= 30, headline: `Credit utilization ${u}%`, citations: [c("summaries.tradeSummary.revolvingCreditUtilization")] });
  } else out.push({ fact: "utilization", available: false, favorable: false, headline: "No revolving credit on file", citations: [] });
  const tl = (r.tradelines ?? []) as { accountOpenedDate?: string }[];
  if (tl.length) {
    let i = 0;
    tl.forEach((t, k) => { if ((t.accountOpenedDate ?? "9999") < (tl[i].accountOpenedDate ?? "9999")) i = k; });
    const years = Math.floor(daysBetween(tl[i].accountOpenedDate!, call.at) / 365.25);
    out.push({ fact: "account_age", available: true, favorable: years >= 5, headline: `Oldest account ${years} years`, citations: [c(`tradelines[${i}].accountOpenedDate`)] });
  } else out.push({ fact: "account_age", available: false, favorable: false, headline: "No accounts on file", citations: [] });
  if (has(d, "collectionsCount")) {
    const n = Number(d.collectionsCount);
    out.push({ fact: "no_collections", available: true, favorable: n === 0, headline: n === 0 ? "No collections" : `${n} collections`, citations: [c("summaries.derogatorySummary.collectionsCount")] });
  } else out.push({ fact: "no_collections", available: false, favorable: false, headline: "No collection data on file", citations: [] });
  return out;
}

export function summarize(call: CrsCallRecord): string {
  const r = call.response as any;
  switch (call.product) {
    case "tu_idv": {
      const m = r.addOnProducts?.[0]?.idManagerVerification?.messages ?? [];
      return m.length ? `reason codes ${m.map((x: any) => x.code).join(", ")}` : "verified, no reason codes";
    }
    case "fraud_finder": return `risk.score ${r.risk?.score}`;
    case "reverse_phone": {
      const recs = r.data?.records ?? [];
      return recs.length ? `owner ${recs[0].firstName} ${recs[0].lastName}` : "no record";
    }
    case "pitchpoint": {
      const d = r.DetailedBLJReport;
      return `bankruptcies ${d.BankruptciesFound}, judgments ${d.JudgmentsFound}, liens ${d.LiensFound}`;
    }
    case "credit_report": return "report held by the vendor's agent; only the facts it shares leave it";
    case "biz_quick_search": return r.lookAlikeIndicator ? `${r.results.length} matches, look-alike flagged` : `${r.results.length} match, ${r.results[0].businessName}`;
    case "biz_registration": return `${r.results.corporateRegistration.statusDescription.toLowerCase()}, filed ${r.results.corporateRegistration.incorporatedDate}`;
    case "biz_fraud_shields": {
      const f = r.results.fraudShields;
      return [f.ofacMatchWarning ? "OFAC possible match" : "no OFAC match", f.taxIdMatchIndicator === null ? null : `EIN ${f.taxIdMatchIndicator ? "matches" : "mismatch"}`,
        f.addressMatchIndicator === null ? null : `address ${f.addressMatchIndicator ? "matches" : "mismatch"}`].filter(Boolean).join(", ");
    }
    case "biz_risk_dashboard": {
      const x = r.results;
      return `${x.intelliscore ? `Intelliscore ${x.intelliscore.score}` : "no Intelliscore"}, DBT ${x.paymentPerformance.currentDbt}, limit ${x.creditLimitRecommendation.recommendedCreditLimitAmount === null ? "none" : fmtUsd(x.creditLimitRecommendation.recommendedCreditLimitAmount * 100)}`;
    }
  }
}
