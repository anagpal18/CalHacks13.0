// Sets up our bank in Nessie. Safe to re-run: skips anything already in the account directory.
//   pnpm nessie:seed
//
// Creates: company customer + operating account (with opening balance),
//          one customer + payee account per vendor,
//          past payments, so duplicate checks and "where did money go" have history.

import {
  loadNessieAccountDirectory,
  saveNessieAccountDirectory,
} from "../src/integrations/nessie/nessieAccountDirectory.js";
import type { NessieAddress } from "../src/integrations/nessie/nessieApiTypes.js";
import { nessieHttpClient } from "../src/integrations/nessie/nessieHttpClient.js";
import { centsToNessieDollars } from "../src/integrations/nessie/nessieMoney.js";
import { decodePaymentMemo, encodePaymentMemo } from "../src/integrations/nessie/paymentMemo.js";
import {
  COMPANY_NAME,
  COMPANY_OPENING_BALANCE_CENTS,
  SAMPLE_PAST_PAYMENTS_FOR_SEEDING,
  SAMPLE_VENDORS_FOR_SEEDING,
} from "../src/integrations/nessie/seedData.js";

const PLACEHOLDER_ADDRESS: NessieAddress = {
  street_number: "1200",
  street_name: "Harbor Way",
  city: "Oakland",
  state: "CA",
  zip: "94607",
};
const SEED_PAYMENT_RUN_ID = "RUN-SEED-HISTORY";

const directory = loadNessieAccountDirectory();

if (!directory.company) {
  const companyCustomer = await nessieHttpClient.createCustomer({
    first_name: COMPANY_NAME.firstName,
    last_name: COMPANY_NAME.lastName,
    address: PLACEHOLDER_ADDRESS,
  });
  const operatingAccount = await nessieHttpClient.createAccount(companyCustomer._id, {
    type: "Checking",
    nickname: "Ridgeline Operating",
    rewards: 0,
    balance: centsToNessieDollars(COMPANY_OPENING_BALANCE_CENTS),
  });
  directory.company = { nessieCustomerId: companyCustomer._id, operatingAccountId: operatingAccount._id };
  saveNessieAccountDirectory(directory);
  console.log(`Created company operating account ${operatingAccount._id}`);
}

for (const vendor of SAMPLE_VENDORS_FOR_SEEDING) {
  if (directory.vendorsById[vendor.vendorId]) continue;
  const vendorCustomer = await nessieHttpClient.createCustomer({
    first_name: vendor.vendorName,
    last_name: vendor.vendorId,
    address: PLACEHOLDER_ADDRESS,
  });
  const payeeAccount = await nessieHttpClient.createAccount(vendorCustomer._id, {
    type: "Checking",
    nickname: `${vendor.vendorName} Payee`,
    rewards: 0,
    balance: 0,
  });
  directory.vendorsById[vendor.vendorId] = {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    nessieCustomerId: vendorCustomer._id,
    verifiedPayeeAccountId: payeeAccount._id,
  };
  saveNessieAccountDirectory(directory);
  console.log(`Created payee account for ${vendor.vendorName}`);
}

const operatingAccountId = directory.company.operatingAccountId;
const alreadySeededBillIds = new Set(
  (await nessieHttpClient.listTransfersFromAccount(operatingAccountId))
    .map((transfer) => decodePaymentMemo(transfer.description)?.billId)
    .filter(Boolean),
);

for (const pastPayment of SAMPLE_PAST_PAYMENTS_FOR_SEEDING) {
  if (alreadySeededBillIds.has(pastPayment.billId)) continue;
  await nessieHttpClient.createTransferFromAccount(operatingAccountId, {
    amount: centsToNessieDollars(pastPayment.amountCents),
    transaction_date: pastPayment.paidOn,
    status: "completed",
    description: encodePaymentMemo({
      billId: pastPayment.billId,
      vendorId: pastPayment.vendorId,
      payeeAccountId: directory.vendorsById[pastPayment.vendorId].verifiedPayeeAccountId,
      paymentRunId: SEED_PAYMENT_RUN_ID,
    }),
  });
  console.log(`Seeded past payment ${pastPayment.billId}`);
}

console.log("Nessie bank is seeded.");
