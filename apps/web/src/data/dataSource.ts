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
  ScoreResult,
  UploadedBill,
} from "./types";

const MOCK_LATENCY_MS = 120;
const resolveLater = <Value,>(value: Value) => new Promise<Value>((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
const isLive = () => getDataMode() === "live";

// ---------------------------------------------------------------- bills, passports, audit (gateway in live mode)

export const listBills = (): Promise<BillSummary[]> => (isLive() ? gatewayClient.listBills() : resolveLater(MOCK_BILLS));

export const getPassport = (billId: string): Promise<Passport | null> =>
  isLive() ? gatewayClient.getPassport(billId) : resolveLater(MOCK_PASSPORTS[billId] ?? null);

export const getBillSummary = (billId: string): Promise<BillSummary | null> =>
  isLive() ? gatewayClient.getBill(billId).catch(() => null) : resolveLater(MOCK_BILLS.find((bill) => bill.billId === billId) ?? null);

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

// ---------------------------------------------------------------- no gateway route yet: mocks in both modes

export const getNextPaymentRun = (): Promise<PaymentRun> => resolveLater(MOCK_PAYMENT_RUN);
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
