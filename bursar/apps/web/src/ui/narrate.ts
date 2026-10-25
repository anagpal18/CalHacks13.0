// Plain-language words for the stream: the story line at the top of the panel, and what each agent is thinking.
// Both are driven by the same events the table plays.

import { fmtUsd, type DealEvent } from "@terms-room/shared";

export const PRODUCT: Record<string, string> = {
  tu_idv: "TU identity", fraud_finder: "Fraud Finder", reverse_phone: "Reverse phone", pitchpoint: "PitchPoint", credit_report: "Credit report", credit_fact: "Credit fact",
  biz_quick_search: "Quick Search", biz_registration: "Registration", biz_fraud_shields: "Fraud Shields", biz_risk_dashboard: "Risk Dashboard",
};
export const VERDICT: Record<string, string> = { verified: "Verified", contradicted: "Contradicted", unverified: "Unverified" };
export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\b(Llc|Llp|Lp)\b/g, (m) => m.toUpperCase());
export const shortTerms = (o: { netDays: number; depositPct: number; limitCents: number }) => `net ${o.netDays} · ${o.depositPct}% · ${fmtUsd(o.limitCents)}`;
const first = (s: string) => titleCase(s.split(" ")[0]);
const DOC: Record<string, string> = { w9: "a W-9", license: "a business license", reference: "a reference letter", invoices: "past invoices", bank_letter: "a bank letter", credit_facts: "facts from their own credit report" };
const TIER: Record<string, string> = { low: "Low risk", caution: "Caution", blocked: "Blocked" };

export type Tone = "good" | "warn" | "bad" | "neutral";
export interface StoryLine { headline: string; detail: string; tone: Tone }

/** One line a stranger could follow: what just happened, in plain words. owner is the vendor's first name. */
export function story(e: DealEvent, owner: string): StoryLine | null {
  switch (e.type) {
    case "negotiation_started":
      return { headline: `${first(e.sub.contact)} wants ${e.sub.business} on the job`, detail: `They ask to be paid in ${e.ask.netDays} days, ${e.ask.upfrontPct}% up front, with a ${fmtUsd(e.ask.limitCents)} first order.`, tone: "neutral" };
    case "chapter": return { headline: e.title, detail: e.caption, tone: "neutral" };
    case "exhibit_played":
      return e.exhibit.kind === "statement"
        ? { headline: `${owner} makes the pitch`, detail: e.exhibit.argument, tone: "neutral" }
        : { headline: `${e.exhibit.from === "judge" ? "You hand in" : `${owner} shows`} ${DOC[e.exhibit.kind] ?? e.exhibit.title}`, detail: `CRS will check ${e.exhibit.claims.length === 1 ? "its claim" : `its ${e.exhibit.claims.length} claims`}.`, tone: "neutral" };
    case "upload_requested": return { headline: "Your turn: hand in a W-9", detail: "Upload one, or edit the fields. CRS checks whatever it claims.", tone: "warn" };
    case "crs_call": return e.entry.side === "sub"
      ? { headline: `${owner}'s agent pulls their own credit report`, detail: "With their consent. It stays private; only the facts they allow come out.", tone: "neutral" }
      : { headline: `Checking with CRS: ${PRODUCT[e.entry.product]}`, detail: `${e.entry.summary}.`, tone: "neutral" };
    case "card_landed": return null;
    case "claim_checked":
      return { headline: e.check.verdict === "verified" ? `Checks out: “${e.check.text}”` : e.check.verdict === "contradicted" ? `Doesn't check out: “${e.check.text}”` : `Can't be checked: “${e.check.text}”`,
        detail: e.check.reason, tone: e.check.verdict === "verified" ? "good" : e.check.verdict === "contradicted" ? "bad" : "neutral" };
    case "rule_applied": return { headline: "A rule decides", detail: e.text, tone: "warn" };
    case "report_held": return { headline: `${owner} keeps their report private`, detail: e.reason, tone: "neutral" };
    case "tier_changed":
      return { headline: `Risk level: ${TIER[e.tier]}`, detail: `So we can offer at best ${e.limits.bestNetDays} days, up to ${e.limits.maxUpfrontPct}% up front, up to ${fmtUsd(e.limits.limitCapCents)}.`, tone: e.tier === "low" ? "good" : e.tier === "caution" ? "warn" : "bad" };
    case "offer_made":
      return e.offer.from === "sub"
        ? { headline: `${owner} asks for ${shortTerms(e.offer)}`, detail: e.offer.rationale, tone: "neutral" }
        : { headline: `We offer ${shortTerms(e.offer)}`, detail: e.offer.rationale, tone: "neutral" };
    case "offer_rejected": return { headline: `The rules block ${e.offer.from === "sub" ? `${owner}'s` : "our"} offer`, detail: e.reasons[0] ?? "", tone: "warn" };
    case "deal_closed": return { headline: `Deal: ${shortTerms(e.terms)}`, detail: `Paid in ${e.terms.netDays} days, ${e.terms.depositPct}% up front (${fmtUsd(e.depositCents)}), first order up to ${fmtUsd(e.terms.limitCents)}. ${e.approversNeeded > 1 ? "Two people approve" : "The controller approves"} before money moves.`, tone: "good" };
    case "talks_ended": return { headline: "Talks ended. No order.", detail: `${e.reasons[0]?.replace(/ → talks end/, "") ?? ""}${e.reasons.length > 1 ? ` And ${e.reasons.length - 1} more rule${e.reasons.length > 2 ? "s" : ""} said no.` : ""}`, tone: "bad" };
    case "escalated": return { headline: "Paused: a person decides", detail: e.reason, tone: "warn" };
    case "approved": return { headline: "Approved", detail: `By ${e.approvers.join(" and ")}.`, tone: "good" };
    case "deposit_paid": return { headline: `${fmtUsd(e.amountCents)} sent up front`, detail: `Transfer ${e.transferId}.`, tone: "good" };
  }
}

/** What each agent is thinking after an event, in its own voice. null: this event doesn't change its mind. */
export function thought(e: DealEvent): { side: "contractor" | "sub"; text: string } | null {
  switch (e.type) {
    case "negotiation_started": return { side: "sub", text: `We want to be paid in ${e.ask.netDays} days, ${e.ask.upfrontPct}% up front, and a ${fmtUsd(e.ask.limitCents)} first order.` };
    case "exhibit_played": return e.exhibit.from === "sub" ? { side: "sub", text: e.exhibit.argument } : { side: "contractor", text: "The judge handed in a W-9. I'll check every field on it." };
    case "upload_requested": return { side: "contractor", text: "Waiting for the W-9…" };
    case "crs_call": return e.entry.side === "sub"
      ? { side: "sub", text: "I'll pull my own credit report and share only the facts that help us." }
      : { side: "contractor", text: `I don't take their word for it. Asking CRS: ${PRODUCT[e.entry.product]}.` };
    case "claim_checked": return { side: "contractor", text: `${e.check.verdict === "verified" ? "That checks out" : e.check.verdict === "contradicted" ? "That's not true" : "I can't confirm that"}: “${e.check.text}” ${e.check.reason}` };
    case "rule_applied": return { side: "contractor", text: `My rulebook decides this one: ${e.text}.` };
    case "report_held": return { side: "sub", text: e.reason };
    case "tier_changed": return { side: "contractor", text: `${e.reason} I can go to ${e.limits.bestNetDays} days, ${e.limits.maxUpfrontPct}% up front, ${fmtUsd(e.limits.limitCapCents)} at most.` };
    case "offer_made": return { side: e.offer.from, text: e.offer.rationale };
    case "offer_rejected": return { side: e.offer.from, text: `The gateway stopped my offer: ${e.reasons[0] ?? ""} I'll stay inside the rules.` };
    case "deal_closed": return { side: "contractor", text: `We have a deal: ${shortTerms(e.terms)}. Now a person signs off.` };
    case "talks_ended": return { side: "contractor", text: `I'm ending the talks. ${e.reasons[0]?.replace(/ → talks end/, "") ?? ""}` };
    case "escalated": return { side: "contractor", text: `This needs a person. ${e.reason}` };
    case "approved": return { side: "contractor", text: "Approved. Sending the upfront payment." };
    default: return null;
  }
}
