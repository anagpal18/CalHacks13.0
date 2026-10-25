// Nessie transfers have no payee field, only a free-text description.
// So every payment we make carries a machine-readable memo that says who was paid and for which bill:
//
//   BP|bill=INV-1043|vendor=V-OKAFOR|payeeAccount=e4cf...|run=RUN-2026-10-24
//
// Stamp 3 (not a repeat) reads `bill`, stamp 7 (pay-to details) reads `payeeAccount`.

const MEMO_PREFIX = "BP";

export interface PaymentMemo {
  billId: string;
  vendorId: string;
  payeeAccountId: string;
  paymentRunId: string;
}

export function encodePaymentMemo(memo: PaymentMemo): string {
  return [
    MEMO_PREFIX,
    `bill=${memo.billId}`,
    `vendor=${memo.vendorId}`,
    `payeeAccount=${memo.payeeAccountId}`,
    `run=${memo.paymentRunId}`,
  ].join("|");
}

/** Returns null for transfers that were not made by Bursar. */
export function decodePaymentMemo(description: string): PaymentMemo | null {
  const [prefix, ...fieldParts] = description.split("|");
  if (prefix !== MEMO_PREFIX) return null;

  const fields = Object.fromEntries(fieldParts.map((part) => part.split("=", 2)));
  if (!fields.bill || !fields.vendor || !fields.payeeAccount || !fields.run) return null;

  return {
    billId: fields.bill,
    vendorId: fields.vendor,
    payeeAccountId: fields.payeeAccount,
    paymentRunId: fields.run,
  };
}
