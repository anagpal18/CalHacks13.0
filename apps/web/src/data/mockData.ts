// Mock data for building the dashboard before the API exists.
// The planted bills follow the 2-minute demo script in BILL_PASSPORT_MASTER.md §13 exactly,
// so the demo can be rehearsed on mocks. Everything is deterministic (same output every load).

import { STAMP_CATALOG } from "./stampCatalog";
import type {
  AttentionItem,
  AuditEvent,
  DailyIntake,
  BillSummary,
  CrsChainResult,
  CrsDataUseEntry,
  Passport,
  PaymentRun,
  PlantedProblemResult,
  ProblemKind,
  ScoreResult,
  Stamp,
  StampId,
} from "./types";

export const DEMO_TODAY = "2026-10-24";
const MOCK_SIGNATURE = "ed25519:mock";

// ---------------------------------------------------------------- planted demo bills

interface StampOverride {
  status: Stamp["status"];
  reason: string;
  evidence?: Stamp["evidence"];
  disagreement?: Stamp["disagreement"];
}

interface PlantedBill {
  summary: BillSummary;
  stampOverrides: Partial<Record<StampId, StampOverride>>;
  askedWho?: Passport["askedWho"];
}

const PLANTED_BILLS: PlantedBill[] = [
  {
    summary: {
      billId: "B-1043A", invoiceNumber: "1043-A", vendorId: "V-OKAFOR-ELECTRIC", vendorName: "Okafor Electric",
      amountCents: 12_480_00, receivedVia: "portal", receivedAt: "2026-10-24T08:12:00", jobSite: "Harbor Point",
      status: "held", headline: "Already paid as INV-1043 on Sep 18",
    },
    stampOverrides: {
      repeat: {
        status: "fail",
        reason: "Already paid as INV-1043 on Sep 18. Same amount, same line items, new number.",
        evidence: [
          { source: "invoice", field: "invoice_number", value: "1043-A" },
          { source: "invoice", field: "amount", value: "$12,480.00" },
          { source: "nessie", field: "transfer.memo", value: "bill=INV-1043 · $12,480.00 · 2026-09-18", ref: "nessie:6e6eab29" },
          { source: "past_bills", field: "line_items_fingerprint", value: "identical (14 of 14 lines)" },
        ],
        disagreement: { sources: ["invoice", "nessie"], winner: "nessie", rule: "What was paid → Nessie beats the ledger" },
      },
    },
  },
  {
    summary: {
      billId: "B-OKF-2291", invoiceNumber: "INV-2291", vendorId: "V-OKAFOR-ELECTRIC", vendorName: "Okafor Electric",
      amountCents: 48_000_00, receivedVia: "email", receivedAt: "2026-10-24T08:31:00", jobSite: "Mission Bay Tower",
      status: "held", headline: "New bank account. The person asking is not who they claim", crsPersonaId: "P13",
    },
    stampOverrides: {
      sender: {
        status: "fail",
        reason: "Sent from okafor-electric-billing.co, a domain registered 3 days ago.",
        evidence: [
          { source: "email", field: "from", value: "kayla@okafor-electric-billing.co" },
          { source: "vendor_history", field: "verified_contact", value: "margaret@okaforelectric.com" },
          { source: "crs", field: "fraud_finder.email_age_days", value: "3", ref: "crs:ff-1182" },
        ],
      },
      payto: {
        status: "fail",
        reason: "Bank account changed. Every past payment went to ••4417, this bill asks for ••9031.",
        evidence: [
          { source: "invoice", field: "bank.account_last4", value: "9031" },
          { source: "nessie", field: "past_payments.payee_account", value: "••4417 (2 of 2 payments)", ref: "nessie:history" },
          { source: "crs", field: "identity.reason_code", value: "2201 SSN/name mismatch", ref: "crs:idv-2207" },
          { source: "callback", field: "phone_owner", value: "Not Margaret Okafor: VoIP line, owner unknown" },
        ],
        disagreement: { sources: ["invoice", "vendor_history"], winner: "vendor_history", rule: "Contact/bank details → last verified version beats the current one" },
      },
    },
  },
  {
    summary: {
      billId: "B-SS-3342", invoiceNumber: "SS-3342", vendorId: "V-SUMMIT-STEEL", vendorName: "Summit Steel",
      amountCents: 8_200_00, receivedVia: "portal", receivedAt: "2026-10-24T09:02:00", jobSite: "Fremont Logistics",
      status: "held", headline: "Price crept from $3.90 to $4.10 per unit",
    },
    stampOverrides: {
      order: {
        status: "fail",
        reason: "Billed $4.10 per anchor bolt; PO and contract say $3.90. Over by $400 on 2,000 units.",
        evidence: [
          { source: "invoice", field: "line[3].unit_price", value: "$4.10 × 2,000" },
          { source: "po", field: "line[3].unit_price", value: "$3.90 × 2,000", ref: "PO-8812" },
          { source: "contract", field: "rate.anchor_bolt", value: "$3.90 (tolerance 1%)", ref: "MSA-SS-2025" },
        ],
        disagreement: { sources: ["invoice", "po", "contract"], winner: "po", rule: "Price / quantity → PO and contract beat the invoice" },
      },
    },
  },
  {
    summary: {
      billId: "B-BL-7802", invoiceNumber: "BL-7802", vendorId: "V-BAY-LUMBER", vendorName: "Bay Lumber Supply",
      amountCents: 6_340_00, receivedVia: "email", receivedAt: "2026-10-24T09:18:00", jobSite: "Oakland Civic",
      status: "parked", headline: "Waiting on the site PM to confirm delivery",
    },
    askedWho: "project_manager",
    stampOverrides: {
      delivered: {
        status: "ask_human",
        reason: "Billed for 40 sheets of plywood; the receiving log shows 0 received. Asked the site PM.",
        evidence: [
          { source: "invoice", field: "line[1].quantity", value: "40 sheets" },
          { source: "receiving", field: "Oakland Civic · plywood 3/4\"", value: "0 received (log closed Oct 23)" },
        ],
        disagreement: { sources: ["invoice", "receiving"], winner: "receiving", rule: "Delivered → receiving log beats the invoice" },
      },
    },
  },
  {
    summary: {
      billId: "B-VP-560", invoiceNumber: "VP-560", vendorId: "V-VENKATESAN-PLUMBING", vendorName: "Venkatesan Plumbing",
      amountCents: 9_115_00, receivedVia: "email", receivedAt: "2026-10-24T09:40:00", jobSite: "Harbor Point",
      status: "booked", headline: "Bill said net 15; booked at the contract's net 30",
    },
    stampOverrides: {
      terms: {
        status: "pass",
        reason: "Bill says net 15, contract says net 30 from delivery. Booked on contract terms.",
        evidence: [
          { source: "invoice", field: "terms", value: "Net 15" },
          { source: "contract", field: "terms", value: "Net 30 from delivery", ref: "MSA-VP-2026" },
        ],
        disagreement: { sources: ["invoice", "contract"], winner: "contract", rule: "Terms → contract beats the invoice" },
      },
    },
  },
  {
    summary: {
      billId: "B-PGT-001", invoiceNumber: "PGT-001", vendorId: "V-PETTIGREW-SUPPLY", vendorName: "Pettigrew Site Supply",
      amountCents: 22_750_00, receivedVia: "email", receivedAt: "2026-10-24T10:05:00", jobSite: "Mission Bay Tower",
      status: "held", headline: "Vendor's owner is listed as deceased", crsPersonaId: "P14",
    },
    stampOverrides: {
      vendor: {
        status: "fail",
        reason: "New sole-proprietor vendor. Identity check says the owner, Harold Pettigrew, is deceased.",
        evidence: [
          { source: "vendor_master", field: "status", value: "Not on file (added 2 days ago)" },
          { source: "crs", field: "identity.reason_code", value: "2301 deceased", ref: "crs:idv-2311" },
        ],
      },
    },
  },
  {
    summary: {
      billId: "B-CH-418", invoiceNumber: "CH-418", vendorId: "V-COASTLINE-HAULING", vendorName: "Coastline Hauling",
      amountCents: 14_600_00, receivedVia: "portal", receivedAt: "2026-10-24T10:22:00", jobSite: "San Leandro Yard",
      status: "held", headline: "Vendor phone traces to an employee's home",
    },
    stampOverrides: {
      insider: {
        status: "fail",
        reason: "Vendor contact phone is registered at the home address of an employee in purchasing.",
        evidence: [
          { source: "crs", field: "reverse_phone.address", value: "418 Linden St, Hayward", ref: "crs:rp-0931" },
          { source: "employees", field: "E-2207 home address", value: "418 Linden St, Hayward" },
        ],
      },
    },
  },
  {
    summary: {
      billId: "B-NC-2231", invoiceNumber: "NC-2231", vendorId: "V-NAKAMURA-CONCRETE", vendorName: "Nakamura Concrete",
      amountCents: 31_250_00, receivedVia: "portal", receivedAt: "2026-10-24T07:55:00", jobSite: "Fremont Logistics",
      status: "booked", headline: "2/10 net 30: pay by Oct 27 to save $625",
    },
    stampOverrides: {},
  },
];

// ---------------------------------------------------------------- clean filler bills

const FILLER_VENDORS = [
  ["V-NAKAMURA-CONCRETE", "Nakamura Concrete"], ["V-SUMMIT-STEEL", "Summit Steel"], ["V-BAY-LUMBER", "Bay Lumber Supply"],
  ["V-DELTA-HVAC", "Delta HVAC"], ["V-GRANITE-RENTALS", "Granite Equipment Rentals"], ["V-PACIFIC-GLASS", "Pacific Glass & Glazing"],
  ["V-REDWOOD-ROOFING", "Redwood Roofing"], ["V-ALPINE-SCAFFOLD", "Alpine Scaffold"], ["V-OKAFOR-ELECTRIC", "Okafor Electric"],
  ["V-BRIGHTLINE-PAINT", "Brightline Painting"], ["V-IRONGATE-FENCING", "Irongate Fencing"], ["V-METRO-WASTE", "Metro Waste Services"],
] as const;
const JOB_SITES = ["Harbor Point", "Mission Bay Tower", "Fremont Logistics", "Oakland Civic", "San Leandro Yard", "Walnut Creek Medical", "Berkeley Lofts", "Hayward Depot", "Emeryville Labs"];

/** Small deterministic PRNG so fillers look random but never change between loads. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function buildFillerBills(count: number): BillSummary[] {
  const random = seededRandom(1043);
  return Array.from({ length: count }, (_, index) => {
    const [vendorId, vendorName] = FILLER_VENDORS[Math.floor(random() * FILLER_VENDORS.length)];
    const minutesAfterSix = 20 + index * 9;
    const hour = String(6 + Math.floor(minutesAfterSix / 60)).padStart(2, "0");
    const minute = String(minutesAfterSix % 60).padStart(2, "0");
    return {
      billId: `B-${1100 + index}`,
      invoiceNumber: `${vendorId.split("-")[1].slice(0, 2)}-${4000 + Math.floor(random() * 5000)}`,
      vendorId,
      vendorName,
      amountCents: Math.round((800 + random() * 38_000) * 100),
      receivedVia: random() > 0.45 ? "portal" : "email",
      receivedAt: `2026-10-24T${hour}:${minute}:00`,
      jobSite: JOB_SITES[Math.floor(random() * JOB_SITES.length)],
      status: index > 21 ? "checking" : "booked",
    } satisfies BillSummary;
  });
}

// ---------------------------------------------------------------- passports

function buildStamps(bill: BillSummary, overrides: Partial<Record<StampId, StampOverride>>): Stamp[] {
  return STAMP_CATALOG.map((definition, index) => {
    const override = overrides[definition.id];
    return {
      id: definition.id,
      status: override?.status ?? "pass",
      reason: override?.reason ?? CLEAN_STAMP_REASON[definition.id],
      evidence: override?.evidence ?? [{ source: CLEAN_STAMP_SOURCE[definition.id], field: "result", value: CLEAN_STAMP_REASON[definition.id] }],
      disagreement: override?.disagreement,
      signedBy: definition.signedBy,
      signature: MOCK_SIGNATURE,
      at: new Date(new Date(bill.receivedAt).getTime() + (index + 1) * 4_000).toISOString(),
    };
  });
}

const CLEAN_STAMP_REASON: Record<StampId, string> = {
  sender: "Sent from the vendor's verified contact.",
  vendor: "Known vendor, on file and active.",
  repeat: "No earlier bill or payment with this fingerprint.",
  order: "Every line matches the PO within tolerance.",
  delivered: "Receiving log shows every item delivered.",
  terms: "Terms match the contract.",
  payto: "Same bank account as every past payment.",
  insider: "No link to any employee.",
};

const CLEAN_STAMP_SOURCE: Record<StampId, Stamp["evidence"][number]["source"]> = {
  sender: "vendor_history", vendor: "vendor_master", repeat: "nessie", order: "po",
  delivered: "receiving", terms: "contract", payto: "nessie", insider: "employees",
};

export const MOCK_BILLS: BillSummary[] = [...PLANTED_BILLS.map((planted) => planted.summary), ...buildFillerBills(28)]
  .sort((first, second) => first.receivedAt.localeCompare(second.receivedAt));

export const MOCK_PASSPORTS: Record<string, Passport> = Object.fromEntries(
  MOCK_BILLS.map((bill) => {
    const planted = PLANTED_BILLS.find((candidate) => candidate.summary.billId === bill.billId);
    const passport: Passport = {
      billId: bill.billId,
      vendorId: bill.vendorId,
      amountCents: bill.amountCents,
      stamps: buildStamps(bill, planted?.stampOverrides ?? {}),
      status: bill.status,
      askedWho: planted?.askedWho,
    };
    return [bill.billId, passport];
  }),
);

/** The bill the Check page opens on: the demo's duplicate. */
export const DEMO_FEATURED_BILL_ID = "B-1043A";

// ---------------------------------------------------------------- CRS personas (§9)

export const MOCK_CRS_RESULTS: CrsChainResult[] = [
  {
    personaId: "P13", personaName: "Kayla Brennan", claimsToBe: "Okafor Electric billing",
    scenario: "Asks to change Okafor Electric's bank account before the $48,000 bill is paid",
    amountAtStakeCents: 48_000_00,
    fraudFinder: { riskScore: 88, emailAgeDays: 3, phoneType: "voip", phoneOwnerMatches: false, ipDistanceMiles: 1_940, line: "Risk 88. Email is 3 days old, phone is VoIP" },
    identity: {
      passed: false,
      reasonCodes: [
        { code: "2201", meaning: "SSN does not match name", ok: false },
        { code: "2101", meaning: "Address not linked to person", ok: false },
      ],
      line: "Identity failed: name and SSN do not match",
    },
    phoneOwner: { registeredTo: "Unknown VoIP subscriber", matchesContact: false, line: "The 'call to confirm' number is not Margaret Okafor's" },
    decision: "held", decisionLine: "Bank change blocked",
  },
  {
    personaId: "P01", personaName: "Margaret Okafor", claimsToBe: "Okafor Electric owner",
    scenario: "The real contact confirms Okafor Electric's existing account",
    amountAtStakeCents: 48_000_00,
    fraudFinder: { riskScore: 11, emailAgeDays: 2_920, phoneType: "mobile", phoneOwnerMatches: true, ipDistanceMiles: 4, line: "Risk 11. Email is 8 years old, mobile phone is hers" },
    identity: { passed: true, reasonCodes: [], line: "Identity verified" },
    phoneOwner: { registeredTo: "Margaret Okafor", matchesContact: true, line: "Callback number belongs to Margaret Okafor" },
    decision: "cleared", decisionLine: "Verified contact, existing account confirmed",
  },
  {
    personaId: "P12", personaName: "Victor Anand", claimsToBe: "Summit Steel accounts manager",
    scenario: "Emails new remittance details for Summit Steel",
    amountAtStakeCents: 64_115_00,
    fraudFinder: { riskScore: 74, emailAgeDays: 41, phoneType: "mobile", phoneOwnerMatches: false, ipDistanceMiles: 620, line: "Risk 74. Phone is registered to someone else" },
    identity: { passed: true, reasonCodes: [], line: "Identity exists. It's a real person" },
    phoneOwner: { registeredTo: "Daniel Ruiz", matchesContact: false, line: "Phone belongs to Daniel Ruiz, not Victor Anand" },
    decision: "held", decisionLine: "Impersonation: phone is not theirs",
  },
  {
    personaId: "P14", personaName: "Harold Pettigrew", claimsToBe: "Owner, Pettigrew Site Supply",
    scenario: "A brand-new vendor sends its first bill",
    amountAtStakeCents: 22_750_00,
    fraudFinder: { riskScore: 62, emailAgeDays: 9, phoneType: "prepaid", phoneOwnerMatches: false, ipDistanceMiles: 210, line: "Risk 62. Prepaid phone, new email" },
    identity: { passed: false, reasonCodes: [{ code: "2301", meaning: "Person is deceased", ok: false }], line: "Identity failed: this person is deceased" },
    phoneOwner: { registeredTo: "Unregistered prepaid", matchesContact: false, line: "No owner on file for this number" },
    decision: "held", decisionLine: "Ghost vendor: owner is deceased",
  },
  {
    personaId: "P08", personaName: "Priya Venkatesan", claimsToBe: "Owner, Venkatesan Plumbing",
    scenario: "Long-time vendor updates contact details",
    amountAtStakeCents: 9_115_00,
    fraudFinder: { riskScore: 38, emailAgeDays: 1_460, phoneType: "mobile", phoneOwnerMatches: true, ipDistanceMiles: 12, line: "Risk 38. Contact details check out" },
    identity: { passed: true, reasonCodes: [], line: "Identity verified, but a $7,450 tax lien and a $12,300 judgment are on file" },
    phoneOwner: { registeredTo: "Priya Venkatesan", matchesContact: true, line: "Callback number belongs to Priya Venkatesan" },
    decision: "review", decisionLine: "Real vendor, but money trouble on file",
  },
  {
    personaId: "P16", personaName: "Samuel Oyelaran", claimsToBe: "Owner, Oyelaran Concrete Pumping",
    scenario: "New vendor setup with a fraud alert on file",
    amountAtStakeCents: 18_400_00,
    fraudFinder: { riskScore: 55, emailAgeDays: 730, phoneType: "mobile", phoneOwnerMatches: true, ipDistanceMiles: 30, line: "Risk 55. Fraud alert on file" },
    identity: { passed: false, reasonCodes: [{ code: "2401", meaning: "Step-up verification required", ok: false }], line: "Needs step-up verification" },
    phoneOwner: { registeredTo: "Samuel Oyelaran", matchesContact: true, line: "Callback number belongs to Samuel Oyelaran" },
    decision: "escalate", decisionLine: "Asking the controller",
  },
  {
    personaId: "P19", personaName: "Grace Nakamura", claimsToBe: "Owner, Nakamura Concrete",
    scenario: "Small-business owner confirms her payout account",
    amountAtStakeCents: 31_250_00,
    fraudFinder: { riskScore: 9, emailAgeDays: 2_190, phoneType: "mobile", phoneOwnerMatches: true, ipDistanceMiles: 6, line: "Risk 9. Long-standing email and phone" },
    identity: { passed: true, reasonCodes: [], line: "Identity verified" },
    phoneOwner: { registeredTo: "Grace Nakamura", matchesContact: true, line: "Callback number belongs to Grace Nakamura" },
    decision: "cleared", decisionLine: "Verified owner",
  },
];

// ---------------------------------------------------------------- stage 2 payment run

export const MOCK_PAYMENT_RUN: PaymentRun = {
  runId: "RUN-2026-10-24",
  requestedBy: "Payments agent",
  approverLimitCents: 250_000_00,
  operatingBalanceCents: 2_327_435_00,
  items: [
    { billId: "B-NC-2231", vendorName: "Nakamura Concrete", amountCents: 31_250_00, dueDate: "2026-10-27", terms: "2/10 net 30", discount: { percent: 2, payByDate: "2026-10-27", savingsCents: 625_00 }, requestedBy: "Payments agent", recheckOutcome: "unchanged" },
    { billId: "B-1101", vendorName: "Delta HVAC", amountCents: 18_920_00, dueDate: "2026-10-27", terms: "Net 30", requestedBy: "Payments agent", recheckOutcome: "unchanged" },
    { billId: "B-1104", vendorName: "Granite Equipment Rentals", amountCents: 7_480_00, dueDate: "2026-10-29", terms: "Net 30", requestedBy: "Payments agent", recheckOutcome: "unchanged" },
    { billId: "B-HB-115", vendorName: "Harbor Concrete Pumping", amountCents: 26_300_00, dueDate: "2026-10-29", terms: "Net 30", requestedBy: "Payments agent", recheckOutcome: "bank_changed" },
    { billId: "B-1109", vendorName: "Pacific Glass & Glazing", amountCents: 12_045_00, dueDate: "2026-10-31", terms: "1/10 net 45", discount: { percent: 1, payByDate: "2026-10-31", savingsCents: 120_45 }, requestedBy: "Payments agent", recheckOutcome: "unchanged" },
    { billId: "B-VP-560", vendorName: "Venkatesan Plumbing", amountCents: 9_115_00, dueDate: "2026-11-03", terms: "Net 30 (contract)", requestedBy: "Payments agent", recheckOutcome: "unchanged" },
  ],
};

// ---------------------------------------------------------------- proof page (answer key score)

const PLANTED_PROBLEM_MIX: [ProblemKind, number][] = [
  ["duplicate", 7], ["price_creep", 5], ["not_delivered", 5], ["wrong_terms", 4], ["missed_discount", 4],
  ["bank_change_scam", 4], ["bank_change_after_booking", 3], ["insider_vendor", 2], ["self_approval", 2],
  ["bank_mismatch", 2], ["ghost_vendor", 2],
];

const CAUGHT_BY: Record<ProblemKind, PlantedProblemResult["caughtBy"]> = {
  duplicate: "repeat", price_creep: "order", not_delivered: "delivered", wrong_terms: "terms", missed_discount: "terms",
  bank_change_scam: "payto", bank_change_after_booking: "recheck", insider_vendor: "insider", self_approval: "approver",
  bank_mismatch: "bank_match", ghost_vendor: "vendor",
};

function buildScore(): ScoreResult {
  const random = seededRandom(40);
  const missedProblemIds = new Set(["P-09", "P-21"]); // one price creep inside tolerance, one wrong-terms bill
  let problemNumber = 0;
  const plantedProblems = PLANTED_PROBLEM_MIX.flatMap(([kind, count]) =>
    Array.from({ length: count }, () => {
      problemNumber += 1;
      const problemId = `P-${String(problemNumber).padStart(2, "0")}`;
      const missed = missedProblemIds.has(problemId);
      return {
        problemId, kind, billId: `B-${1200 + problemNumber}`,
        amountCents: Math.round((400 + random() * 9_600) * 100),
        outcome: missed ? "missed" : "caught",
        caughtBy: missed ? undefined : CAUGHT_BY[kind],
      } satisfies PlantedProblemResult;
    }),
  );
  return {
    plantedProblems,
    falseAlarms: [
      { billId: "B-1117", stamp: "delivered", reason: "Receiving log was entered late by the PM" },
      { billId: "B-1123", stamp: "order", reason: "Approved change order not yet attached to the PO" },
    ],
  };
}

export const MOCK_SCORE: ScoreResult = buildScore();

export const MOCK_AUDIT_TRAILS: Record<string, AuditEvent[]> = {
  "B-OKF-2291": [
    { at: "08:31:02", actor: "Intake agent", action: "Opened passport", detail: "INV-2291 · Okafor Electric · $48,000.00", tone: "neutral" },
    { at: "08:31:06", actor: "Intake agent", action: "Stamp 1 failed", detail: "Sender domain 3 days old (CRS Fraud Finder)", tone: "held" },
    { at: "08:31:09", actor: "Vendor-Records agent", action: "Bank change detected", detail: "••4417 → ••9031. Starting CRS chain", tone: "asking" },
    { at: "08:31:11", actor: "CRS", action: "Fraud Finder", detail: "Risk 88 · email 3 days · VoIP", tone: "held" },
    { at: "08:31:13", actor: "CRS", action: "TU identity", detail: "Reason code 2201: SSN/name mismatch", tone: "held" },
    { at: "08:31:14", actor: "CRS", action: "Reverse phone", detail: "Callback number is not Margaret Okafor's. Did not call it", tone: "held" },
    { at: "08:31:15", actor: "Vendor-Records agent", action: "Stamp 7 failed", detail: "Rule: last verified bank details beat the current ones", tone: "held" },
    { at: "08:31:15", actor: "Gateway", action: "Booking refused", detail: "2 of 8 stamps failed. Passport held", tone: "held" },
  ],
  "B-1043A": [
    { at: "08:12:01", actor: "Intake agent", action: "Opened passport", detail: "1043-A · Okafor Electric · $12,480.00", tone: "neutral" },
    { at: "08:12:04", actor: "Intake agent", action: "Fingerprint match", detail: "Same as INV-1043 (14 of 14 lines)", tone: "asking" },
    { at: "08:12:05", actor: "Nessie", action: "Payment found", detail: "INV-1043 paid Sep 18 · transfer 6e6eab29", tone: "neutral" },
    { at: "08:12:05", actor: "Intake agent", action: "Stamp 3 failed", detail: "Rule: what was paid → Nessie beats the ledger", tone: "held" },
    { at: "08:12:06", actor: "Gateway", action: "Booking refused", detail: "Duplicate. $12,480 protected", tone: "held" },
  ],
};

export const MOCK_CRS_DATA_USE: CrsDataUseEntry[] = [
  { at: "08:31:11", product: "Fraud Finder", persona: "P13 Kayla Brennan", purpose: "Bank-detail change on Okafor Electric", cached: false },
  { at: "08:31:13", product: "TU Identity", persona: "P13 Kayla Brennan", purpose: "Bank-detail change on Okafor Electric", cached: false },
  { at: "08:31:14", product: "Reverse Phone", persona: "P13 Kayla Brennan", purpose: "Verify callback number before calling", cached: false },
  { at: "10:05:20", product: "TU Identity", persona: "P14 Harold Pettigrew", purpose: "New sole-proprietor vendor", cached: false },
  { at: "10:22:41", product: "Reverse Phone", persona: "Coastline Hauling contact", purpose: "Insider check on new vendor", cached: true },
];

// ---------------------------------------------------------------- inbox week (Sun Oct 18 → today, Sat Oct 24)

// Caught problems and protected dollars are spread from the answer key (MOCK_SCORE) across Mon–Sat,
// so the Inbox week and the Proof page always add up to the same totals.
const WEEK_BASE = [
  { date: "2026-10-18", dayLetter: "S", billsReceived: 6, amountCents: 41_200_00 },
  { date: "2026-10-19", dayLetter: "M", billsReceived: 41, amountCents: 386_400_00 },
  { date: "2026-10-20", dayLetter: "T", billsReceived: 33, amountCents: 512_750_00 },
  { date: "2026-10-21", dayLetter: "W", billsReceived: 29, amountCents: 274_100_00 },
  { date: "2026-10-22", dayLetter: "T", billsReceived: 37, amountCents: 448_900_00 },
  { date: "2026-10-23", dayLetter: "F", billsReceived: 24, amountCents: 301_650_00 },
  { date: "2026-10-24", dayLetter: "S", billsReceived: 36, amountCents: 433_120_00 },
];

export const MOCK_WEEK_INTAKE: DailyIntake[] = WEEK_BASE.map((day, dayIndex) => {
  const caughtThatDay = MOCK_SCORE.plantedProblems.filter(
    (problem, problemIndex) => problem.outcome === "caught" && dayIndex > 0 && problemIndex % 6 === dayIndex - 1,
  );
  return {
    ...day,
    problemsCaught: caughtThatDay.length,
    protectedCents: caughtThatDay.reduce((total, problem) => total + problem.amountCents, 0),
  };
});

// ---------------------------------------------------------------- overview: what needs a person
// Ordered by urgency. Every item links into the tab where the decision is made.

export const MOCK_ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: "run", kind: "approve_run", title: "Approve this week's payment run",
    reason: "6 bills are due between Oct 27 and Nov 3. All passed their checks; one more re-check happens before money moves.",
    recommendation: "Approve", amountCents: 105_110_00, urgencyNote: "$745 in early-pay discounts expire Oct 27",
    tone: "checking", actionLabel: "Review & approve", href: "/pay",
  },
  {
    id: "okafor-bank-change", kind: "bank_change", title: "Bank-change request on Okafor Electric",
    reason: "Requester's identity failed, the email is 3 days old and the callback number isn't Margaret Okafor's.",
    recommendation: "Reject", amountCents: 48_000_00, urgencyNote: "Blocks INV-2291",
    tone: "held", actionLabel: "See the checks", href: "/verify/P13",
  },
  {
    id: "oyelaran", kind: "escalation", title: "New vendor with a fraud alert: Oyelaran Concrete Pumping",
    reason: "Identity needs step-up verification before we can set up payments.",
    recommendation: "Ask the vendor to verify", amountCents: 18_400_00,
    tone: "asking", actionLabel: "Review", href: "/verify/P16",
  },
  {
    id: "bay-lumber", kind: "parked", title: "Bay Lumber billed for plywood the site never received",
    reason: "40 sheets billed, 0 on the Oakland Civic receiving log. Waiting on the site PM.",
    recommendation: "Nudge the PM", amountCents: 6_340_00, urgencyNote: "Waiting 1 day",
    tone: "asking", actionLabel: "Open bill", href: "/check/B-BL-7802",
  },
  {
    id: "venkatesan", kind: "vendor_review", title: "Venkatesan Plumbing has new liens on file",
    reason: "Real, long-time vendor, but a $7,450 tax lien and a $12,300 judgment appeared.",
    recommendation: "Keep paying, review terms", amountCents: 9_115_00,
    tone: "asking", actionLabel: "Review", href: "/verify/P08",
  },
];
