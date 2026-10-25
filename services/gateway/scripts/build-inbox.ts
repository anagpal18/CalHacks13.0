// Builds the AP inbox for every seeded bill: a real email (.eml, with headers and the PDF attached)
// and a real PDF invoice per bill, from the answer key in data/company.json.
// Usage: corepack pnpm inbox:build
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { searchVendors } from "../src/company/store.ts";
import { email, invoicePdf, type Letterhead, type MailAuth } from "./lib/documents.ts";

const company = JSON.parse(readFileSync(new URL("../data/company.json", import.meta.url), "utf8"));
const inboxDir = new URL("../data/inbox/", import.meta.url);

const plan: Record<string, { head: (bill: any) => Letterhead; auth: MailAuth }> = {
  "B-2026-10-0143": {
    head: (bill) => ({
      layout: "boxy",
      title: "OKAFOR ELECTRIC",
      subtitle: "Commercial & Industrial Electrical  |  Lic. C-10 #884120",
      remit: { heading: "REMIT TO (UPDATED - USE THIS ACCOUNT ONLY)", lines: ["First Coastal Bank  |  Routing 121000358", `Account: ****${bill.bankAccountLast4}`] },
    }),
    auth: { fromName: "Okafor Electric Billing", spf: "fail", dkim: "none", dmarc: "fail", replyTo: "kb.9921x@example.com", ip: "203.0.113.77" },
  },
  "B-2026-10-0144": {
    head: (bill) => ({
      layout: "letter",
      title: "Okafor Electric LLC",
      subtitle: "1180 Mission St, San Francisco, CA  -  (555) 010-1001",
      remit: { lines: [`Pay by ACH to our account on file, ending ${bill.bankAccountLast4}.`] },
    }),
    auth: { fromName: "Okafor Electric Billing", spf: "pass", dkim: "pass", dmarc: "pass", ip: "198.51.100.24" },
  },
};

// Every other seeded bill is drawn from the vendor master: a sender on the vendor's own domain passes
// SPF, DKIM and DMARC; a lookalike domain fails them; a vendor not on file has no DKIM or DMARC.
// A bill whose account is not the one on file prints a new remit-to block, the way a scam would.
const BANKS = ["First Coastal Bank  |  Routing 121000358", "Pacific Western Credit Union  |  Routing 321081669", "Lakeview National Bank  |  Routing 071000013"];
const domainOf = (address: string) => String(address ?? "").split("@")[1]?.toLowerCase() ?? "";

function defaultPlan(bill: any): { head: (bill: any) => Letterhead; auth: MailAuth } {
  const vendor = searchVendors(bill.vendorName)[0];
  const contact = vendor?.verifiedContacts?.[0] ?? bill.claimedContact;
  const n = Number(bill.billId.split("-").at(-1));
  const onFile = vendor?.verifiedBankLast4 === bill.bankAccountLast4;
  const ownDomain = vendor?.verifiedContacts?.some((c: any) => domainOf(c.email) === domainOf(bill.from));
  const subtitle = vendor ? `${vendor.address}  -  ${contact.phone}` : `Owner: ${bill.claimedContact.name}  |  ${bill.claimedContact.phone}`;
  const head = (): Letterhead =>
    onFile
      ? { layout: n % 2 ? "letter" : "boxy", title: n % 2 ? bill.vendorName : bill.vendorName.toUpperCase(), subtitle, remit: { lines: [`Pay by ACH to our account on file, ending ${bill.bankAccountLast4}.`] } }
      : { layout: "boxy", title: bill.vendorName.toUpperCase(), subtitle, remit: { heading: vendor ? "REMIT TO (NEW ACCOUNT)" : "REMIT TO", lines: [BANKS[n % BANKS.length], `Account: ****${bill.bankAccountLast4}`] } };
  const fromName = bill.claimedContact.name === "Accounts Receivable" ? `${bill.vendorName} Billing` : bill.claimedContact.name;
  const auth: MailAuth = !vendor
    ? { fromName, spf: "pass", dkim: "none", dmarc: "none", ip: `203.0.113.${100 + (n % 100)}` }
    : ownDomain
      ? { fromName, spf: "pass", dkim: "pass", dmarc: "pass", ip: `198.51.100.${100 + (n % 100)}` }
      : { fromName, spf: "fail", dkim: "none", dmarc: "fail", replyTo: bill.claimedContact.email !== bill.from ? bill.claimedContact.email : undefined, ip: `203.0.113.${100 + (n % 100)}` };
  return { head, auth };
}

for (const billId of Object.keys(company.bills)) {
  const { head, auth } = plan[billId] ?? defaultPlan(company.bills[billId]);
  const bill = company.bills[billId];
  const dir = new URL(`${billId}/`, inboxDir);
  mkdirSync(dir, { recursive: true });
  const name = `${bill.invoiceNumber}.pdf`;
  const data = invoicePdf(bill, head(bill));
  writeFileSync(new URL(name, dir), data);
  writeFileSync(new URL("email.eml", dir), email(bill, { name, data }, auth));
  console.log(`${billId}: email.eml + ${name} (${head(bill).layout} layout, ${data.length} bytes)`);
}
