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
import type { AttentionItem, AuditEvent, BillSummary, CrsChainResult, CrsDataUseEntry, DailyIntake, DailyProcessing, ProcessedInvoice, Passport, PaymentRun, ScoreResult } from "./types";

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
