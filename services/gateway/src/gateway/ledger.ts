// Double-entry ledger. Booking a bill: debit Expense, credit Accounts Payable. Every entry must balance.
// Only the gateway books, and only when a passport has all 8 stamps passing. Paying is stage 2 (Aditya).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LedgerLine {
  account: "Expense" | "Accounts Payable" | "Cash";
  debitCents: number;
  creditCents: number;
}

export interface LedgerEntry {
  entryId: string;
  billId: string;
  vendorId: string;
  at: string;
  memo: string;
  lines: LedgerLine[];
}

export function createLedger(path: string) {
  const entries: LedgerEntry[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(entries, null, 1));
  };

  return {
    // Idempotent: a bill is booked once, however many times its passport is re-signed.
    book(billId: string, vendorId: string, amountCents: number, memo: string): LedgerEntry {
      const existing = entries.find((e) => e.billId === billId);
      if (existing) return existing;
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error(`cannot book ${billId}: bad amount ${amountCents}`);
      const lines: LedgerLine[] = [
        { account: "Expense", debitCents: amountCents, creditCents: 0 },
        { account: "Accounts Payable", debitCents: 0, creditCents: amountCents },
      ];
      const debits = lines.reduce((s, l) => s + l.debitCents, 0);
      const credits = lines.reduce((s, l) => s + l.creditCents, 0);
      if (debits !== credits) throw new Error(`entry for ${billId} does not balance`);
      const entry = { entryId: `JE-${String(entries.length + 1).padStart(5, "0")}`, billId, vendorId, at: new Date().toISOString(), memo, lines };
      entries.push(entry);
      save();
      return entry;
    },
    forBill: (billId: string): LedgerEntry | undefined => entries.find((e) => e.billId === billId),
    // Demo resets only: drop the bill's entry so the same bill can be run again from scratch.
    unbook(billId: string): void {
      const i = entries.findIndex((e) => e.billId === billId);
      if (i >= 0) {
        entries.splice(i, 1);
        save();
      }
    },
  };
}
