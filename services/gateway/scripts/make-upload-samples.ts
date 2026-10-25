// Writes invoices you can upload with "Add a bill" on the dashboard: each folder holds an email (.eml,
// with the PDF attached) and the PDF itself. Upload one or both files of a folder.
// Usage: corepack pnpm --filter @bursar/gateway samples:build
import { mkdirSync, writeFileSync } from "node:fs";
import { email, invoicePdf, type Letterhead, type MailAuth } from "./lib/documents.ts";

const outDir = new URL("../../../samples/upload-me/", import.meta.url);

const samples: { folder: string; what: string; bill: any; head: Letterhead; auth: MailAuth }[] = [
  {
    folder: "1-bay-lumber-price-creep",
    what: "A known vendor bills $6.85 a stud against a PO price of $6.40 (contract tolerance 1%). Expect: order fails, the rest pass.",
    bill: {
      billId: "SAMPLE-BL",
      receivedAt: "2026-10-24T15:10:00Z",
      from: "ar@baylumber.com",
      subject: "Invoice BL-55231 - studs for Site 2",
      body: "Hello, please find attached invoice BL-55231 for the 2x4 studs delivered to Site 2 under PO-5602. Payment to our account on file. Thank you, Bay Lumber Accounts Receivable",
      vendorName: "Bay Lumber Supply Inc",
      invoiceNumber: "BL-55231",
      invoiceDate: "2026-10-24",
      poNumber: "PO-5602",
      terms: "Net 30",
      bankAccountLast4: "0071",
      lineItems: [{ description: "2x4x8 SPF studs, Site 2", quantity: 400, unitPrice: "6.85" }],
      totalAmount: "2740.00",
      claimedContact: { name: "Accounts Receivable", email: "ar@baylumber.com", phone: "(555) 010-2044" },
    },
    head: {
      layout: "letter",
      title: "Bay Lumber Supply Inc",
      subtitle: "2200 Cesar Chavez St, San Francisco, CA  -  (555) 010-2044",
      remit: { lines: ["Remit by ACH to the account on file ending 0071."] },
    },
    auth: { fromName: "Bay Lumber Accounts Receivable", spf: "pass", dkim: "pass", dmarc: "pass", ip: "198.51.100.44" },
  },
  {
    folder: "2-ghost-vendor-pettigrew",
    what: "A vendor that is not in the vendor master sends its first bill. Its owner is CRS test persona P14, whose SSN is flagged deceased. Expect: vendor fails, no PO or delivery on file.",
    bill: {
      billId: "SAMPLE-PGT",
      receivedAt: "2026-10-24T18:30:00Z",
      from: "harold.pettigrew@example.com",
      subject: "First invoice - Pettigrew Site Supply - PGT-001",
      body: "Hi, we are a new supplier for your Dayton sites. Attached is our first invoice for site cleanup and fencing. Please set us up as a vendor and pay to the account on the invoice. Harold Pettigrew, Owner",
      vendorName: "Pettigrew Site Supply",
      invoiceNumber: "PGT-001",
      invoiceDate: "2026-10-24",
      poNumber: "PO-5609",
      terms: "Due on receipt",
      bankAccountLast4: "4410",
      lineItems: [
        { description: "Site cleanup crew, 5 days", quantity: 5, unitPrice: "2950.00" },
        { description: "Temporary fencing rental", quantity: 1, unitPrice: "8000.00" },
      ],
      totalAmount: "22750.00",
      claimedContact: { name: "Harold Pettigrew", email: "harold.pettigrew@example.com", phone: "(555) 010-1014" },
    },
    head: {
      layout: "boxy",
      title: "PETTIGREW SITE SUPPLY",
      subtitle: "310 Elm St, Dayton, OH  |  Owner: Harold Pettigrew",
      remit: { heading: "REMIT TO", lines: ["Midwest Community Bank  |  Routing 042000314", "Account: ****4410"] },
    },
    auth: { fromName: "Harold Pettigrew", spf: "pass", dkim: "none", dmarc: "none", ip: "203.0.113.24" },
  },
];

for (const s of samples) {
  const dir = new URL(`${s.folder}/`, outDir);
  mkdirSync(dir, { recursive: true });
  const name = `${s.bill.invoiceNumber}.pdf`;
  const data = invoicePdf(s.bill, s.head);
  writeFileSync(new URL(name, dir), data);
  writeFileSync(new URL("email.eml", dir), email(s.bill, { name, data }, s.auth));
  writeFileSync(new URL("ABOUT.txt", dir), `${s.what}\n`);
  console.log(`${s.folder}: email.eml + ${name}`);
}
