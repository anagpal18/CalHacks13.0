// Smoke test for the bank layer. Run after seeding:
//   pnpm nessie:check
// Prints balance and history through the same BankService the agents use. Moves no money.

import { environment } from "../src/config/environment.js";
import { getBankService } from "../src/integrations/nessie/index.js";
import { SAMPLE_VENDORS_FOR_SEEDING } from "../src/integrations/nessie/seedData.js";

const bankService = getBankService();
const formatDollars = (amountCents: number) => `$${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

console.log(`Mode: ${environment.NESSIE_MODE}`);
console.log(`Operating balance: ${formatDollars(await bankService.getOperatingBalanceCents())}`);

for (const vendor of SAMPLE_VENDORS_FOR_SEEDING) {
  const paymentHistory = await bankService.getPaymentHistory(vendor.vendorId);
  const paymentSummary = paymentHistory.map((payment) => `${payment.billId} ${formatDollars(payment.amountCents)}`).join(", ");
  console.log(`${vendor.vendorName}: ${paymentHistory.length} past payment(s) ${paymentSummary}`);
}

const duplicateCheck = await bankService.findPaymentsForBill("INV-1043");
console.log(`INV-1043 already paid? ${duplicateCheck.length > 0 ? "YES" : "no"}`);
