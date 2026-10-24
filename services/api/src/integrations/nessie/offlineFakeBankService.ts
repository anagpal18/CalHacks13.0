// In-memory stand-in for Nessie. Same behaviour, no network.
// Use NESSIE_MODE=offline in .env if Nessie goes down during the demo.

import { randomUUID } from "node:crypto";
import type { BankRecord, BankService, PastVendorPayment } from "./bankService.js";
import { SAMPLE_VENDORS_FOR_SEEDING, SAMPLE_PAST_PAYMENTS_FOR_SEEDING, COMPANY_OPENING_BALANCE_CENTS } from "./seedData.js";

const fakePayeeAccountIdByVendorId = new Map(
  SAMPLE_VENDORS_FOR_SEEDING.map((vendor) => [vendor.vendorId, `offline-account-${vendor.vendorId}`]),
);

const fakePayments: PastVendorPayment[] = SAMPLE_PAST_PAYMENTS_FOR_SEEDING.map((pastPayment) => ({
  nessieTransferId: `offline-transfer-${randomUUID()}`,
  billId: pastPayment.billId,
  vendorId: pastPayment.vendorId,
  payeeAccountId: fakePayeeAccountIdByVendorId.get(pastPayment.vendorId)!,
  amountCents: pastPayment.amountCents,
  paidOn: pastPayment.paidOn,
  status: "completed",
}));

function requireFakePayeeAccountId(vendorId: string): string {
  const payeeAccountId = fakePayeeAccountIdByVendorId.get(vendorId);
  if (!payeeAccountId) throw new Error(`Vendor ${vendorId} has no offline account`);
  return payeeAccountId;
}

export const offlineFakeBankService: BankService = {
  async getPaymentHistory(vendorId) {
    return fakePayments.filter((payment) => payment.vendorId === vendorId);
  },

  async findPaymentsForBill(billId) {
    return fakePayments.filter((payment) => payment.billId === billId);
  },

  async getVerifiedPayeeAccountId(vendorId) {
    return requireFakePayeeAccountId(vendorId);
  },

  async getOperatingBalanceCents() {
    return fakePayments.reduce((balance, payment) => balance - payment.amountCents, COMPANY_OPENING_BALANCE_CENTS);
  },

  async payVendor(request) {
    const payeeAccountId = request.payeeAccountId ?? requireFakePayeeAccountId(request.vendorId);
    const newPayment: PastVendorPayment = {
      nessieTransferId: `offline-transfer-${randomUUID()}`,
      billId: request.billId,
      vendorId: request.vendorId,
      payeeAccountId,
      amountCents: request.amountCents,
      paidOn: request.paidOn ?? new Date().toISOString().slice(0, 10),
      status: "completed",
    };
    fakePayments.push(newPayment);
    return { nessieTransferId: newPayment.nessieTransferId, payeeAccountId, amountCents: request.amountCents };
  },

  async getBankRecord(nessieTransferId): Promise<BankRecord> {
    const payment = fakePayments.find((candidate) => candidate.nessieTransferId === nessieTransferId);
    if (!payment) throw new Error(`No offline transfer ${nessieTransferId}`);
    const { nessieTransferId: _, ...recordFields } = payment;
    return { nessieTransferId, ...recordFields };
  },
};
