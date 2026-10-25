// The company's systems as the seat tools see them: vendor master, bills inbox, POs, receiving log,
// contracts, employees and bank payment history. Seeded from data/company.json; bills uploaded from the
// dashboard are kept in the data directory with their raw files.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const data = JSON.parse(readFileSync(new URL("../../data/company.json", import.meta.url), "utf8"));

// Uploaded bills: no answer key, files under <dataDir>/inbox/<billId>/. Set by the server at start.
let uploadDir = "";
let uploaded: Record<string, any> = {};
const uploadedPath = () => join(uploadDir, "uploaded-bills.json");

export function useDataDir(dataDir: string) {
  uploadDir = dataDir;
  uploaded = existsSync(uploadedPath()) ? JSON.parse(readFileSync(uploadedPath(), "utf8")) : {};
}

export const UPLOAD_TYPES: Record<string, string> = { ".eml": "message/rfc822", ".pdf": "application/pdf", ".txt": "text/plain" };

// Stores the raw files exactly as received and opens a new bill for them.
export function addUploadedBill(files: { name: string; data: Buffer }[]): any {
  const month = new Date().toISOString().slice(0, 7);
  const next = 1 + Math.max(0, ...Object.keys(allBills()).map((id) => Number(id.split("-").at(-1)) || 0));
  const billId = `B-${month}-${String(next).padStart(4, "0")}`;
  const dir = join(uploadDir, "inbox", billId);
  mkdirSync(dir, { recursive: true });
  const names = files.map((f) => {
    const name = basename(f.name).replace(/[^\w.-]+/g, "_").slice(-80) || "file";
    writeFileSync(join(dir, name), f.data);
    return name;
  });
  uploaded[billId] = { billId, receivedAt: new Date().toISOString(), channel: "upload", uploaded: true, files: names };
  writeFileSync(uploadedPath(), JSON.stringify(uploaded, null, 1));
  return uploaded[billId];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp|ltd)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

export const allBills = (): Record<string, any> => ({ ...data.bills, ...uploaded });
export const getBill = (billId: string): any => data.bills[billId] ?? uploaded[billId];
// Seeded bills double as the answer key for scoring what Intake reads; uploaded bills have none.
export const answerKey = (billId: string): any => data.bills[billId];
export const getVendor = (vendorId: string): any => data.vendors.find((v: any) => v.vendorId === vendorId);
export const getPo = (poNumber: string): any => data.purchaseOrders[poNumber];
export const getContract = (vendorId: string): any => data.contracts[vendorId];
export const receivingFor = (poNumber: string): any[] => data.receivingLog.filter((r: any) => r.poNumber === poNumber);
export const paymentsFor = (vendorId: string): any[] => data.bankPayments.filter((p: any) => p.vendorId === vendorId);

export function searchVendors(name: string): any[] {
  const q = norm(name);
  if (!q) return [];
  return data.vendors.filter((v: any) =>
    [v.legalName, ...(v.aliases ?? [])].some((n: string) => norm(n).includes(q) || q.includes(norm(n))),
  );
}

// The street part of an address ("77 Valencia St"), normalized. A street needs a number and a name.
function street(address: string): string {
  const s = norm(address.split(",")[0] ?? "");
  return /^\d+ \S+/.test(s) ? s : "";
}
function city(address: string): string {
  return norm(address.split(",")[1] ?? "");
}

// Returns only which employees match and on what, never the employee list itself. Matches are exact
// (full 10-digit phone, full street, exact name), so the tool cannot be probed by prefix.
export function matchEmployees(q: { phones: string[]; addresses: string[]; names: string[] }): { name: string; role: string; matchedOn: string[] }[] {
  const phones = q.phones.map(digits).filter((p) => p.length === 10);
  const addresses = q.addresses.filter((a) => street(a));
  const names = q.names.map(norm).filter((n) => n.includes(" "));
  return data.employees.flatMap((e: any) => {
    const sameAddress = addresses.some(
      (a) => street(a) === street(e.address) && (!city(a) || city(a) === city(e.address)),
    );
    const on = [
      phones.includes(digits(e.phone)) ? "phone" : "",
      sameAddress ? "address" : "",
      names.includes(norm(e.name)) ? "name" : "",
    ].filter(Boolean);
    return on.length ? [{ name: e.name, role: e.role, matchedOn: on }] : [];
  });
}

// The AP inbox: the raw email and PDF exactly as they arrived (seeded ones built by scripts/build-inbox.ts).
const seedInboxDir = new URL("../../data/inbox/", import.meta.url);
const inboxDirFor = (billId: string) =>
  uploaded[billId] ? pathToFileURL(join(uploadDir, "inbox", billId) + "/") : new URL(`${billId}/`, seedInboxDir);

export function inboxFiles(billId: string): { name: string; contentType: string; bytes: number }[] {
  if (!getBill(billId)) return [];
  try {
    const dir = inboxDirFor(billId);
    return readdirSync(dir).map((name) => ({
      name,
      contentType: UPLOAD_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
      bytes: statSync(new URL(name, dir)).size,
    }));
  } catch {
    return [];
  }
}

export function inboxFile(billId: string, name: string): { contentType: string; data: Buffer } | undefined {
  const file = inboxFiles(billId).find((f) => f.name === name);
  return file && { contentType: file.contentType, data: readFileSync(new URL(file.name, inboxDirFor(billId))) };
}

// The CRS test persona behind a contact, matched on email or full phone. In this demo the gateway
// keeps the persona directory; in production the CRS request would carry the contact's own details.
// Also knows every CRS test persona's own email and phone, so an uploaded bill can name any of them.
const crsTestContacts = Object.entries(
  JSON.parse(readFileSync(new URL("../integrations/crs/allowlist.json", import.meta.url), "utf8")).personas as Record<string, any>,
).map(([id, p]) => ({ crsPersona: id, email: p.requests.fraud_finder?.body?.email, phone: p.requests.fraud_finder?.body?.phoneNumber }));

export function personaForContact(contact: { email?: string; phone?: string } | undefined): string | undefined {
  if (!contact) return undefined;
  const known = [
    ...Object.values(data.bills).map((b: any) => b.claimedContact),
    ...data.vendors.flatMap((v: any) => v.verifiedContacts ?? []),
    ...crsTestContacts,
  ].filter((c: any) => c?.crsPersona);
  const email = String(contact.email ?? "").toLowerCase();
  const phone = digits(String(contact.phone ?? ""));
  return known.find((c: any) => (email && c.email?.toLowerCase() === email) || (phone.length === 10 && digits(c.phone ?? "") === phone))?.crsPersona;
}

// CRS personas the bill's own people map to. A seat may only run CRS on these. For an uploaded bill the
// people come from what Intake read (pass its recorded fields as `read`).
export function personasForBill(billId: string, read?: any): string[] {
  const bill = { ...getBill(billId), ...(read ?? {}) };
  if (!getBill(billId)) return [];
  const vendors = searchVendors(bill.vendorName ?? "");
  return [
    bill.claimedContact?.crsPersona,
    personaForContact(bill.claimedContact),
    ...vendors.flatMap((v: any) => (v.verifiedContacts ?? []).map((c: any) => c.crsPersona)),
  ].filter((p): p is string => typeof p === "string");
}
