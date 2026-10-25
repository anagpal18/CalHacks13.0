// Mirrors BURSAR_MASTER.md §8. Replace with imports from packages/shared once Kenil publishes it.

export type StampId = "sender" | "vendor" | "repeat" | "order" | "delivered" | "terms" | "payto" | "insider";
export type StampStatus = "pass" | "fail" | "ask_human";
export type SeatName = "intake" | "vendor_records" | "matching" | "payments";

export type EvidenceSource =
  | "invoice" | "email" | "vendor_master" | "vendor_history" | "po" | "contract"
  | "receiving" | "past_bills" | "ledger" | "nessie" | "crs" | "employees" | "approval_rules" | "callback";

export interface Evidence {
  source: EvidenceSource;
  field: string;
  value: string;
  ref?: string;
}

export interface Disagreement {
  sources: string[];
  winner: string;
  rule: string;
}

/** Where the gateway found one cited value, index-aligned with `Stamp.evidence`. Live mode only. */
export interface EvidenceTrace {
  found: boolean;
  /** The gateway tool whose output held the value (vendors, payments, po, crs, ...). */
  tool?: string;
  /** The path of the value inside `record`. */
  path?: string;
  /** The record the value came from, as the tool served it (cut down when long). */
  record?: unknown;
  /** For raw files (email, PDF): the text around the value. */
  snippet?: string;
}

/** One tool call the signing agent made in its run, from the gateway's event log. */
export interface StampToolCall {
  at: string;
  tool: string;
  args: Record<string, unknown>;
  outcome: "served" | "denied" | "error";
  note?: string;
}

export interface Stamp {
  id: StampId;
  status: StampStatus;
  reason: string;
  evidence: Evidence[];
  disagreement?: Disagreement;
  askedWho?: string;
  signedBy: Exclude<SeatName, "payments">;
  signature: string;
  at: string;
  creaoRunId?: string;
  trace?: EvidenceTrace[];
  toolCalls?: StampToolCall[];
}

export type PassportStatus = "checking" | "parked" | "booked" | "scheduled" | "approved" | "held" | "paid" | "rejected";

// ---- Human decisions and rule books ----

export type DecisionKind = "approve" | "reject" | "escalate";
export type DecisionRole = "controller" | "project_manager";

/** A person's decision on one stamp, made from the Check page. The agent's signed stamp is never changed. */
export interface StampDecision {
  billId: string;
  stampId: StampId;
  decision: DecisionKind;
  byRole: DecisionRole;
  note: string;
  at: string;
}

export type RuleSeat = "intake" | "vendor_records" | "matching";

/** One rule an agent learned from a decision; the orchestrator writes it into that agent's rule book. */
export interface LearnedRule {
  id: string;
  seat: RuleSeat;
  stamp: StampId;
  scope: string;
  text: string;
  sourceBillId: string;
  byRole?: DecisionRole;
  decision?: DecisionKind;
  createdAt: string;
  timesUsed: number;
}

export interface RuleBook {
  seat: RuleSeat;
  title: string;
  markdown: string;
  learned: LearnedRule[];
}

export interface Passport {
  billId: string;
  vendorId: string;
  amountCents: number;
  stamps: Stamp[];
  status: PassportStatus;
  askedWho?: "controller" | "project_manager" | "vendor";
  /** Latest decision per stamp, when a person has decided on one. */
  decisions?: Partial<Record<StampId, StampDecision>>;
  payment?: { runId: string; approvedBy: string; nessieTransferId?: string; matched?: boolean };
}

/** What the Inbox list shows per bill. */
export interface BillSummary {
  billId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  amountCents: number;
  receivedVia: "email" | "portal";
  receivedAt: string;
  jobSite: string;
  status: PassportStatus;
  /** One plain line explaining the status, shown on held/parked bills. */
  headline?: string;
  /** Planted demo bills link to the CRS persona that drives their Verify story. */
  crsPersonaId?: string;
}

// ---- CRS (Verify page) ----

export type CrsDecision = "cleared" | "held" | "review" | "escalate";

export interface CrsReasonCode {
  code: string;
  meaning: string;
  ok: boolean;
}

export interface CrsChainResult {
  personaId: string;
  personaName: string;
  claimsToBe: string;
  scenario: string;
  amountAtStakeCents: number;
  fraudFinder: {
    riskScore: number;
    emailAgeDays: number;
    phoneType: "mobile" | "landline" | "voip" | "prepaid";
    phoneOwnerMatches: boolean;
    ipDistanceMiles: number;
    line: string;
  };
  identity: { passed: boolean; reasonCodes: CrsReasonCode[]; line: string };
  phoneOwner: { registeredTo: string; matchesContact: boolean; line: string };
  decision: CrsDecision;
  decisionLine: string;
}

// ---- Stage 2 (Approve & Pay) ----

export interface PaymentRunItem {
  billId: string;
  vendorName: string;
  amountCents: number;
  dueDate: string;
  terms: string;
  discount?: { percent: number; payByDate: string; savingsCents: number };
  requestedBy: string;
}

export interface PaymentRun {
  runId: string;
  requestedBy: string;
  approverLimitCents: number;
  operatingBalanceCents: number;
  items: PaymentRunItem[];
}

// ---- Proof page ----

export type ProblemKind =
  | "duplicate" | "price_creep" | "not_delivered" | "wrong_terms" | "missed_discount"
  | "bank_change_scam" | "bank_change_after_booking" | "insider_vendor" | "self_approval" | "bank_mismatch" | "ghost_vendor";

export interface PlantedProblemResult {
  problemId: string;
  kind: ProblemKind;
  billId: string;
  amountCents: number;
  outcome: "caught" | "missed";
  caughtBy?: StampId | "approver" | "bank_match";
}

export interface FalseAlarm {
  billId: string;
  stamp: StampId;
  reason: string;
}

export interface ScoreResult {
  plantedProblems: PlantedProblemResult[];
  falseAlarms: FalseAlarm[];
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  detail: string;
  tone: "neutral" | "cleared" | "held" | "asking";
}

export interface CrsDataUseEntry {
  at: string;
  product: "Fraud Finder" | "TU Identity" | "Reverse Phone";
  persona: string;
  purpose: string;
  cached: boolean;
}

// ---- Inbox analytics ----

export interface DailyIntake {
  date: string;
  dayLetter: string;
  billsReceived: number;
  amountCents: number;
  problemsCaught: number;
  protectedCents: number;
}

// ---- Overview (what needs the AP manager) ----

export type AttentionKind = "approve_run" | "bank_change" | "parked" | "vendor_review" | "escalation";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  /** One plain sentence: why this needs a person. */
  reason: string;
  /** What the system suggests the person does. */
  recommendation: string;
  amountCents: number;
  /** e.g. "Discount expires Oct 27" or "Waiting 2 days". */
  urgencyNote?: string;
  tone: "held" | "asking" | "checking";
  actionLabel: string;
  href: string;
}

// ---- Processed invoices (Overview list + Processed analytics page) ----

export interface ProcessedInvoice {
  billId: string;
  invoiceNumber: string;
  vendorName: string;
  jobSite: string;
  amountCents: number;
  status: "booked" | "paid";
  processedAt: string;
  /** Seconds from the bill arriving to being booked. */
  secondsToBook: number;
  approvedBy: "Agents (auto)" | string;
  paidOn?: string;
  nessieTransferId?: string;
}

export interface DailyProcessing {
  date: string;
  dayLetter: string;
  booked: number;
  held: number;
  asking: number;
  averageSecondsToBook: number;
}

// ---- Bill upload (Overview) ----

export type UploadStage = "uploading" | "reading" | "checking" | "done";

export interface UploadedBill {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
  stage: UploadStage;
  /** Set once the gateway accepts the file (POST /dashboard/inbox returns it). */
  billId?: string;
  outcome?: "booked" | "held" | "asking";
  vendorName?: string;
  amountCents?: number;
  headline?: string;
  /** Live mode: the latest thing an agent did on this bill. */
  activityLine?: string;
  /** Set when the bill could not be uploaded or processed. */
  errorMessage?: string;
}
