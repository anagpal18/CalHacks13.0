// The only place pages get data from. Today every function resolves mocks;
// hours 8–14 swap these bodies to fetch() against the API without touching any page.

import {
  MOCK_AUDIT_TRAILS,
  MOCK_BILLS,
  MOCK_CRS_DATA_USE,
  MOCK_CRS_RESULTS,
  MOCK_PASSPORTS,
  MOCK_PAYMENT_RUN,
  MOCK_SCORE,
} from "./mockData";
import type { AuditEvent, BillSummary, CrsChainResult, CrsDataUseEntry, Passport, PaymentRun, ScoreResult } from "./types";

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
