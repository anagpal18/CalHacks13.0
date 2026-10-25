// The only place pages get data from. Today every function resolves mocks;
// hours 8–14 swap these bodies to fetch() against the API without touching any page.

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
import type { AttentionItem, AuditEvent, UploadedBill, BillSummary, CrsChainResult, CrsDataUseEntry, DailyIntake, DailyProcessing, ProcessedInvoice, Passport, PaymentRun, ScoreResult } from "./types";

const MOCK_LATENCY_MS = 120;
const resolveLater = <Value,>(value: Value) => new Promise<Value>((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));

export const listBills = (): Promise<BillSummary[]> => resolveLater(MOCK_BILLS);

export const getPassport = (billId: string): Promise<Passport | null> => resolveLater(MOCK_PASSPORTS[billId] ?? null);

export const getBillSummary = (billId: string): Promise<BillSummary | null> =>
  resolveLater(MOCK_BILLS.find((bill) => bill.billId === billId) ?? null);

export const listCrsPersonas = (): Promise<CrsChainResult[]> => resolveLater(MOCK_CRS_RESULTS);

export const runCrsChain = (personaId: string): Promise<CrsChainResult | null> =>
  resolveLater(MOCK_CRS_RESULTS.find((result) => result.personaId === personaId) ?? null);

export const getNextPaymentRun = (): Promise<PaymentRun> => resolveLater(MOCK_PAYMENT_RUN);

export const getScore = (): Promise<ScoreResult> => resolveLater(MOCK_SCORE);

export const getAuditTrail = (billId: string): Promise<AuditEvent[]> => resolveLater(MOCK_AUDIT_TRAILS[billId] ?? []);

export const getCrsDataUseLog = (): Promise<CrsDataUseEntry[]> => resolveLater(MOCK_CRS_DATA_USE);
export const getWeekIntake = (): Promise<DailyIntake[]> => resolveLater(MOCK_WEEK_INTAKE);
export const listAttentionItems = (): Promise<AttentionItem[]> => resolveLater(MOCK_ATTENTION_ITEMS);
export const listProcessedInvoices = (): Promise<ProcessedInvoice[]> => resolveLater(MOCK_PROCESSED_INVOICES);
export const getDailyProcessing = (): Promise<DailyProcessing[]> => resolveLater(MOCK_DAILY_PROCESSING);

// ---- Bill upload: the seam to the agents' gateway ----
// Live: POST /dashboard/inbox (multipart, email + PDF) on the gateway, which returns a billId and starts the
// seat runs; results then come back as passport updates. Exact request/response shapes are not wired yet.
// Mock: each upload resolves to one of the demo bills so the flow can be rehearsed.

const MOCK_UPLOAD_OUTCOMES = [
  "B-NC-2231", "B-1043A", "B-1101", "B-OKF-2291", "B-1104", "B-BL-7802", "B-1109", "B-SS-3342", "B-1112", "B-PGT-001",
];

export async function submitBillToGateway(file: { name: string; size: number }, uploadIndex: number): Promise<{ billId: string }> {
  await resolveLater(null);
  return { billId: MOCK_UPLOAD_OUTCOMES[uploadIndex % MOCK_UPLOAD_OUTCOMES.length] ?? `B-UP-${uploadIndex}` };
}

export async function getUploadResult(billId: string): Promise<Pick<UploadedBill, "outcome" | "vendorName" | "amountCents" | "headline">> {
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === billId);
  await resolveLater(null);
  if (!bill) return { outcome: "booked" };
  const outcome = bill.status === "held" ? "held" : bill.status === "parked" ? "asking" : "booked";
  return { outcome, vendorName: bill.vendorName, amountCents: bill.amountCents, headline: bill.headline };
}

/** Demo files for the "Use sample bills" button, named the way vendors send them. */
export const SAMPLE_BILL_FILES = MOCK_UPLOAD_OUTCOMES.slice(0, 8).map((billId) => {
  const bill = MOCK_BILLS.find((candidate) => candidate.billId === billId);
  const vendorSlug = (bill?.vendorName ?? "vendor").toLowerCase().replace(/[^a-z]+/g, "-");
  return { name: `${bill?.invoiceNumber ?? billId}_${vendorSlug}.pdf`, size: 80_000 + (billId.length * 9_731) % 140_000 };
});
