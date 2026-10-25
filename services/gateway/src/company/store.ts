// The company's systems as the seat tools see them: vendor master, bills inbox, POs, receiving log,
// contracts, employees and bank payment history. Seeded from data/company.json.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const data = JSON.parse(readFileSync(new URL("../../data/company.json", import.meta.url), "utf8"));

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp|ltd)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

export const allBills = (): Record<string, any> => data.bills;
export const getBill = (billId: string): any => data.bills[billId];
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

// The AP inbox: the raw email and PDF exactly as they arrived (built by scripts/build-inbox.ts).
const inboxDir = new URL("../../data/inbox/", import.meta.url);
const CONTENT_TYPES: Record<string, string> = { ".eml": "message/rfc822", ".pdf": "application/pdf" };

export function inboxFiles(billId: string): { name: string; contentType: string; bytes: number }[] {
  if (!getBill(billId)) return [];
  try {
    return readdirSync(new URL(`${billId}/`, inboxDir)).map((name) => ({
      name,
      contentType: CONTENT_TYPES[extname(name)] ?? "application/octet-stream",
      bytes: statSync(new URL(`${billId}/${name}`, inboxDir)).size,
    }));
  } catch {
    return [];
  }
}

export function inboxFile(billId: string, name: string): { contentType: string; data: Buffer } | undefined {
  const file = inboxFiles(billId).find((f) => f.name === name);
  return file && { contentType: file.contentType, data: readFileSync(new URL(`${billId}/${file.name}`, inboxDir)) };
}

// The CRS test persona behind a contact, matched on email or full phone. In this demo the gateway
// keeps the persona directory; in production the CRS request would carry the contact's own details.
export function personaForContact(contact: { email?: string; phone?: string } | undefined): string | undefined {
  if (!contact) return undefined;
  const known = [
    ...Object.values(data.bills).map((b: any) => b.claimedContact),
    ...data.vendors.flatMap((v: any) => v.verifiedContacts ?? []),
  ].filter((c: any) => c?.crsPersona);
  const email = String(contact.email ?? "").toLowerCase();
  const phone = digits(String(contact.phone ?? ""));
  return known.find((c: any) => (email && c.email?.toLowerCase() === email) || (phone.length === 10 && digits(c.phone ?? "") === phone))?.crsPersona;
}

// CRS personas the bill's own people map to. A seat may only run CRS on these.
export function personasForBill(billId: string): string[] {
  const bill = getBill(billId);
  if (!bill) return [];
  const vendors = searchVendors(bill.vendorName ?? "");
  return [
    bill.claimedContact?.crsPersona,
    ...vendors.flatMap((v: any) => (v.verifiedContacts ?? []).map((c: any) => c.crsPersona)),
  ].filter((p): p is string => typeof p === "string");
}
