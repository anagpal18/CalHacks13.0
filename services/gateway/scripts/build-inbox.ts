// Builds the AP inbox for the seeded demo bills: a real email (.eml, with headers and the PDF attached)
// and a real PDF invoice per bill, from the answer key in data/company.json.
// Usage: corepack pnpm inbox:build
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

for (const [billId, { head, auth }] of Object.entries(plan)) {
  const bill = company.bills[billId];
  const dir = new URL(`${billId}/`, inboxDir);
  mkdirSync(dir, { recursive: true });
  const name = `${bill.invoiceNumber}.pdf`;
  const data = invoicePdf(bill, head(bill));
  writeFileSync(new URL(name, dir), data);
  writeFileSync(new URL("email.eml", dir), email(bill, { name, data }, auth));
  console.log(`${billId}: email.eml + ${name} (${head(bill).layout} layout, ${data.length} bytes)`);
}
