// The only place pages get data from.
// Demo mode serves the seeded mocks. Live mode reads the Creao seat gateway through gatewayClient.
// Parts with no gateway route yet (payment run, answer-key score, processing analytics) stay on mocks in both modes.

import { getDataMode } from "./dataMode";
import { gatewayClient } from "./gatewayClient";
import {
  MOCK_ATTENTION_ITEMS,
  MOCK_AUDIT_TRAILS,
  MOCK_BILLS,
  MOCK_CRS_DATA_USE,
  MOCK_CRS_RESULTS,
  MOCK_DAILY_PROCESSING,
  MOCK_PASSPORTS,
  MOCK_PAYMENT_RUN,
  MOCK_PROCESSED_INVOICES,
  MOCK_SCORE,
  MOCK_WEEK_INTAKE,
} from "./mockData";
import { mockRecordDecision, mockRemoveRule, mockRuleBooks, mockTeach } from "./mockLearning";
import type {
  AttentionItem,
  AuditEvent,
  BillSummary,
  CrsChainResult,
  CrsDataUseEntry,
  DailyIntake,
  DailyProcessing,
  Passport,
  PaymentRun,
  ProcessedInvoice,
  RuleBook,
  ScoreResult,
  StampDecision,
  UploadedBill,
} from "./types";

const MOCK_LATENCY_MS = 120;
const resolveLater = <Value,>(value: Value) => new Promise<Value>((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
const isLive = () => getDataMode() === "live";

// ---------------------------------------------------------------- bills, passports, audit (gateway in live mode)

export const listBills = (): Promise<BillSummary[]> => (isLive() ? gatewayClient.listBills() : resolveLater(MOCK_BILLS));

// Demo decisions change the mock objects in place, so hand out copies for React to see the change.
export const getPassport = (billId: string): Promise<Passport | null> =>
  isLive() ? gatewayClient.getPassport(billId) : resolveLater(MOCK_PASSPORTS[billId] ? { ...MOCK_PASSPORTS[billId] } : null);

export const getBillSummary = (billId: string): Promise<BillSummary | null> => {
  if (isLive()) return gatewayClient.getBill(billId).catch(() => null);
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === billId);
  return resolveLater(bill ? { ...bill } : null);
};

export const getAuditTrail = (billId: string): Promise<AuditEvent[]> =>
  isLive() ? gatewayClient.getAuditTrail(billId) : resolveLater(MOCK_AUDIT_TRAILS[billId] ?? []);

export const getWeekIntake = (): Promise<DailyIntake[]> => (isLive() ? gatewayClient.getWeekIntake() : resolveLater(MOCK_WEEK_INTAKE));

// ---------------------------------------------------------------- CRS (live CRS sandbox calls in live mode)

export const listCrsPersonas = (): Promise<CrsChainResult[]> => (isLive() ? gatewayClient.listCrsPersonas() : resolveLater(MOCK_CRS_RESULTS));

export const runCrsChain = (personaId: string): Promise<CrsChainResult | null> =>
  isLive() ? gatewayClient.runCrsChain(personaId) : resolveLater(MOCK_CRS_RESULTS.find((result) => result.personaId === personaId) ?? null);

export const getCrsDataUseLog = (): Promise<CrsDataUseEntry[]> => (isLive() ? gatewayClient.getCrsDataUseLog() : resolveLater(MOCK_CRS_DATA_USE));

// ---------------------------------------------------------------- overview lists

/** Live: every held or parked bill becomes a decision for the AP manager. */
export async function listAttentionItems(): Promise<AttentionItem[]> {
  if (!isLive()) return resolveLater(MOCK_ATTENTION_ITEMS);
  const bills = await gatewayClient.listBills();
  return bills
    .filter((bill) => bill.status === "held" || bill.status === "parked")
    .map((bill): AttentionItem => ({
      id: bill.billId,
      kind: bill.status === "held" ? "bank_change" : "parked",
      title: `${bill.vendorName} · ${bill.invoiceNumber}`,
      reason: bill.headline ?? "",
      recommendation: bill.status === "held" ? "Do not pay" : "Answer the open question",
      amountCents: bill.amountCents,
      tone: bill.status === "held" ? "held" : "asking",
      actionLabel: "Open passport",
      href: `/check/${bill.billId}`,
    }));
}

/** Live: every bill the gateway booked to the ledger. Paid invoices need the payment run, which is not wired yet. */
export async function listProcessedInvoices(): Promise<ProcessedInvoice[]> {
  if (!isLive()) return resolveLater(MOCK_PROCESSED_INVOICES);
  const bills = await gatewayClient.listBills();
  return bills
    .filter((bill) => bill.status === "booked")
    .map((bill): ProcessedInvoice => ({
      billId: bill.billId,
      invoiceNumber: bill.invoiceNumber,
      vendorName: bill.vendorName,
      jobSite: bill.jobSite,
      amountCents: bill.amountCents,
      status: "booked",
      processedAt: bill.receivedAt,
      secondsToBook: 0,
      approvedBy: "Agents (auto)",
    }))
    .sort((first, second) => second.processedAt.localeCompare(first.processedAt));
}

// ---------------------------------------------------------------- decisions and rule books

export const recordDecision = async (decision: Omit<StampDecision, "at">) =>
  isLive() ? gatewayClient.recordDecision(decision) : resolveLater(mockRecordDecision(decision));

export const listRuleBooks = (): Promise<RuleBook[]> => (isLive() ? gatewayClient.listRuleBooks() : resolveLater(mockRuleBooks()));

export const removeRule = async (seat: string, ruleId: string) =>
  isLive() ? gatewayClient.removeRule(seat, ruleId) : resolveLater(mockRemoveRule(seat, ruleId));

/** The message the orchestrator learns from; its system prompt treats "Human decision" as a lesson. */
export function decisionMessage(decision: StampDecision): string {
  const role = decision.byRole === "controller" ? "the Controller" : "the site PM";
  return `Human decision on ${decision.billId}, stamp ${decision.stampId}, ${decision.decision}, by ${role}: "${decision.note}"`;
}

/** Ask the orchestrator to turn a decision into a rule for the agent that owns the stamp. Streams its events. */
export const teachFromDecision = (decision: StampDecision, onEvent: (type: string, data: any) => void) =>
  isLive() ? gatewayClient.chatWithOrchestrator(decisionMessage(decision), onEvent) : mockTeach(decision, onEvent);

// ---------------------------------------------------------------- no gateway route yet: mocks in both modes

/** Live: every bill the gateway booked (by the agents or after a person approved it) is in the next run. */
export async function getNextPaymentRun(): Promise<PaymentRun> {
  if (!isLive()) return resolveLater(MOCK_PAYMENT_RUN);
  const booked = (await gatewayClient.listBills()).filter((bill) => bill.status === "booked");
  const NET_30_MS = 30 * 24 * 60 * 60 * 1000;
  return {
    ...MOCK_PAYMENT_RUN,
    runId: "RUN-LIVE",
    items: booked.map((bill) => ({
      billId: bill.billId,
      vendorName: bill.vendorName,
      amountCents: bill.amountCents,
      dueDate: new Date(new Date(bill.receivedAt).getTime() + NET_30_MS).toISOString().slice(0, 10),
      terms: "Net 30",
      requestedBy: "Booked by the gateway",
    })),
  };
}
export const getScore = (): Promise<ScoreResult> => resolveLater(MOCK_SCORE);
export const getDailyProcessing = (): Promise<DailyProcessing[]> => resolveLater(MOCK_DAILY_PROCESSING);

// ---------------------------------------------------------------- bill upload

export type UploadResult = Pick<UploadedBill, "outcome" | "vendorName" | "amountCents" | "headline">;

export function outcomeFromBill(bill: BillSummary): UploadResult {
  const outcome = bill.status === "held" ? "held" : bill.status === "parked" ? "asking" : bill.status === "booked" ? "booked" : undefined;
  return { outcome, vendorName: bill.vendorName, amountCents: bill.amountCents, headline: bill.headline };
}

// Demo mode: each upload resolves to one of the seeded bills so the flow can be rehearsed without the gateway.
const MOCK_UPLOAD_OUTCOMES = [
  "B-NC-2231", "B-1043A", "B-1101", "B-OKF-2291", "B-1104", "B-BL-7802", "B-1109", "B-SS-3342", "B-1112", "B-PGT-001",
];

export async function mockSubmitBill(uploadIndex: number): Promise<{ billId: string }> {
  await resolveLater(null);
  return { billId: MOCK_UPLOAD_OUTCOMES[uploadIndex % MOCK_UPLOAD_OUTCOMES.length] ?? `B-UP-${uploadIndex}` };
}

export async function mockUploadResult(billId: string): Promise<UploadResult> {
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === billId);
  await resolveLater(null);
  return bill ? outcomeFromBill(bill) : { outcome: "booked" };
}

/** Demo files for the "Use sample bills" button, named the way vendors send them. */
export const SAMPLE_BILL_FILES = MOCK_UPLOAD_OUTCOMES.slice(0, 8).map((billId) => {
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === billId);
  const vendorSlug = (bill?.vendorName ?? "vendor").toLowerCase().replace(/[^a-z]+/g, "-");
  return { name: `${bill?.invoiceNumber ?? billId}_${vendorSlug}.pdf`, size: 80_000 + (billId.length * 9_731) % 140_000 };
});
