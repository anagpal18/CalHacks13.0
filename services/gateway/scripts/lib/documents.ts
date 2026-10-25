// Real documents for the AP inbox: a hand-written single-page PDF invoice (uncompressed, so any PDF
// reader or text extractor can open it) and an .eml email with headers and the PDF attached.
// No dependencies. Used by build-inbox.ts (seeded bills) and make-upload-samples.ts (bills to upload).

type Item = { kind: "text"; x: number; y: number; size: number; bold?: boolean; text: string } | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function pdf(items: Item[]): Buffer {
  const content = items
    .map((it) =>
      it.kind === "text"
        ? `BT /${it.bold ? "F2" : "F1"} ${it.size} Tf ${it.x} ${it.y} Td (${esc(it.text)}) Tj ET`
        : `0.6 w ${it.x1} ${it.y1} m ${it.x2} ${it.y2} l S`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const t = (x: number, y: number, size: number, text: string, bold = false): Item => ({ kind: "text", x, y, size, text, bold });
const rule = (y: number): Item => ({ kind: "line", x1: 50, y1: y, x2: 562, y2: y });
const money = (s: string) => `$${Number(s).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export interface Letterhead {
  // "boxy": all-caps header with a remit-to block. "letter": a plain letter-style invoice.
  layout: "boxy" | "letter";
  title: string;
  subtitle: string;
  // Lines printed under the totals: where to pay.
  remit: { heading?: string; lines: string[] };
}

// Real vendors never format bills the same way, so there are two layouts.
export function invoicePdf(bill: any, head: Letterhead): Buffer {
  const lines = bill.lineItems.map((l: any) => ({ ...l, amount: (l.quantity * Number(l.unitPrice)).toFixed(2) }));
  if (head.layout === "boxy") {
    return pdf([
      t(50, 740, 20, head.title, true),
      t(50, 722, 9, head.subtitle),
      t(400, 740, 16, "INVOICE", true),
      t(400, 722, 10, `Invoice #: ${bill.invoiceNumber}`),
      t(400, 708, 10, `Date: ${bill.invoiceDate}`),
      t(400, 694, 10, `Customer PO: ${bill.poNumber}`),
      rule(680),
      t(50, 662, 10, "Bill To: Bayline Construction Co., Accounts Payable", true),
      t(50, 648, 10, "Terms: " + bill.terms.toUpperCase()),
      rule(630),
      t(50, 614, 10, "Description", true),
      t(330, 614, 10, "Qty", true),
      t(390, 614, 10, "Unit Price", true),
      t(480, 614, 10, "Amount", true),
      ...lines.flatMap((l: any, i: number) => [
        t(50, 596 - i * 16, 10, l.description),
        t(330, 596 - i * 16, 10, String(l.quantity)),
        t(390, 596 - i * 16, 10, money(l.unitPrice)),
        t(480, 596 - i * 16, 10, money(l.amount)),
      ]),
      rule(560),
      t(390, 542, 12, "AMOUNT DUE", true),
      t(480, 542, 12, money(bill.totalAmount), true),
      ...(head.remit.heading ? [t(50, 500, 11, head.remit.heading, true)] : []),
      ...head.remit.lines.map((line, i) => t(50, 484 - i * 14, 10, line)),
      t(50, 440, 9, `Questions? Contact ${bill.claimedContact.name}, ${bill.claimedContact.phone}, ${bill.claimedContact.email}`),
    ]);
  }
  return pdf([
    t(50, 740, 15, head.title, true),
    t(50, 724, 9, head.subtitle),
    t(50, 690, 11, `Invoice ${bill.invoiceNumber}`, true),
    t(50, 674, 10, `Issued ${bill.invoiceDate}  -  Your PO ${bill.poNumber}  -  Payment terms: ${bill.terms}`),
    t(50, 646, 10, "For: Bayline Construction Co."),
    rule(632),
    ...lines.flatMap((l: any, i: number) => [
      t(50, 614 - i * 16, 10, `${l.quantity} x ${l.description} @ ${money(l.unitPrice)}`),
      t(470, 614 - i * 16, 10, money(l.amount)),
    ]),
    rule(590),
    t(380, 572, 11, `Total ${money(bill.totalAmount)}`, true),
    ...head.remit.lines.map((line, i) => t(50, 536 - i * 16, 10, line)),
    t(50, 520 - (head.remit.lines.length - 1) * 16, 10, `Thank you, ${bill.claimedContact.name} (${bill.claimedContact.email})`),
  ]);
}

export interface MailAuth {
  fromName: string;
  spf: string;
  dkim: string;
  dmarc: string;
  replyTo?: string;
  ip: string;
}

export function email(bill: any, attachment: { name: string; data: Buffer }, auth: MailAuth): string {
  const domain = bill.from.split("@")[1];
  const boundary = `bp-${bill.billId}`;
  const date = new Date(bill.receivedAt).toUTCString().replace("GMT", "+0000");
  const b64 = attachment.data.toString("base64").replace(/.{76}/g, "$&\r\n");
  return [
    `Return-Path: <bounce@${domain}>`,
    `Received: from mail.${domain} ([${auth.ip}]) by mx.bayline.example with ESMTPS; ${date}`,
    `Authentication-Results: mx.bayline.example; spf=${auth.spf} smtp.mailfrom=${domain}; dkim=${auth.dkim} header.d=${domain}; dmarc=${auth.dmarc} header.from=${domain}`,
    `From: "${auth.fromName}" <${bill.from}>`,
    ...(auth.replyTo ? [`Reply-To: <${auth.replyTo}>`] : []),
    "To: <ap@bayline.example>",
    `Subject: ${bill.subject}`,
    `Date: ${date}`,
    `Message-ID: <${bill.billId.toLowerCase()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    bill.body,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachment.name}"`,
    `Content-Disposition: attachment; filename="${attachment.name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
