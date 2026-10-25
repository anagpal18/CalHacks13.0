// Offer, Citation and Deal follow TERMS_ROOM_MASTER.md §7, widened for the Rulebook spec: net days run 15 to 60,
// the deposit is the upfront % (0 to 30) and every offer carries a first-order limit.
// Kenil owns this package; if his published schemas differ, his version wins.
// Everything below the "Bursar extras" line is what the engine, the start page and The Table need on top of §7.

/** What a citation points at. People products are live CRS sandbox data; biz_* are simulated in CRS format. */
export type CrsProduct = "tu_idv" | "fraud_finder" | "reverse_phone" | "pitchpoint" | "credit_fact"
  | "biz_quick_search" | "biz_registration" | "biz_fraud_shields" | "biz_risk_dashboard";

export interface Citation {
  product: CrsProduct;
  field: string; // e.g. "risk.score", "results.fraudShields.taxIdMatchIndicator"
  value: string;
  callId: string; // RequestID of the logged CRS response (sim-… for simulated business calls)
}

export type Condition = "lien_release" | "pay_supplier_direct";

export interface Offer {
  negotiationId: string;
  round: number; // 1..maxRounds
  from: "contractor" | "sub";
  depositPct: number; // the upfront %, 0..30
  schedule: { label: string; pct: number }[]; // sums to 100 with the upfront %
  netDays: number; // 15..60
  limitCents: number; // first-order limit
  conditions: Condition[];
  citations: Citation[]; // must be non-empty
  sharedCards?: Citation[]; // vendor side only: credit facts it chose to reveal
  rationale: string; // one plain sentence for the UI
}

export type DealStatus = "negotiating" | "agreed" | "ended" | "escalated" | "approved" | "deposit_paid";
export type RiskTier = "low" | "caution" | "blocked";

export interface Deal {
  negotiationId: string;
  subPersona: string;
  scenario: ScenarioId;
  status: DealStatus;
  rounds: Offer[];
  riskTier: RiskTier;
  approvedBy?: string;
  nessieTransferId?: string;
}

// ---------------------------------------------------------------- Bursar extras: the Rulebook

export type ScenarioId = "A" | "B" | "C" | "D" | "E";
export type BusinessProfileId = "clean" | "slow_payer" | "brand_new" | "look_alike" | "ofac_hit" | "ucc_heavy";
export type CreditFact = "no_late_payments" | "utilization" | "account_age" | "no_collections";
export type VendorExhibit = "w9" | "license" | "bank_letter" | "reference" | "invoices" | "credit_facts";

/** The three things a deal settles. Net days: when we pay the vendor. Upfront: paid before delivery. Limit: the first order's cap. */
export interface Terms { netDays: number; upfrontPct: number; limitCents: number }
export type Ask = Terms;

export interface TierRule { bestNetDays: number; maxUpfrontPct: number; maxLimitCents: number }

export interface Scenario {
  id: ScenarioId;
  owner: string; // sandbox persona, e.g. "P19"
  profile: BusinessProfileId; // the simulated business record
  judgeUpload: boolean; // pause the duel so the judge can hand in a document
}

export interface BuyerRules {
  opening: Terms;
  tiers: Record<RiskTier, TierRule>;
  creditLimitAnchor: { on: boolean; pct: number }; // cap the limit at pct% of Risk Dashboard's recommended credit limit
  hardStops: {
    idvFails: { on: boolean };
    fraudFinder: { on: boolean; threshold: number }; // talks end when risk.score >= threshold
    ofac: { on: boolean };
    inactive: { on: boolean };
    registeredDays: { on: boolean; days: number }; // talks end when registered fewer than `days` ago
    lookAlike: { on: boolean };
    mismatch: { on: boolean }; // phone, address or EIN doesn't match
  };
  evidence: { verified: number; contradicted: number; unverified: number }; // trust points each verdict moves
  escalate: { fraudAlert: boolean; noDeal: { on: boolean; rounds: number } };
  approval: { secondApproverAboveCents: number }; // the controller always approves; a second approver above this upfront amount
}

export interface VendorRules {
  opening: Terms;
  walkAway: Terms; // the worst terms it will accept
  style: "firm" | "balanced" | "flexible";
  consent: { allow: boolean; facts: CreditFact[] };
  exhibits: VendorExhibit[];
}

export interface GeneralRules { maxRounds: number; speed: number; narrator: boolean }

export interface Rulebook {
  scenario: Scenario;
  buyerRules: BuyerRules;
  vendorRules: VendorRules;
  general: GeneralRules;
  preset?: "demo" | "strict" | "friendly" | "custom";
}

/** Every rule that can decide something, so the transcript can name it and the Rulebook can pulse it. */
export type RuleId =
  | "stop.idv" | "stop.fraud_finder" | "stop.ofac" | "stop.inactive" | "stop.registered" | "stop.look_alike" | "stop.mismatch"
  | "tier.low" | "tier.caution" | "tier.blocked"
  | "cap.net" | "cap.upfront" | "cap.limit" | "anchor"
  | "escalate.fraud_alert" | "escalate.no_deal" | "rounds.max"
  | "approval.second" | "consent" | "evidence";

// ---------------------------------------------------------------- Bursar extras: CRS calls, cards, the duel

/** The CRS endpoints the engine calls. credit_report is pulled by the vendor's agent only, behind the consent gate. */
export type CrsCallProduct = "tu_idv" | "fraud_finder" | "reverse_phone" | "pitchpoint" | "credit_report"
  | "biz_quick_search" | "biz_registration" | "biz_fraud_shields" | "biz_risk_dashboard";

/** live: a CRS sandbox persona (served from the call cache unless the API runs in live mode). simulated: business data shaped like CRS. */
export type DataSource = "live" | "simulated";

export interface CrsCallRecord {
  callId: string;
  product: CrsCallProduct;
  persona: string;
  purpose: string;
  side: "contractor" | "sub";
  source: DataSource;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  at: string; // when CRS answered
  cached: boolean; // true when served from the call cache instead of a fresh sandbox call
  response: unknown;
}

/** One line of the CRS console: what was called, why, and what came back. No headers, no tokens. */
export interface CrsLogEntry {
  callId: string;
  product: CrsCallProduct;
  persona: string;
  purpose: string;
  side: "contractor" | "sub";
  source: DataSource;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  at: string;
  cached: boolean;
  summary: string;
  response: unknown | null; // masked (SSN/EIN to last 4); null when the vendor's own report is withheld
}

export type CardTone = "good" | "warn" | "bad" | "neutral";

/** A CRS fact on The Table. Every card carries the citations that back it. */
export interface Card {
  id: string;
  side: "contractor" | "sub";
  product: CrsProduct;
  source: DataSource;
  title: string; // product line, e.g. "TU identity verification"
  headline: string; // e.g. "Fraud risk 9/100"
  detail: string; // one plain sentence
  tone: CardTone;
  trustDelta: number; // 0: trust moves by verdicts on claims, not by cards
  citations: Citation[];
  shared?: boolean; // vendor side: revealed by choice
}

export interface ConsentRecord {
  persona: string;
  signedBy: string;
  signedAt: string;
  purpose: string;
  scope: CreditFact[];
  expiresAt: string;
}

export interface SubProfile {
  persona: string;
  contact: string; // the owner, as CRS knows them
  business: string;
  trade: string;
  scope: string;
  phone: string;
  email: string;
  placeholder: true; // Aditya owns the real profiles (services/api/seed)
}

export interface BusinessSummary {
  name: string;
  einLast4: string;
  address: string;
  state: string;
  profile: BusinessProfileId;
  simulated: true;
}

export type Verdict = "verified" | "contradicted" | "unverified";
export type ExhibitKind = "statement" | VendorExhibit;
export type ClaimTopic = "identity" | "contact" | "company" | "records" | "legal_name" | "ein" | "address" | "standing"
  | "pays_on_time" | "volume" | "bank_balance" | CreditFact;

export interface Claim { id: string; topic: ClaimTopic; text: string; value?: string }

/** Something the vendor puts on the table: its opening statement or a document. The judge can hand one in too. */
export interface Exhibit {
  id: string;
  kind: ExhibitKind;
  label: string; // "Opening statement", "Exhibit A"
  title: string; // "Form W-9"
  from: "sub" | "judge";
  round: number;
  argument: string; // what the vendor's agent says as it plays it
  claims: Claim[];
  fields?: [string, string][]; // printed on the 3D sheet, EIN already masked
  fileName?: string; // judge uploads only; the file itself never leaves the browser
}

export interface ClaimCheck {
  claimId: string;
  exhibitId: string;
  topic: ClaimTopic;
  text: string;
  verdict: Verdict;
  reason: string;
  citations: Citation[];
  cardIds: string[]; // the cards it rests on; a contradiction strings a red thread to the first
  delta: number;
  trust: number;
}

export interface TierCaps extends TierRule {
  limitCapCents: number; // the tier's max limit, or less when the credit-limit anchor binds
  anchor: { recommendedCents: number; pct: number; capCents: number } | null;
}

/** A W-9 as the judge hands it in: the fields it claims. */
export interface UploadedW9 { legalName: string; ein: string; address: string; signer: string; fileName?: string }

export type DealEvent =
  | { type: "negotiation_started"; at: string; negotiationId: string; sub: SubProfile; ask: Ask; contractor: string; rulebook: Rulebook; business: BusinessSummary }
  | { type: "chapter"; at: string; n: number; title: string; caption: string }
  | { type: "exhibit_played"; at: string; exhibit: Exhibit }
  | { type: "upload_requested"; at: string; round: number; prompt: string; draft: UploadedW9 }
  | { type: "crs_call"; at: string; entry: CrsLogEntry }
  | { type: "card_landed"; at: string; card: Card; trust: number }
  | { type: "claim_checked"; at: string; check: ClaimCheck }
  | { type: "rule_applied"; at: string; ruleId: RuleId; text: string; round: number }
  | { type: "report_held"; at: string; side: "sub"; callId: string | null; reason: string }
  | { type: "tier_changed"; at: string; tier: RiskTier; reason: string; limits: TierCaps }
  | { type: "offer_made"; at: string; offer: Offer }
  | { type: "offer_rejected"; at: string; offer: Offer; reasons: string[]; ruleIds: RuleId[] }
  | { type: "deal_closed"; at: string; terms: Offer; rounds: number; depositCents: number; approversNeeded: number }
  | { type: "talks_ended"; at: string; round: number; reasons: string[]; ruleIds: RuleId[] }
  | { type: "escalated"; at: string; round: number; reason: string; ruleId?: RuleId }
  | { type: "approved"; at: string; approvers: string[] }
  | { type: "deposit_paid"; at: string; transferId: string; amountCents: number; simulated: boolean };

export type DealEventType = DealEvent["type"];

export const DEAL_EVENT_TYPES: DealEventType[] = ["negotiation_started", "chapter", "exhibit_played", "upload_requested", "crs_call",
  "card_landed", "claim_checked", "rule_applied", "report_held", "tier_changed", "offer_made", "offer_rejected", "deal_closed",
  "talks_ended", "escalated", "approved", "deposit_paid"];

export const fmtUsd = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "net 15 · 20% upfront · $120,000 limit" */
export const fmtTerms = (t: { netDays: number; depositPct?: number; upfrontPct?: number; limitCents: number }) =>
  `net ${t.netDays} · ${t.depositPct ?? t.upfrontPct}% upfront · ${fmtUsd(t.limitCents)} limit`;

// ---------------------------------------------------------------- masking

const SSN_KEY = /(^|_)(ssn|socialsecurit|social_security)/i;
const EIN_KEY = /(^|_)(ein|taxid|tax_id|tin|fein)$/i;

export const maskLast4 = (v: string) => {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return v;
  return v.includes("-") && digits.length === 9 && /^\d{2}-\d{7}$/.test(v) ? `••-•••${digits.slice(-4)}`
    : v.includes("-") && digits.length === 9 ? `•••-••-${digits.slice(-4)}`
    : `•••••${digits.slice(-4)}`;
};

/** A copy of a CRS response with SSNs and EINs cut to the last 4 digits, wherever they sit. */
export function maskDeep<T>(x: T, key = ""): T {
  if (Array.isArray(x)) return x.map((v) => maskDeep(v, key)) as T;
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) out[k] = maskDeep(v, k);
    // indicative.socialSecurities[].number carries the SSN under a generic key
    if (/^socialSecurities$/i.test(key) || ("number" in out && typeof out.number === "string" && /^\d{9}$/.test(out.number as string) && "identificationIssuance" in out))
      out.number = maskLast4(String(out.number));
    return out as T;
  }
  if (typeof x === "string") {
    if ((SSN_KEY.test(key) || EIN_KEY.test(key)) && /\d{4}/.test(x)) return maskLast4(x) as T;
    // an SSN inside a payload carried as text, e.g. <SSN>666701008</SSN> or "SSN":"666701008"
    return x.replace(/(ssn|SSN|Ssn)([^0-9]{1,6})(\d{3})-?(\d{2})-?(\d{4})/g, (_m, k, sep, _a, _b, last) => `${k}${sep}•••••${last}`) as T;
  }
  return x;
}
