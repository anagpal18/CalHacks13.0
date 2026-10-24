// The bank interface the rest of Bill Passport uses. Two implementations:
//   liveNessieBankService.ts    -> the real Nessie API
//   offlineFakeBankService.ts   -> in-memory fake, for when Nessie is down or for tests
// Everything here is in CENTS. Pick one with getBankService() in index.ts.

export interface PastVendorPayment {
  nessieTransferId: string;
  billId: string;
  vendorId: string;
  payeeAccountId: string;
  amountCents: number;
  paidOn: string; // YYYY-MM-DD
  status: string;
}

export interface PayVendorRequest {
  billId: string;
  vendorId: string;
  amountCents: number;
  paymentRunId: string;
  /** Defaults to the vendor's verified payee account. */
  payeeAccountId?: string;
  paidOn?: string; // YYYY-MM-DD, defaults to today
}

export interface PayVendorResult {
  nessieTransferId: string;
  payeeAccountId: string;
  amountCents: number;
}

export interface BankRecord {
  nessieTransferId: string;
  amountCents: number;
  status: string;
  paidOn: string;
  billId: string | null;
  vendorId: string | null;
  payeeAccountId: string | null;
}

export interface BankService {
  /** Stamps 3 and 7: every payment we've made to this vendor. */
  getPaymentHistory(vendorId: string): Promise<PastVendorPayment[]>;
  /** Stamp 3: has this bill already been paid (by any vendor)? */
  findPaymentsForBill(billId: string): Promise<PastVendorPayment[]>;
  /** Stamp 7: the payee account the vendor is verified to use. */
  getVerifiedPayeeAccountId(vendorId: string): Promise<string>;
  /** Check 11: cash available in the operating account. */
  getOperatingBalanceCents(): Promise<number>;
  /** Stage 2: move the money. Only the Payments agent calls this, after approval. */
  payVendor(request: PayVendorRequest): Promise<PayVendorResult>;
  /** Check 14: read back what the bank actually recorded. */
  getBankRecord(nessieTransferId: string): Promise<BankRecord>;
}
