import type { SeatName, StampId } from "./types";

export interface StampDefinition {
  id: StampId;
  number: number;
  label: string;
  question: string;
  signedBy: Exclude<SeatName, "payments">;
}

// BILL_PASSPORT_MASTER.md §5, in check order.
export const STAMP_CATALOG: StampDefinition[] = [
  { id: "sender", number: 1, label: "Sender", question: "Did this come from the vendor's verified contact?", signedBy: "intake" },
  { id: "vendor", number: 2, label: "Vendor is real", question: "Is this a real, known vendor?", signedBy: "vendor_records" },
  { id: "repeat", number: 3, label: "Not a repeat", question: "Have we already paid this bill?", signedBy: "intake" },
  { id: "order", number: 4, label: "Matches order", question: "Do prices and quantities match the PO?", signedBy: "matching" },
  { id: "delivered", number: 5, label: "Delivered", question: "Did the site actually receive it?", signedBy: "matching" },
  { id: "terms", number: 6, label: "Terms", question: "Do payment terms match the contract?", signedBy: "matching" },
  { id: "payto", number: 7, label: "Pay-to details", question: "Is the bank account the one we always pay?", signedBy: "vendor_records" },
  { id: "insider", number: 8, label: "No insider link", question: "Is the vendor tied to an employee?", signedBy: "vendor_records" },
];

export const SEAT_LABEL: Record<SeatName, string> = {
  intake: "Intake agent",
  vendor_records: "Vendor-Records agent",
  matching: "Matching agent",
  payments: "Payments agent",
};

export const PAYMENT_CHECKS = [
  { number: 9, label: "Due date", question: "Scheduled by its terms, not early or late?" },
  { number: 10, label: "Discount", question: "Early-payment discount worth taking?" },
  { number: 11, label: "Cash", question: "Enough in the bank for the run?" },
  { number: 12, label: "Approver", question: "A human, not the requester, within limit?" },
  { number: 13, label: "Bank match", question: "Does the bank record match the bill?" },
] as const;
