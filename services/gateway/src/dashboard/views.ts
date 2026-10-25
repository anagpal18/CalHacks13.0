// What the dashboard sees, in the shapes of apps/web/src/data/types.ts. Read-only views over the
// gateway's records (bills, recorded extractions, signed stamps, the ledger, the event log, the CRS log).
import * as company from "../company/store.ts";
import type { createCrsClient, CrsCheck } from "../integrations/crs/client.ts";
import { getPath } from "../integrations/crs/client.ts";
import type { createEventLog, LogEvent } from "../gateway/eventlog.ts";
import type { createExtractions } from "../gateway/extractions.ts";
import type { createLedger } from "../gateway/ledger.ts";
import type { createPassports } from "../gateway/passports.ts";
import { ALL_STAMPS } from "../gateway/seats.ts";

type Deps = {
  crs: ReturnType<typeof createCrsClient>;
  events: ReturnType<typeof createEventLog>;
  extractions: ReturnType<typeof createExtractions>;
  ledger: ReturnType<typeof createLedger>;
  passports: ReturnType<typeof createPassports>;
};

const cents = (s: unknown) => Math.round(Number(String(s ?? "").replace(/[$,\s]/g, "")) * 100) || 0;
const SEAT_LABEL: Record<string, string> = { intake: "Intake agent", vendor_records: "Vendor-Records agent", matching: "Matching agent" };

// Story text for the scam console; every CRS number on the Verify page comes from a live CRS call.
const PERSONA_STORY: Record<string, { claimsToBe: string; scenario: string; amountAtStakeCents: number }> = {
  P13: { claimsToBe: "Okafor Electric billing", scenario: "Asks to change Okafor Electric's bank account before the $48,000 bill is paid", amountAtStakeCents: 4_800_000 },
  P01: { claimsToBe: "Okafor Electric owner", scenario: "The real contact confirms Okafor Electric's existing account", amountAtStakeCents: 4_800_000 },
  P12: { claimsToBe: "Summit Steel accounts manager", scenario: "Emails new remittance details for Summit Steel", amountAtStakeCents: 6_411_500 },
  P14: { claimsToBe: "Owner, Pettigrew Site Supply", scenario: "A brand-new vendor sends its first bill", amountAtStakeCents: 2_275_000 },
  P08: { claimsToBe: "Owner, Venkatesan Plumbing", scenario: "Long-time vendor updates contact details", amountAtStakeCents: 911_500 },
  P16: { claimsToBe: "Owner, Oyelaran Concrete Pumping", scenario: "New vendor setup with a fraud alert on file", amountAtStakeCents: 1_840_000 },
};
export const SCAM_CONSOLE_PERSONAS = Object.keys(PERSONA_STORY);

export function createViews(d: Deps) {
  // What Intake recorded wins over the seed: the dashboard shows what the team actually read.
  function billFields(billId: string): any {
    return { ...company.getBill(billId), ...(d.extractions.get(billId)?.fields ?? {}) };
  }

  function passportStatus(billId: string): "checking" | "parked" | "held" | "booked" {
    if (d.ledger.forBill(billId)) return "booked";
    const stamps = Object.values(d.passports.summary(billId).stamps);
    if (stamps.some((s) => s.status === "fail")) return "held";
    if (stamps.some((s) => s.status === "ask_human")) return "parked";
    return "checking";
  }

  function headline(billId: string): string {
    const p = d.passports.summary(billId);
    const signed = ALL_STAMPS.filter((id) => p.stamps[id]);
    const failed = signed.filter((id) => p.stamps[id].status === "fail");
    if (d.ledger.forBill(billId)) return "All 8 stamps passed. Booked: debit Expense, credit Accounts Payable.";
    if (failed.length) return `${failed.length} stamp${failed.length > 1 ? "s" : ""} failed (${failed.join(", ")}): ${p.stamps[failed[0]].reason}`;
    if (p.askedWho.length) return `Waiting on the ${p.askedWho.join(" and ").replace("_", " ")}.`;
    if (signed.length) return `${signed.length} of 8 stamps signed so far.`;
    if (d.extractions.get(billId)) return "Intake read the bill. Waiting for the stamps.";
    return company.getBill(billId)?.uploaded
      ? "Uploaded. Waiting for the Intake agent to read the files."
      : "Waiting for the agents to read this bill.";
  }

  function billSummary(billId: string) {
    const seed = company.getBill(billId);
    if (!seed) return undefined;
    const f = billFields(billId);
    const vendor = company.searchVendors(f.vendorName ?? "")[0];
    return {
      billId,
      invoiceNumber: f.invoiceNumber ?? "Not read yet",
      vendorId: vendor?.vendorId ?? "unknown",
      vendorName: vendor?.legalName ?? f.vendorName ?? "Not read yet",
      amountCents: cents(f.totalAmount),
      receivedVia: seed.channel === "email" ? "email" : "portal",
      receivedAt: seed.receivedAt,
      jobSite: company.getPo(f.poNumber ?? "")?.site ?? "Unassigned",
      status: passportStatus(billId),
      headline: headline(billId),
      crsPersonaId: company.personaForContact(f.claimedContact) ?? seed.claimedContact?.crsPersona,
    };
  }

  function passport(billId: string) {
    const summary = billSummary(billId);
    const p = d.passports.summary(billId);
    const stamps = ALL_STAMPS.filter((id) => p.stamps[id]).map((id) => {
      const s = p.stamps[id];
      return { id, status: s.status, reason: s.reason, evidence: s.evidence, disagreement: s.disagreement, signedBy: s.signedBy, signature: s.signature, at: s.at, creaoRunId: s.creaoRunId };
    });
    if (!summary || !stamps.length) return undefined;
    return {
      billId,
      vendorId: summary.vendorId,
      amountCents: summary.amountCents,
      stamps,
      status: summary.status,
      askedWho: p.askedWho[0],
      ledgerEntry: d.ledger.forBill(billId),
    };
  }

  function auditEvent(e: LogEvent) {
    const x: any = e.data ?? {};
    const actor = e.seat ? (SEAT_LABEL[e.seat] ?? e.seat) : "Gateway";
    const args = Object.values(x.args ?? {}).flat().filter(Boolean).join(" ");
    switch (e.type) {
      case "ticket_issued":
        return { at: e.at, actor: "Gateway", action: "Issued a run ticket", detail: `${SEAT_LABEL[e.seat ?? ""] ?? e.seat}, this bill only`, tone: "neutral" };
      case "tool_call":
        return { at: e.at, actor, action: `Used ${x.tool}`, detail: x.tool === "crs" ? `${args}: ${x.decision ?? ""}` : args || "this bill", tone: "neutral" };
      case "tool_denied":
        return { at: e.at, actor, action: `Denied ${x.tool}`, detail: x.reason ?? "", tone: "held" };
      case "tool_error":
        return { at: e.at, actor, action: `${x.tool} failed`, detail: [x.error].flat().join("; "), tone: "asking" };
      case "bill_received":
        return { at: e.at, actor: "Gateway", action: "Bill received", detail: `Uploaded: ${(x.files ?? []).join(", ")}`, tone: "neutral" };
      case "bill_extracted":
        return x.total
          ? { at: e.at, actor, action: "Read the email and PDF", detail: `Recorded the bill; ${x.matched}/${x.total} fields match the answer key`, tone: x.matched === x.total ? "cleared" : "asking" }
          : { at: e.at, actor, action: "Read the uploaded files", detail: "Recorded the bill (uploaded bills have no answer key)", tone: "neutral" };
      case "stamp_signed":
        return { at: e.at, actor, action: `Signed ${x.id}: ${x.status}`, detail: `Signature ${String(x.signature).slice(0, 12)}...; ${x.grounded} values found in tool output`, tone: x.status === "pass" ? "cleared" : x.status === "fail" ? "held" : "asking" };
      case "stamp_rejected":
        return { at: e.at, actor, action: `Stamp ${x.id} rejected`, detail: (x.problems ?? []).join("; "), tone: "held" };
      case "bill_booked":
        return { at: e.at, actor: "Gateway", action: "Booked to the ledger", detail: `${x.entryId}: debit Expense, credit Accounts Payable $${(x.amountCents / 100).toFixed(2)}`, tone: "cleared" };
      case "passport_reset":
        return { at: e.at, actor: "Gateway", action: "Reset for a fresh run", detail: "", tone: "neutral" };
      default:
        return undefined;
    }
  }

  const auditTrail = (billId: string) => d.events.list({ billId }).map(auditEvent).filter(Boolean);

  const PRODUCT_NAME: Record<string, string> = { fraud_finder: "Fraud Finder", tu_identity_verification: "TU Identity", reverse_phone: "Reverse Phone" };
  const crsLog = () =>
    d.crs
      .log()
      .filter((l) => PRODUCT_NAME[l.product])
      .map((l) => ({
        at: l.at,
        product: PRODUCT_NAME[l.product],
        persona: l.persona,
        purpose: `${l.purpose === "bank_change" ? "Bank-detail change" : "New vendor"}${l.billId ? ` on ${l.billId}` : ""}`,
        cached: l.cached,
      }))
      .reverse();

  // One CRS chain in the Verify page's shape. Story text is fixed; every number is read from CRS.
  async function crsChain(personaId: string) {
    const r = await d.crs.verifyRequester(personaId, "bank_change", "scam-console");
    const check = (p: string) => r.checks.find((c) => c.product === p) as CrsCheck;
    const raw = (c: CrsCheck) => d.crs.getCall(c.callId)?.response;
    const ff = raw(check("fraud_finder"));
    const tu = check("tu_identity_verification");
    const rp = check("reverse_phone");
    const firstSeen = String(getPath(ff, "eam.date_first_seen") ?? "");
    const prepaid = getPath(ff, "risk.phone.prepaid") === true;
    const lineType = String(getPath(ff, "risk.phone.line_type") ?? "mobile");
    const ownerMatch = getPath(ff, "risk.phone.owner.first_name_match") === "match" && getPath(ff, "risk.phone.owner.last_name_match") === "match";
    const records: any[] = (getPath(raw(rp), "data.records") as any[]) ?? [];
    const owner = records[0] ? `${records[0].firstName} ${records[0].lastName}` : "No owner on record";
    const messages: any[] = (getPath(raw(tu), "addOnProducts[0].idManagerVerification.messages") as any[]) ?? [];
    const decision = r.decision === "clear" ? "cleared" : r.decision === "hold" ? "held" : "escalate";
    const riskScore = Number(getPath(ff, "risk.score") ?? 0);
    const emailAgeDays = firstSeen ? Math.max(0, Math.round((Date.now() - Date.parse(firstSeen)) / 86_400_000)) : 0;
    const phoneType = lineType === "voip" ? "voip" : prepaid ? "prepaid" : lineType === "landline" ? "landline" : "mobile";
    const ffLine = `Risk ${riskScore}. Email first seen ${emailAgeDays} days ago, ${prepaid && phoneType !== "prepaid" ? "prepaid " : ""}${phoneType} phone${ownerMatch ? " in their name" : ", not in their name"}`;
    const story = PERSONA_STORY[personaId] ?? { claimsToBe: "Vendor contact", scenario: "Asks to change bank details", amountAtStakeCents: 0 };
    return {
      personaId,
      personaName: r.name.replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase()),
      ...story,
      fraudFinder: {
        riskScore,
        emailAgeDays,
        phoneType,
        phoneOwnerMatches: ownerMatch,
        ipDistanceMiles: Number(String(getPath(ff, "risk.postal.ip_postal_distance") ?? "0").replace(/\D/g, "")) || 0,
        line: ffLine,
      },
      identity: {
        passed: tu.result === "pass",
        reasonCodes: messages.map((m) => ({ code: String(m.code), meaning: String(m.text ?? ""), ok: false })),
        line: tu.line,
      },
      phoneOwner: { registeredTo: owner, matchesContact: rp.result === "pass", line: rp.line },
      decision,
      decisionLine:
        decision === "cleared"
          ? "Cleared: CRS confirms the person and the phone."
          : decision === "held"
            ? "Held: the person asking does not check out with CRS, so no bank detail changes."
            : "Escalated: step-up proof needed before anyone acts.",
    };
  }

  // The Inbox's last 7 days, from the real bills: received, billed, stopped (held or sent to a person).
  function weekIntake() {
    const bills = Object.keys(company.allBills()).map(billSummary).filter(Boolean) as NonNullable<ReturnType<typeof billSummary>>[];
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (6 - i)));
      const date = day.toISOString().slice(0, 10);
      const received = bills.filter((b) => String(b.receivedAt).slice(0, 10) === date);
      const stopped = received.filter((b) => b.status === "held" || b.status === "parked");
      return {
        date,
        dayLetter: "SMTWTFS"[day.getUTCDay()],
        billsReceived: received.length,
        amountCents: received.reduce((s, b) => s + b.amountCents, 0),
        problemsCaught: stopped.length,
        protectedCents: stopped.reduce((s, b) => s + b.amountCents, 0),
      };
    });
  }

  return { billSummary, passport, auditTrail, crsLog, crsChain, passportStatus, weekIntake };
}
