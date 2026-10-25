// What the Intake seat read from the raw email and PDF. Downstream seats work from this, not from the
// seed, so a reading mistake flows on the way it would in a real AP team. The seed is the answer key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Extraction {
  billId: string;
  fields: any;
  extractedBy: { seat: string; runId?: string; at: string };
}

const REQUIRED = ["vendorName", "invoiceNumber", "invoiceDate", "poNumber", "terms", "bankAccountLast4", "totalAmount", "from"];
const isNumberLike = (v: unknown) => Number.isFinite(Number(String(v ?? "").replace(/[$,\s]/g, ""))) && String(v ?? "").trim() !== "";

// Returns the problems with an extraction's shape; empty when it can be recorded.
export function checkShape(f: any): string[] {
  if (!f || typeof f !== "object" || Array.isArray(f)) return ["send the bill fields as one JSON object"];
  return [
    ...REQUIRED.filter((k) => typeof f[k] !== "string" || !f[k].trim()).map((k) => `${k} must be a non-empty string`),
    Array.isArray(f.lineItems) && f.lineItems.length ? "" : "lineItems must be a non-empty array",
    ...(Array.isArray(f.lineItems) ? f.lineItems : []).flatMap((l: any, i: number) =>
      typeof l?.description === "string" && isNumberLike(l?.quantity) && isNumberLike(l?.unitPrice)
        ? []
        : [`lineItems[${i}] needs description, quantity and unitPrice`],
    ),
    f.claimedContact && typeof f.claimedContact === "object" ? "" : "claimedContact must be an object (name, email, phone)",
  ].filter(Boolean);
}

const text = (s: unknown) => String(s ?? "").toLowerCase().replace(/\b(llc|inc)\b\.?/g, "").replace(/\s+/g, " ").trim();
const num = (s: unknown) => Number(String(s ?? "").replace(/[$,\s]/g, ""));
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

// Field-by-field comparison with the answer key, after normalizing formats ($48,000.00 vs 48000.00).
export function score(got: any, truth: any): { matched: number; total: number; mismatches: string[] } {
  const checks: [string, boolean][] = [
    ["vendorName", text(got.vendorName) === text(truth.vendorName)],
    ["invoiceNumber", text(got.invoiceNumber) === text(truth.invoiceNumber)],
    ["invoiceDate", text(got.invoiceDate) === text(truth.invoiceDate)],
    ["poNumber", text(got.poNumber) === text(truth.poNumber)],
    ["terms", text(got.terms) === text(truth.terms)],
    ["bankAccountLast4", digits(got.bankAccountLast4).slice(-4) === truth.bankAccountLast4],
    ["totalAmount", num(got.totalAmount) === num(truth.totalAmount)],
    ["from", text(got.from) === text(truth.from)],
    [
      "lineItems",
      Array.isArray(got.lineItems) &&
        got.lineItems.length === truth.lineItems.length &&
        truth.lineItems.every(
          (l: any, i: number) =>
            text(got.lineItems[i]?.description) === text(l.description) &&
            num(got.lineItems[i]?.quantity) === num(l.quantity) &&
            num(got.lineItems[i]?.unitPrice) === num(l.unitPrice),
        ),
    ],
    ["claimedContact.name", text(got.claimedContact?.name) === text(truth.claimedContact.name)],
    ["claimedContact.email", text(got.claimedContact?.email) === text(truth.claimedContact.email)],
    ["claimedContact.phone", digits(got.claimedContact?.phone) === digits(truth.claimedContact.phone)],
  ];
  return {
    matched: checks.filter(([, ok]) => ok).length,
    total: checks.length,
    mismatches: checks.filter(([, ok]) => !ok).map(([k]) => k),
  };
}

export function createExtractions(path: string) {
  const store: Record<string, Extraction> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(store, null, 1));
  };
  return {
    put(e: Extraction) {
      store[e.billId] = e;
      save();
    },
    get: (billId: string): Extraction | undefined => store[billId],
    reset(billId: string) {
      delete store[billId];
      save();
    },
  };
}
