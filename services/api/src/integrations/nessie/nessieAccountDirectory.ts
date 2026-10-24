// Nessie assigns its own IDs. This directory maps our IDs (company, vendorId) to Nessie's IDs.
// Written by scripts/seedNessieBank.ts, read by everything else.
// Stored as JSON for now; it can move into the API database later.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const directoryFilePath = fileURLToPath(new URL("../../../data/nessie-account-directory.json", import.meta.url));

export interface NessieVendorEntry {
  vendorId: string;
  vendorName: string;
  nessieCustomerId: string;
  /** The account past payments went to. Stamp 7 compares a bill's bank details against this. */
  verifiedPayeeAccountId: string;
}

export interface NessieAccountDirectory {
  company: { nessieCustomerId: string; operatingAccountId: string } | null;
  vendorsById: Record<string, NessieVendorEntry>;
}

export function loadNessieAccountDirectory(): NessieAccountDirectory {
  if (!existsSync(directoryFilePath)) return { company: null, vendorsById: {} };
  return JSON.parse(readFileSync(directoryFilePath, "utf8")) as NessieAccountDirectory;
}

export function saveNessieAccountDirectory(directory: NessieAccountDirectory): void {
  mkdirSync(dirname(directoryFilePath), { recursive: true });
  writeFileSync(directoryFilePath, JSON.stringify(directory, null, 2));
}

export function requireCompanyOperatingAccountId(directory: NessieAccountDirectory): string {
  if (!directory.company) throw new Error("Company bank account not set up. Run: pnpm nessie:seed");
  return directory.company.operatingAccountId;
}

export function requireVendorEntry(directory: NessieAccountDirectory, vendorId: string): NessieVendorEntry {
  const vendorEntry = directory.vendorsById[vendorId];
  if (!vendorEntry) throw new Error(`Vendor ${vendorId} has no Nessie account. Run: pnpm nessie:seed`);
  return vendorEntry;
}
