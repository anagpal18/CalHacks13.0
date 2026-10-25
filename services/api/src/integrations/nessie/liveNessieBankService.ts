import type { BankRecord, BankService, PastVendorPayment, PayVendorRequest, PayVendorResult } from "./bankService.js";
import {
  loadNessieAccountDirectory,
  requireCompanyOperatingAccountId,
  requireVendorEntry,
} from "./nessieAccountDirectory.js";
import type { NessieTransfer } from "./nessieApiTypes.js";
import { nessieHttpClient } from "./nessieHttpClient.js";
import { centsToNessieDollars, nessieDollarsToCents } from "./nessieMoney.js";
import { decodePaymentMemo, encodePaymentMemo } from "./paymentMemo.js";

const CANCELLED_STATUS = "cancelled";

function todayAsIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPastVendorPayment(transfer: NessieTransfer): PastVendorPayment | null {
  const memo = decodePaymentMemo(transfer.description);
  if (!memo) return null;
  return {
    nessieTransferId: transfer.id,
    billId: memo.billId,
    vendorId: memo.vendorId,
    payeeAccountId: memo.payeeAccountId,
    amountCents: nessieDollarsToCents(transfer.amount),
    paidOn: transfer.transaction_date,
    status: transfer.status,
  };
}

async function listAllBillPassportPayments(): Promise<PastVendorPayment[]> {
  const operatingAccountId = requireCompanyOperatingAccountId(loadNessieAccountDirectory());
  const transfers = await nessieHttpClient.listTransfersFromAccount(operatingAccountId);
  return transfers.map(toPastVendorPayment).filter((payment) => payment !== null);
}

export const liveNessieBankService: BankService = {
  async getPaymentHistory(vendorId) {
    const allPayments = await listAllBillPassportPayments();
    return allPayments.filter((payment) => payment.vendorId === vendorId && payment.status !== CANCELLED_STATUS);
  },

  async findPaymentsForBill(billId) {
    const allPayments = await listAllBillPassportPayments();
    return allPayments.filter((payment) => payment.billId === billId && payment.status !== CANCELLED_STATUS);
  },

  async getVerifiedPayeeAccountId(vendorId) {
    return requireVendorEntry(loadNessieAccountDirectory(), vendorId).verifiedPayeeAccountId;
  },

  // Nessie never updates `balance` when money moves, so we compute it:
  // starting balance + deposits - non-cancelled transfers out.
  async getOperatingBalanceCents() {
    const operatingAccountId = requireCompanyOperatingAccountId(loadNessieAccountDirectory());
    const [account, deposits, transfers] = await Promise.all([
      nessieHttpClient.getAccount(operatingAccountId),
      nessieHttpClient.listDepositsToAccount(operatingAccountId),
      nessieHttpClient.listTransfersFromAccount(operatingAccountId),
    ]);
    const depositedCents = deposits
      .filter((deposit) => deposit.status !== CANCELLED_STATUS)
      .reduce((total, deposit) => total + nessieDollarsToCents(deposit.amount), 0);
    const paidOutCents = transfers
      .filter((transfer) => transfer.status !== CANCELLED_STATUS)
      .reduce((total, transfer) => total + nessieDollarsToCents(transfer.amount), 0);
    return nessieDollarsToCents(account.balance) + depositedCents - paidOutCents;
  },

  async payVendor(request: PayVendorRequest): Promise<PayVendorResult> {
    const directory = loadNessieAccountDirectory();
    const operatingAccountId = requireCompanyOperatingAccountId(directory);
    const payeeAccountId = request.payeeAccountId ?? requireVendorEntry(directory, request.vendorId).verifiedPayeeAccountId;

    const transfer = await nessieHttpClient.createTransferFromAccount(operatingAccountId, {
      amount: centsToNessieDollars(request.amountCents),
      transaction_date: request.paidOn ?? todayAsIsoDate(),
      status: "completed",
      description: encodePaymentMemo({
        billId: request.billId,
        vendorId: request.vendorId,
        payeeAccountId,
        paymentRunId: request.paymentRunId,
      }),
    });
    return { nessieTransferId: transfer.id, payeeAccountId, amountCents: request.amountCents };
  },

  async getBankRecord(nessieTransferId): Promise<BankRecord> {
    const transfer = await nessieHttpClient.getTransfer(nessieTransferId);
    const memo = decodePaymentMemo(transfer.description);
    return {
      nessieTransferId: transfer.id,
      amountCents: nessieDollarsToCents(transfer.amount),
      status: transfer.status,
      paidOn: transfer.transaction_date,
      billId: memo?.billId ?? null,
      vendorId: memo?.vendorId ?? null,
      payeeAccountId: memo?.payeeAccountId ?? null,
    };
  },
};
